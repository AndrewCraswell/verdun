import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { SoundCue } from "../audio/battle-sound-model.ts"
import type { CaptionMode } from "../settings/play.ts"
import { CAPTION_LINES } from "./caption-lines.ts"
import { captionOf, createCaptions, type HeardSound } from "./captions.ts"

describe("captions", () => {
  it("captions a shout with who and where, its meaning, and the words as shouted", () => {
    expect(captionOf("voices", { cue: "voice-gas-de", volume: 0.5, pan: -0.8 }, "fr")).toEqual({
      key: "voice-gas-de",
      who: "The enemy, to the left",
      text: "Gas! Masks on!",
      words: "Gas! Masken auf!",
      kind: "voice"
    })
    expect(captionOf("voices", { cue: "voice-follow-fr", volume: 0.5, pan: 0 }, "fr")?.who).toBe("Ours, ahead")
  })

  it("names a man of the player's squad, and leaves the rest to their side", () => {
    const nameOf = (soldier: number) => (soldier === 7 ? "Caporal Vincent" : null)
    const call: HeardSound = { cue: "voice-follow-fr", volume: 0.5, pan: 0 }
    expect(captionOf("voices", { ...call, speaker: 7 }, "fr", nameOf)).toMatchObject({
      who: "Caporal Vincent, ahead",
      key: "voice-follow-fr:7"
    })
    expect(captionOf("voices", { ...call, speaker: 9 }, "fr", nameOf)?.who).toBe("Ours, ahead")
  })

  it("matches the take that played, word for word, and knows every line recorded", () => {
    expect(
      captionOf("voices", { cue: "voice-charge-fr", volume: 0.5, pan: 0, line: "fr-charge-4" }, "fr")
    ).toMatchObject({ text: "On your feet, you dead!", words: "Debout les morts !" })
    const recorded: unknown = JSON.parse(
      readFileSync(new URL("../../../../scripts/voice-lines.json", import.meta.url), "utf8")
    )
    const lines =
      typeof recorded === "object" && recorded !== null && "lines" in recorded && Array.isArray(recorded.lines)
        ? recorded.lines
        : []
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      const id: unknown = typeof line === "object" && line !== null && "id" in line ? line.id : null
      expect(typeof id === "string" && id in CAPTION_LINES, `a caption for ${String(id)}`).toBe(true)
    }
  })

  it("captions warning sounds only when asked, and nothing too faint or switched off", () => {
    const whistle: { cue: SoundCue; volume: number; pan: number } = { cue: "whistle", volume: 0.6, pan: 0.6 }
    expect(captionOf("voices", whistle, "fr")).toBeNull()
    expect(captionOf("all", whistle, "fr")).toMatchObject({ text: "Whistles blow", who: "to the right", words: null })
    expect(captionOf("all", { cue: "step-earth", volume: 1, pan: 0 }, "fr")).toBeNull()
    expect(captionOf("voices", { cue: "voice-hit-fr", volume: 0.01, pan: 0 }, "fr")).toBeNull()
    expect(captionOf("off", { cue: "voice-hit-fr", volume: 1, pan: 0 }, "fr")).toBeNull()
  })

  it("counts a shout heard again rather than repeating it, keeps three, and lets them go", () => {
    let mode: CaptionMode = "voices"
    const captions = createCaptions(() => mode, "fr")
    captions.hear({ cue: "voice-hit-fr", volume: 1, pan: 0 })
    captions.hear({ cue: "voice-hit-fr", volume: 1, pan: 0 })
    expect(captions.update(0.1)).toMatchObject([{ key: "voice-hit-fr", count: 2 }])
    const shouts: SoundCue[] = ["voice-gas-fr", "voice-hold-fr", "voice-taken-fr"]
    for (const cue of shouts) {
      captions.hear({ cue, volume: 1, pan: 0 })
    }
    expect(captions.update(0.1).map((caption) => caption.key)).toEqual([
      "voice-gas-fr",
      "voice-hold-fr",
      "voice-taken-fr"
    ])
    expect(captions.update(5)).toEqual([])
    captions.hear({ cue: "voice-hit-fr", volume: 1, pan: 0 })
    mode = "off"
    expect(captions.update(0.1)).toEqual([])
  })
})
