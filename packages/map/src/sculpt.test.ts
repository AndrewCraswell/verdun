import { describe, expect, it } from "vitest"
import { createFlatMap, sampleIndex, Surface } from "./format.ts"
import { heightAt } from "./sampling.ts"
import type { Scenery } from "./scenery.ts"
import { sculptForScenery } from "./sculpt.ts"
import type { Trench } from "./trenches.ts"

/** A field 100 m square rising 1 m in every 5 m eastward: no house plot or gun pit on it is level to start with. */
function slope(trenches: readonly Trench[] = []) {
  const map = {
    ...createFlatMap({ name: "slope", cellSize: 0.5, columns: 200, rows: 200 }, 0, Surface.Grass),
    trenches
  }
  for (let row = 0; row <= map.rows; row++) {
    for (let column = 0; column <= map.columns; column++) {
      map.heights[sampleIndex(map, column, row)] = (column * map.cellSize) / 5
    }
  }
  return map
}

const item = (kind: Scenery["kind"], x: number, z: number, heading = 0): Scenery => ({
  kind,
  x,
  z,
  heading,
  variant: 0,
  scale: 1
})

describe("sculptForScenery", () => {
  it("levels a house's plot to the middle of the slope, easing back into it, and strews rubble round it", () => {
    const map = slope()
    sculptForScenery(map, [item("ruin", 50, 50)])

    // Level across the plot, at the height of its middle.
    for (const [dx, dz] of [
      [-4, 0],
      [4, 0],
      [0, 4],
      [3, -3]
    ]) {
      expect(heightAt(map, 50 + (dx ?? 0), 50 + (dz ?? 0))).toBeCloseTo(10, 1)
    }
    // Back on the slope beyond the blend.
    expect(heightAt(map, 60, 50)).toBeCloseTo(12)
    expect(heightAt(map, 40, 50)).toBeCloseTo(8)
    const surfaces = new Set<number>()
    for (let dz = -6; dz <= 6; dz += 0.5) {
      for (let dx = -6; dx <= 6; dx += 0.5) {
        surfaces.add(map.surfaces[sampleIndex(map, (50 + dx) * 2, (50 + dz) * 2)] ?? -1)
      }
    }
    expect(surfaces.has(Surface.Churned)).toBe(true)
  })

  it("digs a gun into a pit, its spoil banked round the front and open behind", () => {
    const map = slope()
    // The gun faces north (heading 0): the crew's way in is to the south.
    sculptForScenery(map, [item("gun", 50, 50)])

    const level = 10
    expect(heightAt(map, 50, 50)).toBeCloseTo(level - 0.7, 1)
    expect(heightAt(map, 50, 54)).toBeGreaterThan(level + 0.2)
    expect(heightAt(map, 50, 46)).toBeLessThan(heightAt(map, 50, 54) - 0.2)
    expect(map.surfaces[sampleIndex(map, 100, 100)]).not.toBe(Surface.Grass)
  })

  it("banks earth against a concrete post", () => {
    const map = createFlatMap({ name: "flat", cellSize: 0.5, columns: 100, rows: 100 }, 5)
    sculptForScenery(map, [item("bunker", 25, 25)])

    expect(heightAt(map, 25, 28)).toBeGreaterThan(5.5)
    expect(heightAt(map, 25, 33)).toBeCloseTo(5)
  })

  it("leaves the trench and its walls alone, and scenery with no ground work", () => {
    const trench: Trench = {
      kind: "fire",
      points: [
        [20, 46],
        [80, 46]
      ],
      facing: "north"
    }
    const map = slope([trench])
    const before = Float32Array.from(map.heights)
    sculptForScenery(map, [item("ruin", 50, 51), item("tree", 20, 20)])

    for (let column = 60; column <= 140; column++) {
      for (const row of [91, 92, 93]) {
        const index = sampleIndex(map, column, row)
        expect(map.heights[index]).toBe(before[index])
      }
    }
    expect(heightAt(map, 20, 20)).toBe(4)
  })
})
