import { createFlatMap, generateRollingTerrain, sampleIndex, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { surfaceColors } from "../palette.ts"
import { buildChunkVertexData, sampleSteps } from "./chunk-geometry.ts"

function vertices(data: ReturnType<typeof buildChunkVertexData>, attribute: "positions" | "normals") {
  const values = Array.from(data[attribute] ?? [])
  return Array.from({ length: values.length / 3 }, (_, index) => values.slice(index * 3, index * 3 + 3))
}

describe("sampleSteps", () => {
  it("steps through samples and always ends on the last", () => {
    expect(sampleSteps(0, 8, 2)).toEqual([0, 2, 4, 6, 8])
    expect(sampleSteps(0, 7, 2)).toEqual([0, 2, 4, 6, 7])
    expect(sampleSteps(4, 4, 2)).toEqual([4])
  })
})

describe("buildChunkVertexData", () => {
  it("lays out a vertex grid at world positions with two triangles per quad", () => {
    const map = createFlatMap({ name: "test", cellSize: 0.5, columns: 8, rows: 8 }, 2)
    const data = buildChunkVertexData(map, { firstColumn: 4, lastColumn: 8, firstRow: 0, lastRow: 4 }, 2, surfaceColors)
    const positions = vertices(data, "positions")

    expect(positions).toHaveLength(9)
    expect(positions[0]).toEqual([2, 2, 0])
    expect(positions.at(-1)).toEqual([4, 2, 2])
    expect(data.indices).toHaveLength(4 * 6)
  })

  it("matches its neighbour exactly along a shared edge, so there are no seams", () => {
    const map = generateRollingTerrain({
      name: "test",
      widthMeters: 64,
      depthMeters: 32,
      cellSize: 0.5,
      seed: 9,
      amplitude: 10
    })
    const left = buildChunkVertexData(
      map,
      { firstColumn: 0, lastColumn: 64, firstRow: 0, lastRow: 64 },
      2,
      surfaceColors
    )
    const right = buildChunkVertexData(
      map,
      { firstColumn: 64, lastColumn: 128, firstRow: 0, lastRow: 64 },
      2,
      surfaceColors
    )
    const rowLength = 33

    for (let row = 0; row < 33; row++) {
      const leftEdge = row * rowLength + 32
      const rightEdge = row * rowLength
      expect(vertices(right, "positions")[rightEdge]).toEqual(vertices(left, "positions")[leftEdge])
      expect(vertices(right, "normals")[rightEdge]).toEqual(vertices(left, "normals")[leftEdge])
      expect(Array.from(right.colors ?? []).slice(rightEdge * 4, rightEdge * 4 + 4)).toEqual(
        Array.from(left.colors ?? []).slice(leftEdge * 4, leftEdge * 4 + 4)
      )
    }
  })

  it("tilts normals away from rising ground", () => {
    // Rises 1 m for every metre east.
    const map = createFlatMap({ name: "slope", cellSize: 1, columns: 4, rows: 4 })
    for (let row = 0; row <= 4; row++) {
      for (let column = 0; column <= 4; column++) {
        map.heights[sampleIndex(map, column, row)] = column
      }
    }
    const [x, y, z] = vertices(
      buildChunkVertexData(map, { firstColumn: 0, lastColumn: 4, firstRow: 0, lastRow: 4 }, 1, surfaceColors),
      "normals"
    )[12]

    expect(x).toBeCloseTo(-Math.SQRT1_2)
    expect(y).toBeCloseTo(Math.SQRT1_2)
    expect(z).toBeCloseTo(0)
  })

  it("colours vertices by surface, blending softly across patch edges", () => {
    // A strip 20 m long: chalk to the west, churned ground to the east, and one corrupt value at the far east.
    const map = createFlatMap({ name: "strip", cellSize: 0.5, columns: 40, rows: 1 }, 0, Surface.Chalk)
    for (let column = 20; column <= 40; column++) {
      map.surfaces[sampleIndex(map, column, 0)] = Surface.Churned
      map.surfaces[sampleIndex(map, column, 1)] = Surface.Churned
    }
    map.surfaces[sampleIndex(map, 40, 0)] = 99
    const colors = Array.from(
      buildChunkVertexData(map, { firstColumn: 0, lastColumn: 40, firstRow: 0, lastRow: 1 }, 1, surfaceColors).colors ??
        []
    )
    const red = (column: number) => colors[column * 4]
    const within = (value: number, expected: number) => value >= expected * 0.9 - 1e-6 && value <= expected * 1.1 + 1e-6

    // Deep inside each patch, the vertex takes that surface's colour (give or take shading).
    expect(within(red(2), surfaceColors[Surface.Chalk].r)).toBe(true)
    expect(within(red(30), surfaceColors[Surface.Churned].r)).toBe(true)
    // On the boundary, it sits between the two.
    expect(red(20)).toBeLessThan(surfaceColors[Surface.Chalk].r * 0.9)
    expect(red(20)).toBeGreaterThan(surfaceColors[Surface.Churned].r * 1.1)
    expect(colors[3]).toBe(1)
  })

  it("treats unknown surface values as mud rather than failing", () => {
    const map = createFlatMap({ name: "corrupt", cellSize: 0.5, columns: 1, rows: 1 })
    map.surfaces.fill(99)
    const colors = Array.from(
      buildChunkVertexData(map, { firstColumn: 0, lastColumn: 1, firstRow: 0, lastRow: 1 }, 1, surfaceColors).colors ??
        []
    )

    expect(colors[0] / surfaceColors[Surface.Mud].r).toBeGreaterThanOrEqual(0.9)
    expect(colors[0] / surfaceColors[Surface.Mud].r).toBeLessThanOrEqual(1.1)
  })
})
