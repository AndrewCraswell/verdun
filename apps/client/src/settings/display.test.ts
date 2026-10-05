import { describe, expect, it } from "vitest"
import { createDisplay, DEFAULT_DISPLAY, type DisplayStore, readDisplay } from "./display.ts"

function memoryStore(initial: Record<string, string> = {}): DisplayStore & { readonly kept: Record<string, string> } {
  const kept = { ...initial }
  return {
    kept,
    getItem: (key) => kept[key] ?? null,
    setItem(key, value) {
      kept[key] = value
    }
  }
}

describe("display settings", () => {
  it("keeps each setting within its range and defaults whatever is missing or broken", () => {
    expect(readDisplay(null)).toEqual(DEFAULT_DISPLAY)
    expect(readDisplay({ renderer: "webgl", renderScale: 0.2 })).toEqual({ renderer: "webgl", renderScale: 0.5 })
    expect(readDisplay({ renderer: "vulkan", renderScale: "big" })).toEqual(DEFAULT_DISPLAY)
  })

  it("keeps changes for the next visit and tells every listener", () => {
    const store = memoryStore()
    const display = createDisplay(store)
    const heard: number[] = []
    display.listen((settings) => heard.push(settings.renderScale))
    display.change({ renderScale: 0.75 })
    expect(heard).toEqual([1, 0.75])
    expect(createDisplay(store).current.renderScale).toBe(0.75)
  })

  it("carries on with the defaults when storage is blocked", () => {
    const blocked: DisplayStore = {
      getItem() {
        throw new Error("blocked")
      },
      setItem() {
        throw new Error("blocked")
      }
    }
    const display = createDisplay(blocked)
    display.change({ renderer: "webgl" })
    expect(display.current.renderer).toBe("webgl")
  })
})
