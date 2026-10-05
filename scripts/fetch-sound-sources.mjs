// Copies from the asset library just the recordings the sound build reads (a few hundred files, under 3 GB, where the
// libraries they come from are over 100 GB), so scripts/build-sound-effects.py can run on a checkout that keeps only
// what's being worked on. It asks the build itself which files it reads, resolved against the library, and fetches
// those with `pnpm assets:fetch`, which copies only what's new or changed.
//
// Usage: pnpm sound:fetch        (library: E:\Game Assets\Verdun, or VERDUN_BACKUP; Blender: BLENDER, or 5.2's usual)

import { spawnSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const LIBRARY = process.env.VERDUN_BACKUP ?? "E:\\Game Assets\\Verdun"
const BLENDER = process.env.BLENDER ?? "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe"

const listing = spawnSync(
  BLENDER,
  [
    "-b",
    "--factory-startup",
    "-P",
    join(ROOT, "scripts", "build-sound-effects.py"),
    "--",
    "--sources",
    join(LIBRARY, "vendor", "audio")
  ],
  { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
)
const sources = listing.stdout
  .split(/\r?\n/)
  .filter((line) => line.startsWith("source: "))
  .map((line) => line.slice("source: ".length))
if (listing.status !== 0 || sources.length === 0) {
  process.stderr.write(listing.stdout + listing.stderr)
  process.stderr.write("Couldn't list the sound build's sources: is the library connected, and Blender at BLENDER?\n")
  process.exit(1)
}
process.stdout.write(`The sound build reads ${sources.length} files; fetching any not here yet.\n`)
const fetched = spawnSync(process.execPath, [join(ROOT, "scripts", "backup-assets.mjs"), "--fetch", ...sources], {
  cwd: ROOT,
  stdio: "inherit"
})
process.exit(fetched.status ?? 1)
