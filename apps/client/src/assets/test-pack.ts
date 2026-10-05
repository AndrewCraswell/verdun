// Test support: builds asset packs with the real pack script. Only tests import this.
import { execFileSync } from "node:child_process"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"

const SCRIPT = resolve(import.meta.dirname, "../../../../scripts/build-asset-pack.mjs")

/** Bytes that look like nothing in particular, the same each run. */
function noise(length: number, seed: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(length)
  let state = seed
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) >>> 0
    bytes[i] = state >>> 24
  }
  return bytes
}

/** Bytes that compress well, as a mesh's do: a short run of noise over and over. */
function pattern(length: number, seed: number): Uint8Array<ArrayBuffer> {
  const run = noise(64, seed)
  return Uint8Array.from({ length }, (_, i) => run[i % run.length] ?? 0)
}

/** A small stand-in for the level kit, with nested directories like the real one. */
export const TEST_KIT: ReadonlyMap<string, Uint8Array<ArrayBuffer>> = new Map([
  ["kit.glb", noise(5000, 1)],
  ["soldier.glb", pattern(20_000, 4)],
  ["ground/mud.png", noise(700, 2)],
  ["fx/smoke.png", noise(300, 3)],
  ["fx/deep/empty.bin", new Uint8Array(0)]
])

export interface TestPack {
  readonly pack: ArrayBuffer
  readonly key: string
}

/** Runs scripts/build-asset-pack.mjs over `kit` in a temporary directory and returns the pack and its key. */
export function buildTestPack(kit: ReadonlyMap<string, Uint8Array> = TEST_KIT): TestPack {
  const dir = mkdtempSync(join(tmpdir(), "verdun-pack-"))
  try {
    const kitDir = join(dir, "level")
    const outDir = join(dir, "pack")
    for (const [path, bytes] of kit) {
      const file = join(kitDir, path)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, bytes)
    }
    execFileSync(process.execPath, [SCRIPT, kitDir, outDir], { stdio: "pipe" })
    const keyFile: unknown = JSON.parse(readFileSync(join(outDir, "level.key.json"), "utf8"))
    if (typeof keyFile !== "object" || keyFile === null || !("key" in keyFile) || typeof keyFile.key !== "string") {
      throw new Error("level.key.json has no key")
    }
    return { pack: new Uint8Array(readFileSync(join(outDir, "level.pack"))).buffer, key: keyFile.key }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
