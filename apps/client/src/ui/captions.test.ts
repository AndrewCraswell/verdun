import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { CaptionMode } from "../settings/play.ts"
import { CAPTION_LINES } from "./caption-lines.ts"
import { captionOf, createCaptions, type HeardSound } from "./captions.ts"

const shout = (cue: HeardSound["cue"], extra: Partial<HeardSound> = {}): HeardSound => ({
  cue,
  volume: 0.5,
  pan: 0,
  ...extra
})

describe("captions", () => {
  it("says what was shouted in one short line: where from, whose side, and the meaning", () => {
    expect(captionOf("voices", shout("voice-gas-de", { pan: -0.8 }), "fr")).toEqual({
      key: "Gas! Masks on!",
      side: "theirs",
      direction: "left",
      name: null,
      text: "Gas! Masks on!"
    })
  })

  it("captions only what the player can act on, unless they ask for everything", () => {
    const nameOf = (soldier: number) => (soldier === 7 ? "Vincent" : null)
    expect(captionOf("voices", shout("voice-grenade-fr"), "fr")?.text).toBe("Grenade!")
    expect(captionOf("voices", shout("voice-follow-fr", { speaker: 7 }), "fr", nameOf)).toMatchObject({
      name: "Vincent",
      side: "ours",
      text: "Follow me!"
    })
    // Another squad's orders, the wounded, the broken and the surrendering: only in "all".
    expect(captionOf("voices", shout("voice-follow-fr", { speaker: 9 }), "fr", nameOf)).toBeNull()
    expect(captionOf("voices", shout("voice-hit-fr"), "fr")).toBeNull()
    expect(captionOf("all", shout("voice-hit-fr"), "fr")?.text).toBe("I'm hit!")
  })

  it("says the take that played, and has a meaning for every line recorded", () => {
    expect(captionOf("all", shout("voice-charge-fr", { line: "fr-charge-4" }), "fr")?.text).toBe(
      "On your feet, you dead!"
    )
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

  it("captions warning sounds only in all, and nothing too faint or switched off", () => {
    expect(captionOf("voices", shout("whistle"), "fr")).toBeNull()
    expect(captionOf("all", shout("whistle", { pan: 0.6 }), "fr")).toMatchObject({
      text: "Whistles",
      side: null,
      direction: "right"
    })
    expect(captionOf("all", shout("step-mud"), "fr")).toBeNull()
    expect(captionOf("voices", shout("voice-gas-fr", { volume: 0.01 }), "fr")).toBeNull()
    expect(captionOf("off", shout("voice-gas-fr"), "fr")).toBeNull()
  })

  it("shows the same meaning once, two at most, briefly", () => {
    let mode: CaptionMode = "voices"
    const captions = createCaptions(() => mode, "fr")
    captions.hear(shout("voice-gas-fr"))
    captions.hear(shout("voice-gas-de"))
    expect(captions.update(0.1).map((caption) => caption.text)).toEqual(["Gas! Masks on!"])
    captions.hear(shout("voice-grenade-fr"))
    captions.hear(shout("voice-cover-fr"))
    expect(captions.update(0.1).map((caption) => caption.text)).toEqual(["Grenade!", "Get down!"])
    expect(captions.update(3)).toEqual([])
    captions.hear(shout("voice-gas-fr"))
    mode = "off"
    expect(captions.update(0.1)).toEqual([])
  })
})
