import { describe, expect, it } from "vitest"
import { mergeAreas, slumpGround, stampCrater } from "./craters.ts"
import { createFlatMap, sampleIndex, Surface } from "./format.ts"
import { heightAt } from "./sampling.ts"

const flat = () => createFlatMap({ name: "field", cellSize: 0.5, columns: 100, rows: 100 }, 10, Surface.Grass)

describe("stampCrater", () => {
  it("digs a bowl with a ragged edge, throws up a lip mostly one way, and churns the ground", () => {
    const map = flat()
    stampCrater(map, { x: 25, z: 25, radius: 2, depth: 1.5 })

    expect(heightAt(map, 25, 25)).toBeCloseTo(8.5)
    // Halfway out the bowl is about three quarters as deep, give or take the ragged edge.
    expect(heightAt(map, 26, 25)).toBeGreaterThan(10 - 1.5 * 0.9)
    expect(heightAt(map, 26, 25)).toBeLessThan(10 - 1.5 * 0.55)
    // The lip stands proud all round, higher on the side the spoil was thrown.
    const lip = Array.from({ length: 16 }, (_, index) => {
      const angle = (index / 16) * Math.PI * 2
      return heightAt(map, 25 + Math.cos(angle) * 2.6, 25 + Math.sin(angle) * 2.6)
    })
    expect(Math.min(...lip)).toBeGreaterThan(10)
    expect(Math.max(...lip) - Math.min(...lip)).toBeGreaterThan(0.05)
    expect(heightAt(map, 25, 30)).toBe(10)
    expect(map.surfaces[sampleIndex(map, 50, 50)]).toBe(Surface.Churned)
    expect(map.surfaces[sampleIndex(map, 50, 60)]).toBe(Surface.Grass)
  })

  it("deepens where shells land on old craters", () => {
    const map = flat()
    stampCrater(map, { x: 25, z: 25, radius: 2, depth: 1 })
    stampCrater(map, { x: 25, z: 25, radius: 2, depth: 1 })

    expect(heightAt(map, 25, 25)).toBeCloseTo(8)
  })

  it("reports the area it changed, clipped to the map", () => {
    const map = flat()

    // The lip reaches 1.5 radii, and the ragged edge a little further.
    expect(stampCrater(map, { x: 25, z: 25, radius: 2, depth: 1 })).toEqual({
      minX: 21.5,
      minZ: 21.5,
      maxX: 28.5,
      maxZ: 28.5
    })
    expect(stampCrater(map, { x: 0.5, z: 49.5, radius: 2, depth: 1 })).toEqual({
      minX: 0,
      minZ: 46,
      maxX: 4,
      maxZ: 50
    })
  })
})

describe("slumpGround", () => {
  it("lets ground steeper than the talus settle inside the areas, and leaves the rest alone", () => {
    const map = flat()
    // A 3 m cliff along x = 12.5, and another along x = 37.5 outside the area.
    for (let row = 0; row <= map.rows; row++) {
      for (let column = 0; column <= map.columns; column++) {
        if (column < 25 || (column >= 50 && column < 75)) {
          map.heights[sampleIndex(map, column, row)] = 13
        }
      }
    }
    slumpGround(map, [{ minX: 5, minZ: 5, maxX: 20, maxZ: 45 }], 1, 40)

    const step = (column: number) =>
      Math.abs((map.heights[sampleIndex(map, column, 50)] ?? 0) - (map.heights[sampleIndex(map, column + 1, 50)] ?? 0))
    for (let column = 15; column < 35; column++) {
      expect(step(column)).toBeLessThanOrEqual(0.5 + 0.05)
    }
    expect(step(74)).toBeCloseTo(3)
  })
})

describe("mergeAreas", () => {
  it("covers both areas, or takes the new one when there's nothing yet", () => {
    const a = { minX: 0, minZ: 5, maxX: 10, maxZ: 10 }
    const b = { minX: 4, minZ: 0, maxX: 20, maxZ: 8 }

    expect(mergeAreas(null, a)).toBe(a)
    expect(mergeAreas(a, b)).toEqual({ minX: 0, minZ: 0, maxX: 20, maxZ: 10 })
  })
})
