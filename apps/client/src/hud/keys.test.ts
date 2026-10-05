import { describe, expect, it } from "vitest"
import { keymap } from "../ui/keymap.ts"
import { isOverviewKey, keyOf } from "./keys.ts"

describe("the HUD's keys", () => {
  it("names each key as the player has bound it, and follows a rebinding", () => {
    expect(keyOf("bombard")).toBe("B")
    expect(keyOf("next-soldier")).toBe("Tab")
    expect(isOverviewKey("KeyI")).toBe(true)
    keymap().rebind("bombard", "KeyU")
    keymap().rebind("overview", "KeyL")
    expect(keyOf("bombard")).toBe("U")
    expect(isOverviewKey("KeyL")).toBe(true)
    expect(isOverviewKey("KeyI")).toBe(false)
    keymap().reset()
    expect(keyOf("bombard")).toBe("B")
  })
})
