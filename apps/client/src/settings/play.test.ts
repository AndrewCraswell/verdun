import { describe, expect, it } from "vitest"
import { createPlaySettings, DEFAULT_PLAY, readPlay } from "./play.ts"

describe("play settings", () => {
  it("captions nothing until asked, and asks before sector-wide fire unless told otherwise", () => {
    expect(readPlay(null)).toEqual(DEFAULT_PLAY)
    expect(readPlay({ captions: "all", confirmSectorFire: false })).toEqual({
      captions: "all",
      confirmSectorFire: false
    })
    expect(readPlay({ captions: "loud", confirmSectorFire: "yes" })).toEqual(DEFAULT_PLAY)
  })

  it("lasts the page without storage", () => {
    const settings = createPlaySettings(null)
    settings.change({ captions: "voices" })
    expect(settings.current.captions).toBe("voices")
  })
})
