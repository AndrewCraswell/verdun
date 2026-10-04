// Packs the level kit into the encrypted runtime asset pack that production builds ship.
//
// Paid assets never ship raw (docs/assets/licensing.md): this script takes every file under the level kit directory
// that scripts/build-level-kit.py writes, encrypts each one with AES-256-GCM under a fresh random key, and writes them
// into one custom binary container. The client decrypts it in a Web Worker (apps/client/src/assets/).
//
// Container layout, little-endian:
//   0   8  magic: 0x8E "VDNPK" 0x0D 0x0A
//   8   2  format version (1)
//   10  2  reserved, zero
//   12  4  byte length of the encrypted index, including its 16-byte GCM tag
//   16  12 index IV
//   28  4  reserved, zero
//   32  .. encrypted index: JSON [{ path, offset, length, iv }], authenticated with the 32 header bytes as AAD
//   ..  .. payloads: each file encrypted under its own IV with its path as AAD. An entry's offset counts from the end of
//          the index, its length includes the tag, and its iv is base64.
//
// Writes <out>/level.pack and <out>/level.key.json ({ version, key }: the base64 raw key). Both are git-ignored and
// must never be committed. The client build (apps/client/vite.config.ts) embeds the key and emits the pack.
//
// Usage: node scripts/build-asset-pack.mjs [kit dir] [out dir]   (defaults: .asset-cache/level .asset-cache/pack)

import { createCipheriv, randomBytes } from "node:crypto"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"

/** Writes a line of the report. */
const print = (line) =>
  process.stdout.write(`${line}
`)

const kitDir = process.argv[2] ?? ".asset-cache/level"
const outDir = process.argv[3] ?? ".asset-cache/pack"

const MAGIC = Buffer.from([0x8e, 0x56, 0x44, 0x4e, 0x50, 0x4b, 0x0d, 0x0a])
const VERSION = 1
const HEADER_BYTES = 32
const IV_BYTES = 12
const TAG_BYTES = 16

/** AES-256-GCM: the ciphertext with its tag appended, which is the layout WebCrypto's decrypt expects. */
function encrypt(key, iv, plaintext, aad) {
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG_BYTES })
  cipher.setAAD(aad)
  return Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
}

/** Every file under `dir`, as forward-slash paths relative to it, sorted so packs are laid out the same each run. */
async function listFiles(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort()
}

const paths = await listFiles(kitDir)
if (paths.length === 0) {
  throw new Error(`${kitDir} has no files: build the level kit first (docs/level-design.md)`)
}

const key = randomBytes(32)
const payloads = await Promise.all(
  paths.map(async (path) => {
    const iv = randomBytes(IV_BYTES)
    return { path, iv, data: encrypt(key, iv, await readFile(join(kitDir, path)), Buffer.from(path, "utf8")) }
  })
)

let offset = 0
const entries = payloads.map(({ path, iv, data }) => {
  const entry = { path, offset, length: data.length, iv: iv.toString("base64") }
  offset += data.length
  return entry
})
const indexPlain = Buffer.from(JSON.stringify(entries), "utf8")

const header = Buffer.alloc(HEADER_BYTES)
MAGIC.copy(header, 0)
header.writeUInt16LE(VERSION, 8)
header.writeUInt32LE(indexPlain.length + TAG_BYTES, 12)
const indexIv = randomBytes(IV_BYTES)
indexIv.copy(header, 16)
const index = encrypt(key, indexIv, indexPlain, header)

await mkdir(outDir, { recursive: true })
const pack = Buffer.concat([header, index, ...payloads.map(({ data }) => data)])
await writeFile(join(outDir, "level.pack"), pack)
await writeFile(
  join(outDir, "level.key.json"),
  `${JSON.stringify({ version: VERSION, key: key.toString("base64") })}\n`
)

print(`Packed ${paths.length} files (${(pack.length / 2 ** 20).toFixed(1)} MiB) into ${join(outDir, "level.pack")}`)
