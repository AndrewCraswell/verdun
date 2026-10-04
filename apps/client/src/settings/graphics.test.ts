import { describe, expect, it } from "vitest"
import { GRAPHICS_KEY, type GraphicsStore, graphicsQuality, saveGraphicsQuality } from "./graphics.ts"

function memory(): GraphicsStore & { readonly items: Map<string, string> } {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value)
    }
  }
}

describe("the graphics setting", () => {
  it("is high unless set, keeps what's set, and takes the address's word over it", () => {
    const store = memory()
    expect(graphicsQuality(store)).toBe("high")
    saveGraphicsQuality(store, "low")
    expect(graphicsQuality(store)).toBe("low")
    expect(graphicsQuality(store, new URLSearchParams("quality=high"))).toBe("high")
    expect(store.items.get(GRAPHICS_KEY)).toBe("high")
    expect(graphicsQuality(store, new URLSearchParams("quality=ultra"))).toBe("high")
  })

  it("copes with no storage, storage that throws, and nonsense kept", () => {
    const broken: GraphicsStore = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      }
    }
    expect(graphicsQuality(null)).toBe("high")
    expect(graphicsQuality(broken)).toBe("high")
    expect(graphicsQuality(broken, new URLSearchParams("quality=low"))).toBe("low")
    const garbled = memory()
    garbled.setItem(GRAPHICS_KEY, "medium")
    expect(graphicsQuality(garbled)).toBe("high")
  })
})
