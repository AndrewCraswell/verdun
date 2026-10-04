import { afterEach, describe, expect, it, vi } from "vitest"
import { createTuning } from "./tuning.ts"

/** A stand-in for the browser's localStorage. */
function storage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    items
  }
}

describe("createTuning", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("leaves everything at 1 until tuned, and tells listeners of changes", () => {
    const tuning = createTuning(false)
    const heard: string[] = []
    tuning.onChange((name) => heard.push(name))
    expect(tuning.level("rifle-fr-near")).toBe(1)
    tuning.set("rifle-fr-near", 0.5)
    tuning.set("bus:battle", 1)
    expect(tuning.level("rifle-fr-near")).toBe(0.5)
    expect(tuning.changed()).toEqual({ "rifle-fr-near": 0.5 })
    expect(heard).toEqual(["rifle-fr-near", "bus:battle"])
  })

  it("remembers a dev build's changes between reloads, ignoring anything malformed", () => {
    const store = storage({ "verdun.soundTuning": JSON.stringify({ crow: 0.3, broken: "loud" }) })
    vi.stubGlobal("localStorage", store)
    const tuning = createTuning(true)
    expect(tuning.level("crow")).toBe(0.3)
    expect(tuning.level("broken")).toBe(1)
    tuning.set("rain", 2)
    expect(JSON.parse(store.items.get("verdun.soundTuning") ?? "{}")).toEqual({ crow: 0.3, rain: 2 })
    store.items.set("verdun.soundTuning", "not json")
    expect(createTuning(true).level("crow")).toBe(1)
  })

  it("forgets nothing it was never told to remember", () => {
    const store = storage({ "verdun.soundTuning": JSON.stringify({ crow: 0.3 }) })
    vi.stubGlobal("localStorage", store)
    expect(createTuning(false).level("crow")).toBe(1)
  })
})
