import { describe, expect, it } from "vitest"
import { mergeAreas, stampCrater } from "./craters.ts"
import { createFlatMap, sampleIndex, Surface } from "./format.ts"
import { heightAt } from "./sampling.ts"

const flat = () => createFlatMap({ name: "field", cellSize: 0.5, columns: 100, rows: 100 }, 10, Surface.Grass)

describe("stampCrater", () => {
  it("digs a bowl, throws up a lip, and churns the ground", () => {
    const map = flat()
    stampCrater(map, { x: 25, z: 25, radius: 2, depth: 1.5 })

    expect(heightAt(map, 25, 25)).toBeCloseTo(8.5)
    expect(heightAt(map, 26, 25)).toBeCloseTo(10 - 1.5 * 0.75)
    expect(heightAt(map, 25, 27.5)).toBeGreaterThan(10)
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

    expect(stampCrater(map, { x: 25, z: 25, radius: 2, depth: 1 })).toEqual({ minX: 22, minZ: 22, maxX: 28, maxZ: 28 })
    expect(stampCrater(map, { x: 0.5, z: 49.5, radius: 2, depth: 1 })).toEqual({
      minX: 0,
      minZ: 46.5,
      maxX: 3.5,
      maxZ: 50
    })
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
