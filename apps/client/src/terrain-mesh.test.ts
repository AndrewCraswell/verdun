import { createFlatMap, sampleIndex } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { buildTerrainVertexData } from "./terrain-mesh.ts"

describe("buildTerrainVertexData", () => {
  it("samples every step-th height into a vertex grid", () => {
    const map = createFlatMap({ name: "test", cellSize: 0.5, columns: 8, rows: 4 })
    map.heights[sampleIndex(map, 8, 4)] = 7

    const data = buildTerrainVertexData(map, 2)

    // (8 / 2 + 1) x (4 / 2 + 1) vertices, two triangles per quad.
    expect(data.positions).toHaveLength(5 * 3 * 3)
    expect(data.indices).toHaveLength(4 * 2 * 6)
    expect(data.uvs).toHaveLength(5 * 3 * 2)
    // The far corner vertex sits at (4 m, 7 m, 2 m).
    expect(Array.from(data.positions ?? []).slice(-3)).toEqual([4, 7, 2])
  })

  it("winds triangles so flat ground faces up", () => {
    const data = buildTerrainVertexData(createFlatMap({ name: "flat", cellSize: 1, columns: 4, rows: 4 }), 1)
    const normals = Array.from(data.normals ?? [])

    for (let index = 0; index < normals.length; index += 3) {
      expect(normals[index + 1]).toBeCloseTo(1)
    }
  })

  it("rejects steps that are not positive integers", () => {
    const map = createFlatMap({ name: "test", cellSize: 1, columns: 4, rows: 4 })

    expect(() => buildTerrainVertexData(map, 0)).toThrow(RangeError)
    expect(() => buildTerrainVertexData(map, 1.5)).toThrow(RangeError)
  })
})
