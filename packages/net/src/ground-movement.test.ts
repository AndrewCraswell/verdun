import { createFlatMap, stampCrater, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { groundFromMovement, groundMovement } from "./ground-movement.ts"

const field = () => createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 10, Surface.Grass)
const generated = (map: ReturnType<typeof field>) => ({ heights: map.heights.slice(), surfaces: map.surfaces.slice() })

describe("the ground a late player is sent", () => {
  it("is nothing while no shell has fallen", () => {
    const map = field()

    expect(groundMovement(map, generated(map))).toBeNull()
  })

  it("brings a freshly generated map's ground to the battle's, to the millimetre", () => {
    const map = field()
    const before = generated(map)
    stampCrater(map, { x: 20, z: 30, radius: 2, depth: 1 })
    stampCrater(map, { x: 80, z: 60, radius: 3, depth: 1.5 })
    const movement = groundMovement(map, before)
    if (!movement) {
      throw new Error("No movement for the craters")
    }

    const fresh = field()
    const patch = groundFromMovement(fresh, movement)
    let at = 0
    for (let row = patch.minRow; row <= patch.maxRow; row++) {
      for (let column = patch.minColumn; column <= patch.maxColumn; column++) {
        const sample = row * (fresh.columns + 1) + column
        expect(patch.heights[at]).toBeCloseTo(map.heights[sample] ?? 0, 3)
        expect(patch.surfaces[at]).toBe(map.surfaces[sample])
        at++
      }
    }
    expect(patch.minColumn).toBeGreaterThan(0)
    expect(patch.maxRow).toBeLessThan(200)
  })
})
