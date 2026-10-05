/**
 * Reads the encrypted runtime asset pack that scripts/build-asset-pack.mjs writes. The layout is documented there and in
 * docs/level-design.md. Uses only WebCrypto and the Compression Streams API, so it runs in the pack worker and in Node
 * tests alike.
 */

const MAGIC = [0x8e, 0x56, 0x44, 0x4e, 0x50, 0x4b, 0x0d, 0x0a]
/** Version 2 added the entries' encoding: files gzipped before they were encrypted. Version 1 packs read as before. */
const VERSIONS = [1, 2]
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
  readonly gzipped: boolean
}

interface RawEntry {
  path: string
  offset: number
  length: number
  iv: string
  encoding?: "gzip"
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
    typeof value.iv === "string" &&
    (!("encoding" in value) || value.encoding === "gzip")
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

/** Inflates a file the pack script gzipped before encrypting it. */
async function gunzip(data: ArrayBuffer): Promise<ArrayBuffer> {
  return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()
}

/**
 * A pack's bytes, whole or still downloading. `slice` resolves with bytes `start` to `end` once they're in, and rejects
 * if the pack ends first. `length` is the whole pack's, when it's known before it has all arrived.
 */
export interface PackBytes {
  readonly length?: number
  slice(start: number, end: number): Promise<Uint8Array<ArrayBuffer>>
}

/** A pack already whole in memory. */
function wholePack(pack: ArrayBuffer): PackBytes {
  const bytes = new Uint8Array(pack)
  return {
    length: bytes.length,
    async slice(start, end) {
      if (end > bytes.length) {
        throw new Error("asset pack: truncated")
      }
      return bytes.subarray(start, end)
    }
  }
}

/**
 * A pack as it downloads from `body`: each chunk is kept as it comes, and a slice is answered as soon as its last byte
 * is in, so the files near the start of the pack can be read while the rest is still on its way. `done` resolves with
 * the pack's length once it has all arrived, or rejects with why it didn't.
 */
export function arrivingPack(body: ReadableStream<Uint8Array>): PackBytes & { readonly done: Promise<number> } {
  const chunks: Uint8Array[] = []
  let received = 0
  let ended = false
  let failure: Error | null = null
  const waiting: (() => boolean)[] = []
  const wake = () => {
    for (let index = waiting.length - 1; index >= 0; index--) {
      if (waiting[index]?.()) {
        waiting.splice(index, 1)
      }
    }
  }
  const copy = (start: number, end: number) => {
    const out = new Uint8Array(end - start)
    let at = 0
    for (const chunk of chunks) {
      const from = Math.max(start, at)
      const to = Math.min(end, at + chunk.length)
      if (from < to) {
        out.set(chunk.subarray(from - at, to - at), from - start)
      }
      at += chunk.length
      if (at >= end) {
        break
      }
    }
    return out
  }
  const done = (async () => {
    const reader = body.getReader()
    try {
      for (let read = await reader.read(); !read.done; read = await reader.read()) {
        chunks.push(read.value)
        received += read.value.length
        wake()
      }
      return received
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error))
      throw failure
    } finally {
      ended = true
      wake()
    }
  })()
  // Each slice reports the failure; this only keeps it from being an unhandled rejection.
  done.catch(() => undefined)
  return {
    done,
    slice(start, end) {
      return new Promise((resolve, reject) => {
        const settle = () => {
          if (received >= end) {
            resolve(copy(start, end))
          } else if (ended) {
            reject(failure ?? new Error("asset pack: truncated"))
          } else {
            return false
          }
          return true
        }
        if (!settle()) {
          waiting.push(settle)
        }
      })
    }
  }
}

/**
 * Opens a pack from its bytes, whole or still arriving, and its base64 raw key. Rejects when the bytes aren't a pack of
 * this version, or when the key doesn't match or the header or index was altered. A file is read once its own bytes
 * are in.
 */
export async function openAssetPack(pack: ArrayBuffer | PackBytes, base64Key: string): Promise<AssetPack> {
  const bytes = pack instanceof ArrayBuffer ? wholePack(pack) : pack
  const known = bytes.length ?? Infinity
  if (known < HEADER_BYTES) {
    throw new Error("asset pack: not an asset pack")
  }
  const header = await bytes.slice(0, HEADER_BYTES)
  if (MAGIC.some((byte, i) => header[i] !== byte)) {
    throw new Error("asset pack: not an asset pack")
  }
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength)
  const version = view.getUint16(8, true)
  if (!VERSIONS.includes(version)) {
    throw new Error(`asset pack: version ${version} is not supported`)
  }
  const indexLength = view.getUint32(12, true)
  const payloadStart = HEADER_BYTES + indexLength
  if (payloadStart > known) {
    throw new Error("asset pack: truncated")
  }

  const rawKey = fromBase64(base64Key)
  if (rawKey.length !== KEY_BYTES) {
    throw new Error("asset pack: the key is not 256 bits")
  }
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"])
  const index = await decrypt(
    key,
    header.slice(16, 16 + IV_BYTES),
    await bytes.slice(HEADER_BYTES, payloadStart),
    header,
    "the index"
  )

  const parsed: unknown = JSON.parse(new TextDecoder().decode(index))
  if (!Array.isArray(parsed) || !parsed.every(isRawEntry)) {
    throw new Error("asset pack: malformed index")
  }
  const entries = new Map<string, PackEntry>()
  for (const { path, offset, length, iv, encoding } of parsed) {
    if (payloadStart + offset + length > known) {
      throw new Error(`asset pack: ${path} lies past the end of the pack`)
    }
    entries.set(path, { offset: payloadStart + offset, length, iv: fromBase64(iv), gzipped: encoding === "gzip" })
  }

  const encoder = new TextEncoder()
  return {
    paths: [...entries.keys()],
    async read(path) {
      const entry = entries.get(path)
      if (!entry) {
        throw new Error(`asset pack: no file ${path}`)
      }
      const data = await bytes.slice(entry.offset, entry.offset + entry.length)
      const plain = await decrypt(key, entry.iv, data, encoder.encode(path), path)
      return entry.gzipped ? gunzip(plain) : plain
    }
  }
}
