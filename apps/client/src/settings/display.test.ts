import { describe, expect, it } from "vitest"
import { createDisplay, DEFAULT_DISPLAY, frameDue, readDisplay } from "./display.ts"
import type { SettingsStorage } from "./store.ts"

function memoryStore(
  initial: Record<string, string> = {}
): SettingsStorage & { readonly kept: Record<string, string> } {
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
    expect(readDisplay({ renderer: "webgl", renderScale: 0.2, frameCap: 60, brightness: 9 })).toEqual({
      renderer: "webgl",
      renderScale: 0.5,
      frameCap: 60,
      brightness: 1.6
    })
    expect(readDisplay({ frameCap: 75 }).frameCap).toBe(0)
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
    const blocked: SettingsStorage = {
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

describe("the frame-rate cap", () => {
  it("draws every frame uncapped, and under a cap only once its interval has passed", () => {
    expect(frameDue(0, 1)).toBe(true)
    expect(frameDue(30, 16.7)).toBe(false)
    expect(frameDue(30, 33.4)).toBe(true)
    // A hair early at 60 on a 60 Hz screen still draws.
    expect(frameDue(60, 16.1)).toBe(true)
  })
})
