import { afterEach, describe, expect, it, vi } from "vitest"
import { createPlayerVolume, playerVolume, volumeGain } from "./volume.ts"

/** A stand-in for the browser's localStorage. */
function storage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items
  }
}

describe("createPlayerVolume", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("is at full until set, keeps levels between 0 and 1, and tells listeners", () => {
    vi.stubGlobal("localStorage", storage())
    const volume = createPlayerVolume()
    const heard: string[] = []
    volume.onChange((channel) => heard.push(channel))
    expect(volume.level("music")).toBe(1)
    volume.set("music", 0.4)
    volume.set("voices", 3)
    volume.set("effects", -1)
    expect(volume.level("music")).toBe(0.4)
    expect(volume.level("voices")).toBe(1)
    expect(volume.level("effects")).toBe(0)
    expect(heard).toEqual(["music", "voices", "effects"])
  })

  it("remembers the settings between visits, ignoring anything malformed", () => {
    const store = storage({ "verdun.volume": JSON.stringify({ master: 0.5, music: "loud", radio: 0.2 }) })
    vi.stubGlobal("localStorage", store)
    const volume = createPlayerVolume()
    expect(volume.level("master")).toBe(0.5)
    expect(volume.level("music")).toBe(1)
    volume.set("ambience", 0.25)
    expect(JSON.parse(store.items.get("verdun.volume") ?? "{}")).toEqual({ master: 0.5, ambience: 0.25 })
    store.items.set("verdun.volume", "not json")
    expect(createPlayerVolume().level("master")).toBe(1)
  })

  it("turns a slider's level into a gain that sounds even across its travel, shared game-wide", () => {
    expect(volumeGain(1)).toBe(1)
    expect(volumeGain(0.5)).toBe(0.25)
    expect(volumeGain(0)).toBe(0)
    expect(playerVolume()).toBe(playerVolume())
  })
})
