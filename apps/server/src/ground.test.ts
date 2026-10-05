import { createFlatMap, stampCrater, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { groundOf, reshapedGround, restoreGround, saveGround } from "./ground.ts"

const field = () => createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 10, Surface.Grass)

describe("the saved ground", () => {
  it("puts the craters back into a freshly generated map", () => {
    const map = field()
    const generated = groundOf(map)
    stampCrater(map, { x: 40, z: 60, radius: 3, depth: 1.5 })
    stampCrater(map, { x: 70, z: 30, radius: 5, depth: 2 })
    const saved = saveGround(map, generated)

    const fresh = field()
    expect(restoreGround(fresh, saved)).toBe(true)
    expect(fresh.surfaces).toEqual(map.surfaces)
    for (let sample = 0; sample < map.heights.length; sample++) {
      expect(fresh.heights[sample]).toBeCloseTo(map.heights[sample] ?? 0, 5)
    }
  })

  it("packs unshelled ground small", () => {
    const map = field()
    const saved = saveGround(map, groundOf(map))

    expect(saved.heights.byteLength + saved.surfaces.byteLength).toBeLessThan(map.heights.byteLength / 100)
  })

  it("lands the craters on new ground when a build has changed the terrain", () => {
    const map = field()
    const generated = groundOf(map)
    stampCrater(map, { x: 50, z: 50, radius: 4, depth: 2 })
    const saved = saveGround(map, generated)

    const raised = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 12, Surface.Grass)
    restoreGround(raised, saved)
    const centre = 100 * 201 + 100
    expect(raised.heights[centre]).toBeCloseTo((map.heights[centre] ?? 0) + 2, 5)
  })

  it("leaves a map of another size as generated", () => {
    const map = field()
    const generated = groundOf(map)
    stampCrater(map, { x: 50, z: 50, radius: 4, depth: 2 })
    const saved = saveGround(map, generated)

    const other = createFlatMap({ name: "other", cellSize: 0.5, columns: 100, rows: 100 }, 10, Surface.Grass)
    expect(restoreGround(other, saved)).toBe(false)
    expect(other.heights.every((height) => height === 10)).toBe(true)
  })
})

describe("the ground for a player joining late", () => {
  it("is nothing while no shell has fallen", () => {
    const map = field()

    expect(reshapedGround(map, groundOf(map))).toBeNull()
  })

  it("covers every crater, and brings a fresh map's ground to the battle's", () => {
    const map = field()
    const generated = groundOf(map)
    stampCrater(map, { x: 20, z: 30, radius: 2, depth: 1 })
    stampCrater(map, { x: 80, z: 60, radius: 3, depth: 1.5 })
    const patch = reshapedGround(map, generated)
    if (!patch) {
      throw new Error("No patch for the craters")
    }

    const fresh = field()
    let at = 0
    for (let row = patch.minRow; row <= patch.maxRow; row++) {
      for (let column = patch.minColumn; column <= patch.maxColumn; column++) {
        const sample = row * (fresh.columns + 1) + column
        fresh.heights[sample] = patch.heights[at] ?? 0
        fresh.surfaces[sample] = patch.surfaces[at] ?? 0
        at++
      }
    }
    expect(fresh.heights).toEqual(map.heights)
    expect(fresh.surfaces).toEqual(map.surfaces)
  })
})
