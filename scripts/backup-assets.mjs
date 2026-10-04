// Backs up what git doesn't hold: the raw purchases in vendor/ (sound libraries, Synty packs, the generated voices and
// music) and the pipeline's output in .asset-cache/ (the encrypted pack and its key among it), to another drive, so
// losing this checkout, or this disk, loses nothing that can't be cloned or rebuilt. See docs/assets/backup.md.
//
// Copies only what's new or changed since the last run (by size and modification time) and never deletes from the
// backup: a file deleted here by mistake is still there.
//
// Usage: pnpm assets:backup [--to <folder>]   (default E:\Game Assets\Verdun, or VERDUN_BACKUP)

import { existsSync } from "node:fs"
import { copyFile, mkdir, readdir, stat, utimes } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

/** Writes a line of the report. */
const print = (line) => process.stdout.write(`${line}\n`)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
/** What to back up, and where under the backup folder each goes. */
const SOURCES = [
  { from: "vendor", to: "vendor" },
  { from: ".asset-cache", to: "asset-cache" }
]

function destination() {
  const flag = process.argv.indexOf("--to")
  if (flag >= 0 && process.argv[flag + 1]) {
    return process.argv[flag + 1]
  }
  return process.env.VERDUN_BACKUP ?? "E:\\Game Assets\\Verdun"
}

/** Every file under a folder, as paths relative to it. */
async function* files(folder, under = folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      yield* files(path, under)
    } else if (entry.isFile()) {
      yield relative(under, path)
    }
  }
}

/** Copies a file unless the backup already has it at the same size and modification time; returns its bytes, or 0. */
async function backUp(source, target) {
  const from = await stat(source)
  const to = await stat(target).catch(() => null)
  if (to && to.size === from.size && Math.abs(to.mtimeMs - from.mtimeMs) < 2_000) {
    return 0
  }
  await mkdir(dirname(target), { recursive: true })
  await copyFile(source, target)
  await utimes(target, from.atime, from.mtime)
  return from.size
}

async function main() {
  const into = destination()
  const drive = /^[A-Za-z]:/.exec(into)?.[0]
  if (drive && !existsSync(`${drive}\\`)) {
    print(`The backup drive ${drive} isn't connected. Plug it in, or pass --to <folder>.`)
    process.exitCode = 1
    return
  }
  const started = Date.now()
  for (const { from, to } of SOURCES) {
    const source = join(ROOT, from)
    if (!existsSync(source)) {
      print(`${from}: nothing here to back up`)
      continue
    }
    let copied = 0
    let bytes = 0
    let kept = 0
    for await (const path of files(source)) {
      const size = await backUp(join(source, path), join(into, to, path))
      if (size > 0) {
        copied++
        bytes += size
        if (copied % 500 === 0) {
          print(`  ${from}: ${copied} files, ${(bytes / 1e9).toFixed(1)} GB so far`)
        }
      } else {
        kept++
      }
    }
    print(`${from}: copied ${copied} files (${(bytes / 1e9).toFixed(2)} GB), ${kept} already backed up`)
  }
  print(`Backed up to ${into} in ${Math.round((Date.now() - started) / 1000)} s`)
}

await main()
