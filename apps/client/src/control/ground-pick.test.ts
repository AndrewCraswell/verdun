import { createFlatMap, sampleIndex } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { marchToGround } from "./ground-pick.ts"

/** 100 m square, flat at 5 m, with a 10 m wall of ground along x = 70 to 72. */
function field() {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5)
  for (let row = 0; row <= map.rows; row++) {
    for (let column = 140; column <= 144; column++) {
      map.heights[sampleIndex(map, column, row)] = 15
    }
  }
  return map
}

const down45 = { x: Math.SQRT1_2, y: -Math.SQRT1_2, z: 0 }

describe("marchToGround", () => {
  it("finds where a ray looking down meets the ground, to a centimetre", () => {
    const hit = marchToGround(field(), { x: 10, y: 25, z: 50 }, down45)

    expect(hit?.x).toBeCloseTo(30, 2)
    expect(hit?.z).toBeCloseTo(50, 2)
  })

  it("stops at a rise in the way rather than the ground beyond it", () => {
    // Nearly level at 14 m: it would meet the flat ground far off the map, but the 15 m rise is in the way.
    const hit = marchToGround(field(), { x: 40, y: 14, z: 50 }, { x: 0.9998, y: -0.02, z: 0 })

    expect(hit?.x).toBeGreaterThan(69)
    expect(hit?.x).toBeLessThan(72)
  })

  it("comes in over the map's edge, and misses a ray looking at the sky", () => {
    expect(marchToGround(field(), { x: -50, y: 60, z: 50 }, down45)?.x).toBeCloseTo(5, 1)
    expect(marchToGround(field(), { x: 50, y: 20, z: 50 }, { x: 0, y: 1, z: 0 })).toBeNull()
  })
})
