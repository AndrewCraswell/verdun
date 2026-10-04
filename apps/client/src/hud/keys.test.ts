import { describe, expect, it } from "vitest"
import { boundKeys, HUD_ACTIONS, keyOf } from "./keys.ts"

describe("the HUD's keys", () => {
  it("finds every key it names in the game's controls list", () => {
    const missing = HUD_ACTIONS.filter((action) => keyOf(action).length === 0)
    expect(missing).toEqual([])
    expect(HUD_ACTIONS).toHaveLength(10)
  })

  it("follows the bindings, so a key moved in the controls list moves on the HUD", () => {
    expect(keyOf("advance")).toBe(boundKeys("Squad order: advance"))
    expect(keyOf("bombard")).toBe("B")
    expect(keyOf("follow")).toBe("F")
    expect(boundKeys("Something the game doesn't do")).toBeNull()
  })
})
