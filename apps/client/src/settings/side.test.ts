import { describe, expect, it } from "vitest"
import { createSideSettings, readSide } from "./side.ts"

describe("the side the player fights for", () => {
  it("is French unless Germany was chosen", () => {
    expect(readSide(null)).toEqual({ side: "french" })
    expect(readSide({ side: "german" })).toEqual({ side: "german" })
    expect(readSide({ side: "british" })).toEqual({ side: "french" })
  })

  it("lasts the page without storage", () => {
    const settings = createSideSettings(null)
    settings.change({ side: "german" })
    expect(settings.current.side).toBe("german")
  })
})
