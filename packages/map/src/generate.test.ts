import { describe, expect, it } from "vitest"
import { mapDepth, mapWidth } from "./format.ts"
import { generateRollingTerrain } from "./generate.ts"

const options = { name: "sector", widthMeters: 120, depthMeters: 80, cellSize: 2, seed: 1916, amplitude: 12 }

describe("generateRollingTerrain", () => {
  it("covers the requested area", () => {
    const map = generateRollingTerrain(options)

    expect(mapWidth(map)).toBe(120)
    expect(mapDepth(map)).toBe(80)
  })

  it("is deterministic for a seed", () => {
    const first = generateRollingTerrain(options)
    const second = generateRollingTerrain(options)

    expect(second.heights).toEqual(first.heights)
  })

  it("produces different terrain for different seeds", () => {
    const first = generateRollingTerrain(options)
    const second = generateRollingTerrain({ ...options, seed: 1917 })

    expect(second.heights).not.toEqual(first.heights)
  })

  it("keeps heights within the amplitude and varies them", () => {
    const heights = Array.from(generateRollingTerrain(options).heights)
    const lowest = Math.min(...heights)
    const highest = Math.max(...heights)

    expect(lowest).toBeGreaterThanOrEqual(0)
    expect(highest).toBeLessThanOrEqual(12)
    expect(highest - lowest).toBeGreaterThan(0.5)
  })
})
