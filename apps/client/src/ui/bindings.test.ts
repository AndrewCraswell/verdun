import { describe, expect, it } from "vitest"
import { actionForKey, MOVEMENT_KEYS, POINTER_KEYS, RUN_KEYS } from "../control/browser-input.ts"
import { CAMERA_KEYS } from "../control/camera-rig.ts"
import { allBindings, CONTROLS, registerBindings } from "./bindings.ts"

/** How a `KeyboardEvent.code` is written in the controls list. */
function keyLabel(code: string): string {
  const names: Record<string, string> = {
    Space: "Space",
    Tab: "Tab",
    Escape: "Esc",
    ArrowUp: "Arrow keys",
    ArrowDown: "Arrow keys",
    ArrowLeft: "Arrow keys",
    ArrowRight: "Arrow keys",
    Backquote: "`",
    ShiftLeft: "Shift",
    ShiftRight: "Shift"
  }
  return names[code] ?? code.replace(/^Key/, "").replace(/^Digit/, "")
}

function listed(code: string): boolean {
  const label = keyLabel(code)
  const digit = /^[1-8]$/.test(label)
  return CONTROLS.some((group) =>
    group.bindings.some((binding) =>
      digit
        ? binding.keys === "1 to 8"
        : binding.keys.split(/,\s*|\s+\+\s+|\s+/).includes(label) || binding.keys.includes(label)
    )
  )
}

describe("the controls list", () => {
  it("lists every key the game handles", () => {
    const candidates = [
      ...Array.from({ length: 26 }, (_, index) => `Key${String.fromCharCode(65 + index)}`),
      ...Array.from({ length: 10 }, (_, index) => `Digit${index}`),
      "Tab",
      "Space",
      "Escape",
      "Backquote"
    ]
    const handled = [
      ...candidates.filter((code) => actionForKey(code) !== null),
      ...MOVEMENT_KEYS,
      ...RUN_KEYS,
      ...POINTER_KEYS,
      ...CAMERA_KEYS,
      "Escape",
      "KeyP",
      "F3",
      "F4",
      "Backquote"
    ]

    expect(handled.filter((code) => !listed(code))).toEqual([])
  })

  it("hides development keys outside development builds, and takes keys other modules register", () => {
    expect(allBindings(false).some((group) => group.devOnly)).toBe(false)
    expect(allBindings(true).some((group) => group.title === "Development")).toBe(true)

    const remove = registerBindings({ title: "Weather", bindings: [{ keys: "N", action: "Next weather" }] })
    expect(allBindings(false).at(-1)?.title).toBe("Weather")
    remove()
    remove()
    expect(allBindings(false).some((group) => group.title === "Weather")).toBe(false)
  })
})
