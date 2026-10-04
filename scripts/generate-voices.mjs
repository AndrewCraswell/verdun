// Generates the soldiers' shouted lines with ElevenLabs, then transcribes every take so the sound build can tell which
// say the right words.
//
//   ELEVENLABS_API_KEY=... pnpm sound:voices [line ...]
//
// Writes vendor/audio/elevenlabs/<line>-<voice>-<take>.mp3 and vendor/audio/elevenlabs/takes.json (each take's line,
// cue, script and transcript). Takes already generated or transcribed are skipped, so a run only pays for what's new:
// every slot (line, voice, take number) that has no file is generated afresh, so deleting rejected takes and running
// again fills their places. Name lines (their ids, or the start of them: fr-follow, de-) to generate only those.
// Then `build-sound-effects.py -- --shortlist vendor/audio` lists the new takes worth hearing, and those chosen by ear
// go under "keep" in voice-lines.json, the only takes the game uses. The key comes from the environment and is never
// written anywhere.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const OUTPUT = "vendor/audio/elevenlabs"
const TAKES = join(OUTPUT, "takes.json")
const API = "https://api.elevenlabs.io/v1"

const key = process.env.ELEVENLABS_API_KEY
const [linesFile, ...only] = process.argv.slice(2)
if (!key || !linesFile) {
  console.error("usage: ELEVENLABS_API_KEY=... node scripts/generate-voices.mjs <lines.json> [line ...]")
  process.exit(1)
}

/**
 * eleven_v4 at stability 0 follows delivery tags such as [screaming] hardest, which battlefield shouts need; eleven_v3
 * spoke them and garbled words under strain.
 * @type {{ model: string, stability: number, takes: number, voices: Record<string, string>,
 *   lines: { id: string, cue: string, voices: string[], text: string }[] }}
 */
const script = JSON.parse(readFileSync(linesFile, "utf8"))
mkdirSync(OUTPUT, { recursive: true })
/** @type {Record<string, { line: string, cue: string, text: string, transcript?: string, language?: string }>} */
const takes = existsSync(TAKES) ? JSON.parse(readFileSync(TAKES, "utf8")) : {}

async function generate(voice, text, path) {
  const response = await fetch(`${API}/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({
      text,
      model_id: script.model,
      voice_settings: { stability: script.stability, similarity_boost: 0.75 }
    })
  })
  if (!response.ok) {
    throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`)
  }
  writeFileSync(path, Buffer.from(await response.arrayBuffer()))
}

async function transcribe(path) {
  const form = new FormData()
  form.append("model_id", "scribe_v1")
  form.append("file", new Blob([readFileSync(path)]), path)
  const response = await fetch(`${API}/speech-to-text`, { method: "POST", headers: { "xi-api-key": key }, body: form })
  if (!response.ok) {
    throw new Error(`${response.status} ${(await response.text()).slice(0, 200)}`)
  }
  const result = await response.json()
  return { transcript: result.text ?? "", language: result.language_code ?? "" }
}

for (const line of script.lines.filter(({ id }) => only.length === 0 || only.some((start) => id.startsWith(start)))) {
  for (const voice of line.voices) {
    for (let take = 1; take <= script.takes; take++) {
      const name = `${line.id}-${voice}-${take}`
      const path = join(OUTPUT, `${name}.mp3`)
      try {
        if (!existsSync(path)) {
          await generate(script.voices[voice], line.text, path)
        }
        takes[name] ??= { line: line.id, cue: line.cue, text: line.text }
        if (takes[name].transcript === undefined) {
          Object.assign(takes[name], await transcribe(path))
          console.warn(`${name}: ${takes[name].transcript}`)
        }
      } catch (error) {
        console.error(`${name}: ${error.message}`)
      }
      writeFileSync(TAKES, JSON.stringify(takes, null, 2) + "\n")
    }
  }
}
