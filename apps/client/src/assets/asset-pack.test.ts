import { beforeAll, describe, expect, it } from "vitest"
import { arrivingPack, fromBase64, openAssetPack } from "./asset-pack.ts"
import { buildTestPack, TEST_KIT, type TestPack } from "./test-pack.ts"

let built: TestPack

beforeAll(() => {
  built = buildTestPack()
})

/** A copy of the built pack with one byte flipped. */
function flipped(at: number): ArrayBuffer {
  const bytes = new Uint8Array(built.pack.slice(0))
  bytes[at < 0 ? bytes.length + at : at]! ^= 0x01
  return bytes.buffer
}

function indexLength(pack: ArrayBuffer): number {
  return new DataView(pack).getUint32(12, true)
}

/** A pack sealed by hand around any index, for indexes the pack script never writes. */
async function sealed(index: string, payloads = new Uint8Array(0)): Promise<ArrayBuffer> {
  const raw = new Uint8Array(32).fill(7)
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"])
  const header = new Uint8Array(32)
  header.set([0x8e, 0x56, 0x44, 0x4e, 0x50, 0x4b, 0x0d, 0x0a])
  const plain = new TextEncoder().encode(index)
  const iv = new Uint8Array(12).fill(3)
  new DataView(header.buffer).setUint16(8, 1, true)
  new DataView(header.buffer).setUint32(12, plain.length + 16, true)
  header.set(iv, 16)
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: header }, key, plain)
  )
  const pack = new Uint8Array(header.length + encrypted.length + payloads.length)
  pack.set(header)
  pack.set(encrypted, header.length)
  pack.set(payloads, header.length + encrypted.length)
  return pack.buffer
}

const SEALED_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)))

/** The built pack as a download: all but its last `held` bytes at once, then the rest or a failure when asked. */
function download(held: number) {
  const cut = built.pack.byteLength - held
  let source: ReadableStreamDefaultController<Uint8Array> | null = null
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      source = controller
      controller.enqueue(new Uint8Array(built.pack.slice(0, cut)))
    }
  })
  return {
    body,
    finish: () => {
      source?.enqueue(new Uint8Array(built.pack.slice(cut)))
      source?.close()
    },
    stop: () => source?.close(),
    fail: (error: Error) => source?.error(error)
  }
}

/** Whether a promise has settled after the reads ahead of it have had their turn. */
async function settled(promise: Promise<unknown>): Promise<boolean> {
  let done = false
  void promise.then(
    () => (done = true),
    () => (done = true)
  )
  await new Promise((resolve) => setTimeout(resolve, 20))
  return done
}

describe("asset pack", () => {
  it("decrypts with WebCrypto every file the pack script encrypted in Node", async () => {
    const pack = await openAssetPack(built.pack, built.key)
    expect([...pack.paths].sort()).toEqual([...TEST_KIT.keys()].sort())
    for (const [path, bytes] of TEST_KIT) {
      expect(new Uint8Array(await pack.read(path))).toEqual(bytes)
    }
  })

  it("is opaque: no paths or file contents in the clear", () => {
    const text = new TextDecoder("latin1").decode(built.pack)
    expect(text).not.toContain("kit.glb")
    expect(text).not.toContain("ground/")
    const glb = new TextDecoder("latin1").decode(TEST_KIT.get("kit.glb")!.subarray(0, 64))
    expect(text).not.toContain(glb)
  })

  it("gzips what compresses before encrypting it, and leaves what doesn't as it is", () => {
    const noise = [...TEST_KIT].filter(([path]) => path !== "soldier.glb")
    const noiseBytes = noise.reduce((total, [, bytes]) => total + bytes.length, 0)
    const soldier = TEST_KIT.get("soldier.glb")!.length
    // The pattern goes in at a fraction of its size, the noise whole, each with its 16-byte tag.
    expect(built.pack.byteLength - 32 - indexLength(built.pack)).toBeLessThan(
      noiseBytes + noise.length * 16 + soldier / 10
    )
    expect(built.pack.byteLength - 32 - indexLength(built.pack)).toBeGreaterThanOrEqual(noiseBytes + noise.length * 16)
  })

  it("lays the sounds last, and reads each file as soon as its own bytes are in", async () => {
    const { body, finish } = download(100)
    const arriving = arrivingPack(body)
    const pack = await openAssetPack(arriving, built.key)
    for (const [path, bytes] of [...TEST_KIT].filter(([name]) => !name.startsWith("sfx/"))) {
      expect(new Uint8Array(await pack.read(path))).toEqual(bytes)
    }
    const shot = pack.read("sfx/shot.ogg")
    expect(await settled(shot)).toBe(false)
    finish()
    expect(new Uint8Array(await shot)).toEqual(TEST_KIT.get("sfx/shot.ogg"))
    await expect(arriving.done).resolves.toBe(built.pack.byteLength)
  })

  it("fails the reads a download cuts short, and only those", async () => {
    const broken = download(100)
    const failing = await openAssetPack(arrivingPack(broken.body), built.key)
    const shot = failing.read("sfx/shot.ogg")
    broken.fail(new Error("connection reset"))
    await expect(shot).rejects.toThrow("connection reset")
    expect(new Uint8Array(await failing.read("kit.glb"))).toEqual(TEST_KIT.get("kit.glb"))

    const short = download(100)
    const arriving = arrivingPack(short.body)
    const ended = await openAssetPack(arriving, built.key)
    short.stop()
    await expect(ended.read("sfx/shot.ogg")).rejects.toThrow("truncated")
    await expect(arriving.done).resolves.toBe(built.pack.byteLength - 100)
  })

  it("uses a fresh key each build", () => {
    expect(buildTestPack().key).not.toBe(built.key)
    expect(fromBase64(built.key)).toHaveLength(32)
  })

  it("rejects paths it doesn't hold", async () => {
    const pack = await openAssetPack(built.pack, built.key)
    await expect(pack.read("ground/missing.png")).rejects.toThrow("no file ground/missing.png")
    await expect(pack.read("/kit.glb")).rejects.toThrow("no file")
  })

  it("rejects a tampered payload", async () => {
    const pack = await openAssetPack(flipped(-1), built.key)
    const results = await Promise.allSettled([...TEST_KIT.keys()].map((path) => pack.read(path)))
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1)
  })

  it("rejects a tampered index or header", async () => {
    await expect(openAssetPack(flipped(32 + 5), built.key)).rejects.toThrow("the index failed to decrypt")
    // The reserved header bytes are authenticated along with the rest of the header.
    await expect(openAssetPack(flipped(29), built.key)).rejects.toThrow("the index failed to decrypt")
    await expect(openAssetPack(flipped(20), built.key)).rejects.toThrow("the index failed to decrypt")
    await expect(openAssetPack(flipped(8), built.key)).rejects.toThrow("version 3 is not supported")
    await expect(openAssetPack(flipped(1), built.key)).rejects.toThrow("not an asset pack")
  })

  it("rejects the wrong key", async () => {
    const other = buildTestPack()
    await expect(openAssetPack(built.pack, other.key)).rejects.toThrow("failed to decrypt")
    await expect(openAssetPack(built.pack, btoa("short"))).rejects.toThrow("not 256 bits")
  })

  it("rejects what isn't a whole pack", async () => {
    await expect(openAssetPack(new ArrayBuffer(10), built.key)).rejects.toThrow("not an asset pack")
    const truncated = built.pack.slice(0, 32 + indexLength(built.pack) - 1)
    await expect(openAssetPack(truncated, built.key)).rejects.toThrow("truncated")
  })

  it("rejects a malformed index, or one pointing past the end", async () => {
    await expect(openAssetPack(await sealed('{"files":[]}'), SEALED_KEY)).rejects.toThrow("malformed index")
    await expect(openAssetPack(await sealed('[{"path":"a"}]'), SEALED_KEY)).rejects.toThrow("malformed index")
    const beyond = '[{"path":"a","offset":0,"length":17,"iv":"AAAAAAAAAAAAAAAA"}]'
    await expect(openAssetPack(await sealed(beyond, new Uint8Array(16)), SEALED_KEY)).rejects.toThrow(
      "a lies past the end"
    )
    const unknown = '[{"path":"a","offset":0,"length":16,"iv":"AAAAAAAAAAAAAAAA","encoding":"zstd"}]'
    await expect(openAssetPack(await sealed(unknown, new Uint8Array(16)), SEALED_KEY)).rejects.toThrow(
      "malformed index"
    )
    const empty = await openAssetPack(await sealed("[]"), SEALED_KEY)
    expect(empty.paths).toEqual([])
  })
})
