/**
 * Reads the encrypted runtime asset pack that scripts/build-asset-pack.mjs writes. The layout is documented there and in
 * docs/level-design.md. Uses only WebCrypto, so it runs in the pack worker and in Node tests alike.
 */

const MAGIC = [0x8e, 0x56, 0x44, 0x4e, 0x50, 0x4b, 0x0d, 0x0a]
const VERSION = 1
const HEADER_BYTES = 32
const IV_BYTES = 12
const KEY_BYTES = 32

/** An opened pack: its index is decrypted, its files are decrypted one by one on demand. */
export interface AssetPack {
  /** Every path in the pack, such as "kit.glb" or "fx/smoke.png". */
  readonly paths: readonly string[]
  /** Decrypts one file. Rejects for a path the pack doesn't hold, or a file that fails authentication. */
  read(path: string): Promise<ArrayBuffer>
}

interface PackEntry {
  readonly offset: number
  readonly length: number
  readonly iv: Uint8Array<ArrayBuffer>
}

interface RawEntry {
  path: string
  offset: number
  length: number
  iv: string
}

function isRawEntry(value: unknown): value is RawEntry {
  return (
    typeof value === "object" &&
    value !== null &&
    "path" in value &&
    typeof value.path === "string" &&
    "offset" in value &&
    Number.isSafeInteger(value.offset) &&
    "length" in value &&
    Number.isSafeInteger(value.length) &&
    "iv" in value &&
    typeof value.iv === "string"
  )
}

/** Decodes base64, as the pack's IVs and key are stored. */
export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function decrypt(
  key: CryptoKey,
  iv: Uint8Array<ArrayBuffer>,
  data: Uint8Array<ArrayBuffer>,
  additionalData: Uint8Array<ArrayBuffer>,
  what: string
): Promise<ArrayBuffer> {
  try {
    return await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData }, key, data)
  } catch {
    throw new Error(`asset pack: ${what} failed to decrypt`)
  }
}

/**
 * Opens a pack from its bytes and its base64 raw key. Rejects when the bytes aren't a pack of this version, or when the
 * key doesn't match or the header or index was altered.
 */
export async function openAssetPack(pack: ArrayBuffer, base64Key: string): Promise<AssetPack> {
  const bytes = new Uint8Array(pack)
  const view = new DataView(pack)
  if (bytes.length < HEADER_BYTES || MAGIC.some((byte, i) => bytes[i] !== byte)) {
    throw new Error("asset pack: not an asset pack")
  }
  const version = view.getUint16(8, true)
  if (version !== VERSION) {
    throw new Error(`asset pack: version ${version} is not supported`)
  }
  const indexLength = view.getUint32(12, true)
  const payloadStart = HEADER_BYTES + indexLength
  if (payloadStart > bytes.length) {
    throw new Error("asset pack: truncated")
  }

  const rawKey = fromBase64(base64Key)
  if (rawKey.length !== KEY_BYTES) {
    throw new Error("asset pack: the key is not 256 bits")
  }
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"])
  const index = await decrypt(
    key,
    bytes.slice(16, 16 + IV_BYTES),
    bytes.slice(HEADER_BYTES, payloadStart),
    bytes.slice(0, HEADER_BYTES),
    "the index"
  )

  const parsed: unknown = JSON.parse(new TextDecoder().decode(index))
  if (!Array.isArray(parsed) || !parsed.every(isRawEntry)) {
    throw new Error("asset pack: malformed index")
  }
  const entries = new Map<string, PackEntry>()
  for (const { path, offset, length, iv } of parsed) {
    if (payloadStart + offset + length > bytes.length) {
      throw new Error(`asset pack: ${path} lies past the end of the pack`)
    }
    entries.set(path, { offset: payloadStart + offset, length, iv: fromBase64(iv) })
  }

  const encoder = new TextEncoder()
  return {
    paths: [...entries.keys()],
    async read(path) {
      const entry = entries.get(path)
      if (!entry) {
        throw new Error(`asset pack: no file ${path}`)
      }
      const data = bytes.subarray(entry.offset, entry.offset + entry.length)
      return decrypt(key, entry.iv, data, encoder.encode(path), path)
    }
  }
}
