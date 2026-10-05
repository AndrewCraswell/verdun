import { describe, expect, it } from "vitest"
import { actionForKey, MOVEMENT_KEYS, POINTER_KEYS, RUN_KEYS, THROW_KEY } from "../control/browser-input.ts"
import { CAMERA_KEYS } from "../control/camera-rig.ts"
import { allBindings, controls, registerBindings } from "./bindings.ts"
import { createKeymap, type KeyStore, keyName } from "./keymap.ts"

const fresh = (): KeyStore => ({ load: () => null, save: () => undefined })

/** Whether a key, by its default code, is in the controls list as the defaults print it. */
function listed(code: string): boolean {
  const label = keyName(code)
  const digit = /^[1-8]$/.test(label)
  return controls(createKeymap(fresh())).some((group) =>
    group.bindings.some((binding) =>
      digit ? binding.keys === "1 to 8" : binding.keys.split(/ or |,\s*|\s+\+\s+/).includes(label)
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
      THROW_KEY,
      ...CAMERA_KEYS,
      "Escape",
      "KeyP",
      "KeyI",
      "F3",
      "F4",
      "Backquote"
    ]

    expect(handled.filter((code) => !listed(code))).toEqual([])
  })

  it("shows each movable key where the player has put it, and marks it as movable", () => {
    const keys = createKeymap(fresh())
    keys.rebind("whistle", "KeyY")
    const whistle = controls(keys)
      .flatMap((group) => group.bindings)
      .find((binding) => binding.rebind === "whistle")
    expect(whistle?.keys).toBe("Y")
    const fire = controls(keys)
      .flatMap((group) => group.bindings)
      .find((binding) => binding.action === "Fire")
    expect(fire?.rebind).toBeUndefined()
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
