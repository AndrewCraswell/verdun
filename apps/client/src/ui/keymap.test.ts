import { describe, expect, it } from "vitest"
import { canonicalCode, createKeymap, KEY_GROUPS, type KeyStore, keyName } from "./keymap.ts"

function memoryStore(initial: unknown = null): KeyStore & { saved: unknown } {
  const store = {
    saved: initial,
    load: () => store.saved,
    save(bindings: Readonly<Record<string, readonly string[]>>) {
      store.saved = structuredClone(bindings)
    }
  }
  return store
}

describe("the keymap", () => {
  it("starts on the default keys, each action's first key its canonical code", () => {
    const keys = createKeymap(memoryStore())
    expect(keys.codesFor("forward")).toEqual(["KeyW"])
    expect(keys.codesFor("run")).toEqual(["ShiftLeft", "ShiftRight"])
    expect(keys.actionOf("KeyQ")).toBe("throw")
    expect(keys.canonical("ShiftRight")).toBe("ShiftLeft")
    expect(keys.canonical("KeyW")).toBe("KeyW")
    expect(canonicalCode("recentre")).toBe("Home")
    expect(canonicalCode("act")).toBe("Space")
    expect(keys.label("run")).toBe("Shift")
    expect(keys.label("pan-left")).toBe("←")
  })

  it("passes keys outside it straight through: Esc, the slots, the dev tools", () => {
    const keys = createKeymap(memoryStore())
    expect(keys.canonical("Escape")).toBe("Escape")
    expect(keys.canonical("Digit3")).toBe("Digit3")
    expect(keys.canonical("KeyK")).toBe("KeyK")
    expect(keys.actionOf("KeyK")).toBeNull()
  })

  it("moves an action to a free key, so its old key does nothing", () => {
    const store = memoryStore()
    const keys = createKeymap(store)
    expect(keys.rebind("crouch", "KeyY")).toEqual({ swapped: null })
    expect(keys.canonical("KeyY")).toBe("KeyC")
    expect(keys.canonical("KeyC")).toBeNull()
    expect(keys.label("crouch")).toBe("Y")
    expect(store.saved).toMatchObject({ crouch: ["KeyY"] })
  })

  it("swaps keys when the new key is taken, and says which action gave it up", () => {
    const keys = createKeymap(memoryStore())
    expect(keys.rebind("crouch", "KeyW")).toEqual({ swapped: "forward" })
    expect(keys.codesFor("crouch")).toEqual(["KeyW"])
    expect(keys.codesFor("forward")).toEqual(["KeyC"])
    expect(keys.canonical("KeyW")).toBe("KeyC")
    expect(keys.canonical("KeyC")).toBe("KeyW")
  })

  it("takes one of two keys from an action that has two, leaving it the other", () => {
    const keys = createKeymap(memoryStore())
    expect(keys.rebind("crouch", "ShiftRight")).toEqual({ swapped: "run" })
    expect(keys.codesFor("run")).toEqual(["ShiftLeft"])
    expect(keys.canonical("ShiftRight")).toBe("KeyC")
  })

  it("refuses the menu's, the slots' and the dev tools' keys", () => {
    const keys = createKeymap(memoryStore())
    expect(keys.rebind("crouch", "Escape")).toBeNull()
    expect(keys.rebind("crouch", "Digit1")).toBeNull()
    expect(keys.rebind("crouch", "Backquote")).toBeNull()
    expect(keys.codesFor("crouch")).toEqual(["KeyC"])
  })

  it("rebinding an action to its own key changes nothing", () => {
    const keys = createKeymap(memoryStore())
    expect(keys.rebind("fog", "KeyO")).toEqual({ swapped: null })
    expect(keys.codesFor("fog")).toEqual(["KeyO"])
  })

  it("keeps the bindings between visits, and falls back to the defaults for anything broken", () => {
    const store = memoryStore()
    createKeymap(store).rebind("whistle", "KeyT")
    const again = createKeymap(store)
    expect(again.codesFor("whistle")).toEqual(["KeyT"])

    const broken = createKeymap(
      memoryStore({ whistle: "KeyT", gas: [], fog: [3], pause: ["Escape"], crouch: ["KeyU"], nonsense: ["KeyL"] })
    )
    expect(broken.codesFor("whistle")).toEqual(["KeyG"])
    expect(broken.codesFor("gas")).toEqual(["KeyX"])
    expect(broken.codesFor("fog")).toEqual(["KeyO"])
    expect(broken.codesFor("pause")).toEqual(["KeyP"])
    expect(broken.codesFor("crouch")).toEqual(["KeyU"])
    expect(createKeymap(memoryStore("not bindings")).codesFor("forward")).toEqual(["KeyW"])
  })

  it("keeps only the keys the player changed, so a change to a default reaches him", () => {
    const store = memoryStore()
    createKeymap(store).rebind("whistle", "KeyJ")
    expect(store.load()).toEqual({ whistle: ["KeyJ"] })
  })

  it("moves an old default stored as a choice onto the new default: Space from recentring to the action key", () => {
    // Saved before the keymap kept only changes: every action's keys, recentring on Space as it then was.
    const keymap = createKeymap(memoryStore({ recentre: ["Space"], whistle: ["KeyJ"] }))
    expect(keymap.codesFor("recentre")).toEqual(["Home", "KeyL"])
    expect(keymap.actionOf("Space")).toBe("act")
    expect(keymap.codesFor("whistle")).toEqual(["KeyJ"])
  })

  it("resets one action or all of them, and tells its listeners each time", () => {
    const keys = createKeymap(memoryStore())
    let heard = 0
    const stop = keys.listen(() => heard++)
    keys.rebind("hold", "KeyJ")
    keys.rebind("follow", "KeyL")
    keys.reset("hold")
    expect(keys.codesFor("hold")).toEqual(["KeyH"])
    expect(keys.codesFor("follow")).toEqual(["KeyL"])
    keys.reset()
    expect(keys.codesFor("follow")).toEqual(["KeyF"])
    expect(heard).toBe(4)
    stop()
    keys.reset()
    expect(heard).toBe(4)
  })

  it("gives every action a distinct default key", () => {
    const codes = KEY_GROUPS.flatMap((group) => group.actions.flatMap((info) => info.keys))
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("prints keys as they're printed on the keyboard", () => {
    expect(keyName("KeyQ")).toBe("Q")
    expect(keyName("Digit7")).toBe("7")
    expect(keyName("Numpad4")).toBe("Num 4")
    expect(keyName("ArrowUp")).toBe("↑")
    expect(keyName("Semicolon")).toBe(";")
    expect(keyName("F7")).toBe("F7")
  })
})
