// The asset library on E: holds what git doesn't: the raw purchases in vendor/ (sound libraries, Synty packs, the
// generated voices and music) and the pipeline's output in .asset-cache/ (the encrypted pack's key among it). The
// checkout keeps copies of only what's being worked on. See docs/assets/backup.md.
//
// `pnpm assets:backup` stores what's new or changed in vendor/ and .asset-cache/ in the library, such as a purchase or
// a new pack and key. `pnpm assets:fetch <path>...` copies folders or files from the library into the checkout, for
// work that needs them: `pnpm assets:fetch vendor/audio/music`. Both copy only what's new or changed (by size and
// modification time), and neither deletes anything.
//
// Usage: pnpm assets:backup [--to <folder>]
//        pnpm assets:fetch <path>... [--to <folder>]   (library: E:\Game Assets\Verdun, or VERDUN_BACKUP)

import { existsSync } from "node:fs"
import { copyFile, mkdir, readdir, stat, utimes } from "node:fs/promises"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

/** Writes a line of the report. */
const print = (line) => process.stdout.write(`${line}\n`)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
/** What the library holds, and where under it each goes. */
const SOURCES = [
  { from: "vendor", to: "vendor" },
  { from: ".asset-cache", to: "asset-cache" }
]

function library() {
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

/** Copies a file unless the target already has it at the same size and modification time; returns its bytes, or 0. */
async function copyChanged(source, target) {
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

/** Copies every new or changed file under `source`, a folder or a single file, to the same place under `target`. */
async function copyTree(source, target, label) {
  const single = (await stat(source)).isFile()
  let copied = 0
  let bytes = 0
  let kept = 0
  for await (const path of single ? [""] : files(source)) {
    const size = await copyChanged(join(source, path), join(target, path))
    if (size > 0) {
      copied++
      bytes += size
      if (copied % 500 === 0) {
        print(`  ${label}: ${copied} files, ${(bytes / 1e9).toFixed(1)} GB so far`)
      }
    } else {
      kept++
    }
  }
  return { copied, gigabytes: (bytes / 1e9).toFixed(2), kept }
}

/** Stores what's new or changed in vendor/ and .asset-cache/ in the library. */
async function store(into) {
  for (const { from, to } of SOURCES) {
    const source = join(ROOT, from)
    if (!existsSync(source)) {
      print(`${from}: nothing here to store`)
      continue
    }
    const { copied, gigabytes, kept } = await copyTree(source, join(into, to), from)
    print(`${from}: stored ${copied} files (${gigabytes} GB) in the library, ${kept} already there`)
  }
}

/** Copies `paths`, each under vendor/ or .asset-cache/, from the library into the checkout. */
async function fetchFrom(from, paths) {
  if (paths.length === 0) {
    print("Name what to fetch, such as: pnpm assets:fetch vendor/audio/music")
    process.exitCode = 1
  }
  for (const path of paths) {
    const wanted = path.replaceAll("\\", "/").replace(/\/+$/, "")
    const source = SOURCES.find(({ from: folder }) => wanted === folder || wanted.startsWith(`${folder}/`))
    if (!source) {
      print(`${path}: not under vendor/ or .asset-cache/`)
      process.exitCode = 1
      continue
    }
    const stored = join(from, source.to, wanted.slice(source.from.length))
    if (!existsSync(stored)) {
      print(`${path}: not in the library (${stored})`)
      process.exitCode = 1
      continue
    }
    const { copied, gigabytes, kept } = await copyTree(stored, join(ROOT, wanted), wanted)
    print(`${wanted}: fetched ${copied} files (${gigabytes} GB), ${kept} already here`)
  }
}

async function main() {
  const at = library()
  const drive = /^[A-Za-z]:/.exec(at)?.[0]
  if (drive && !existsSync(`${drive}\\`)) {
    print(`The library's drive ${drive} isn't connected. Plug it in, or pass --to <folder>.`)
    process.exitCode = 1
    return
  }
  const started = Date.now()
  const fetching = process.argv.indexOf("--fetch")
  if (fetching >= 0) {
    const paths = process.argv
      .slice(fetching + 1)
      .filter((arg, index, args) => arg !== "--to" && args[index - 1] !== "--to")
    await fetchFrom(at, paths)
    print(`Fetched from ${at} in ${Math.round((Date.now() - started) / 1000)} s`)
  } else {
    await store(at)
    print(`Stored in ${at} in ${Math.round((Date.now() - started) / 1000)} s`)
  }
}

await main()
