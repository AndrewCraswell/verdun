import { describe, expect, it } from "vitest"
import type { Listener } from "./battle-sound-model.ts"
import { createLevelSoundModel, fireLevel, type LevelSources } from "./level-sound-model.ts"

const LISTENER: Listener = { x: 0, z: 0, height: 0, rightX: 1, rightZ: 0 }

function level(flames: { x: number; z: number }[], burning: { x: number; z: number }[] = []) {
  const flocks: { state: "perched" | "circling" | "landing"; perch: { x: number; z: number } }[] = [
    { state: "perched", perch: { x: 20, z: 0 } },
    { state: "perched", perch: { x: 900, z: 0 } }
  ]
  const sources: LevelSources = {
    life: { braziers: flames.map((position) => ({ position })), crows: { flocks } },
    aftermath: { fires: burning.map((position) => ({ position })) }
  }
  return { sources, flocks }
}

describe("fireLevel", () => {
  it("crackles louder the nearer the listener is to a brazier or a burning wreck", () => {
    expect(fireLevel(level([]).sources, LISTENER)).toBe(0)
    expect(fireLevel(level([{ x: 40, z: 0 }]).sources, LISTENER)).toBe(0)
    const near = fireLevel(level([{ x: 5, z: 0 }]).sources, LISTENER)
    const nearer = fireLevel(level([{ x: 40, z: 0 }], [{ x: 1, z: 0 }]).sources, LISTENER)
    expect(near).toBeGreaterThan(0)
    expect(nearer).toBeGreaterThan(near)
    expect(fireLevel(level([{ x: 1, z: 0 }]).sources, { ...LISTENER, height: 80 })).toBe(0)
  })
})

describe("createLevelSoundModel", () => {
  it("caws as a flock nearby takes off, once, and not for one far off", () => {
    const { sources, flocks } = level([])
    const model = createLevelSoundModel(sources)
    expect(model.step(LISTENER)).toEqual([])
    for (const flock of flocks) {
      flock.state = "circling"
    }
    expect(model.step(LISTENER).map((call) => call.cue)).toEqual(["crow"])
    expect(model.step(LISTENER)).toEqual([])
  })
})
