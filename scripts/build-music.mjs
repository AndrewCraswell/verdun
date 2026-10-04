// Builds the soundtrack: encodes every WAV master in vendor/audio/music to stereo Opus, levelled to one loudness, under
// .asset-cache/music/<slug>.ogg, with music.json listing the slugs. The client streams them from there (vite.config.ts
// serves them in dev and copies them into a build). The music is our own work, so it ships raw, outside the encrypted
// pack. Needs ffmpeg on the PATH, or its path in FFMPEG.
//
// Usage: pnpm sound:music [masters dir] [out dir]   (defaults: vendor/audio/music .asset-cache/music)

import { execFile } from "node:child_process"
import { mkdir, readdir, rm, writeFile } from "node:fs/promises"
import { basename, dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

const run = promisify(execFile)
const print = (line) => process.stdout.write(`${line}\n`)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const mastersDir = process.argv[2] ?? join(ROOT, "vendor/audio/music")
const outDir = process.argv[3] ?? join(ROOT, ".asset-cache/music")
const ffmpeg = process.env.FFMPEG ?? "ffmpeg"

/** Integrated loudness every track is levelled to, and the ceiling its peaks stay under. */
const LOUDNESS = -20
const TRUE_PEAK = -1.5
/** Stereo Opus at this rate is transparent for most music, about 1 MB a minute. */
const BITRATE = "112k"

/** "The Unresolved Drum.wav" -> "the-unresolved-drum": the name the client's music model knows a track by. */
function slugOf(file) {
  return basename(file, extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

/** ffmpeg's measurement of a track, for levelling it in one linear gain rather than squashing it. */
async function measure(file) {
  const filter = `loudnorm=I=${LOUDNESS}:TP=${TRUE_PEAK}:print_format=json`
  const { stderr } = await run(ffmpeg, ["-hide_banner", "-i", file, "-af", filter, "-f", "null", "-"], {
    maxBuffer: 16 * 1024 * 1024
  })
  const json = stderr.slice(stderr.lastIndexOf("{"), stderr.lastIndexOf("}") + 1)
  return JSON.parse(json)
}

async function encode(file, out) {
  const measured = await measure(file)
  const filter = [
    `loudnorm=I=${LOUDNESS}:TP=${TRUE_PEAK}`,
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    "linear=true"
  ].join(":")
  await run(ffmpeg, [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    file,
    "-af",
    filter,
    // loudnorm resamples to 192 kHz internally; Opus runs at 48.
    "-ar",
    "48000",
    "-c:a",
    "libopus",
    "-b:a",
    BITRATE,
    "-vbr",
    "on",
    "-application",
    "audio",
    "-map_metadata",
    "-1",
    out
  ])
  return measured
}

const masters = (await readdir(mastersDir)).filter((file) => extname(file).toLowerCase() === ".wav").sort()
if (masters.length === 0) {
  throw new Error(`No WAV masters in ${mastersDir}`)
}
await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
const slugs = []
for (const master of masters) {
  const slug = slugOf(master)
  const measured = await encode(join(mastersDir, master), join(outDir, `${slug}.ogg`))
  print(`${slug}.ogg  (was ${measured.input_i} LUFS, peak ${measured.input_tp} dBTP)`)
  slugs.push(slug)
}
await writeFile(join(outDir, "music.json"), `${JSON.stringify(slugs, null, 2)}\n`)
print(`${slugs.length} tracks in ${outDir}`)
