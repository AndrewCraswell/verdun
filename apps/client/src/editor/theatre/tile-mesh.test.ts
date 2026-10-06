import { describe, expect, it } from "vitest"
import { buildTile } from "./tile-mesh.ts"

describe("buildTile", () => {
  const request = {
    id: 7,
    box: { x0: 100, z0: 200, x1: 110, z1: 210 },
    samples: 3,
    lidarUrl: "",
    fallbackUrl: "",
    base: 170,
    skirt: 25
  }
  // North row first, as IGN sends it.
  const raw = Float32Array.from([176, 177, 178, 173, 174, 175, 170, 171, 172])
  const tile = buildTile(request, raw)

  it("puts the south row first, heights above the base", () => {
    expect(tile.id).toBe(7)
    expect(Array.from(tile.positions.slice(0, 9))).toEqual([100, 0, 200, 105, 1, 200, 110, 2, 200])
    expect(Array.from(tile.positions.slice(18, 27))).toEqual([100, 6, 210, 105, 7, 210, 110, 8, 210])
  })

  it("hangs skirts below the edges and lights the top from above", () => {
    // 9 corners, then two skirt corners for each of the 4 edges' 2 segments.
    expect(tile.positions.length / 3).toBe(9 + 4 * 2 * 2)
    expect(tile.positions[9 * 3 + 1]).toBe(0 - 25)
    expect(tile.indices.length).toBe(2 * 2 * 6 + 4 * 2 * 12)
    expect(tile.normals[4 * 3 + 1]).toBeGreaterThan(0)
  })
})
