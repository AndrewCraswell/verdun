import { describe, expect, it } from "vitest"
import { mapDepth, mapWidth, sampleIndex, Surface } from "./format.ts"
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

  it("churns up no man's land and leaves grass, mud and chalk behind the lines", () => {
    const map = generateRollingTerrain({ ...options, widthMeters: 400, depthMeters: 400, seed: 1916, amplitude: 14 })
    const surfacesIn = (fromZ: number, toZ: number) => {
      const found = new Set<number>()
      for (let row = fromZ / map.cellSize; row <= toZ / map.cellSize; row++) {
        for (let column = 0; column <= map.columns; column++) {
          found.add(map.surfaces[sampleIndex(map, column, row)])
        }
      }
      return found
    }

    // Middle of no man's land (30%-70% of 400 m), clear of the ragged edge.
    expect([...surfacesIn(140, 260)].sort()).toEqual([Surface.Mud, Surface.Churned])
    // Behind the lines.
    const rear = surfacesIn(0, 100)
    expect(rear.has(Surface.Churned)).toBe(false)
    expect(rear.has(Surface.Grass)).toBe(true)
    expect(rear.has(Surface.Mud)).toBe(true)
  })

  it("puts chalk on rises behind the lines", () => {
    const map = generateRollingTerrain({ ...options, widthMeters: 800, depthMeters: 800, seed: 1916, amplitude: 14 })

    expect(Array.from(map.surfaces)).toContain(Surface.Chalk)
  })
})
