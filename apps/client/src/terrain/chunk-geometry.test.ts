import { createFlatMap, generateRollingTerrain, sampleIndex, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { buildChunkGeometry, type ChunkGeometry, sampleSteps } from "./chunk-geometry.ts"

function triples(geometry: ChunkGeometry, attribute: "positions" | "normals"): number[][] {
  const values = Array.from(geometry.vertexData[attribute] ?? [])
  return Array.from({ length: values.length / 3 }, (_, index) => values.slice(index * 3, index * 3 + 3))
}

function quads(values: ArrayLike<number> | null | undefined): number[][] {
  const flat = Array.from(values ?? [])
  return Array.from({ length: flat.length / 4 }, (_, index) => flat.slice(index * 4, index * 4 + 4))
}

describe("sampleSteps", () => {
  it("steps through samples and always ends on the last", () => {
    expect(sampleSteps(0, 8, 2)).toEqual([0, 2, 4, 6, 8])
    expect(sampleSteps(0, 7, 2)).toEqual([0, 2, 4, 6, 7])
    expect(sampleSteps(4, 4, 2)).toEqual([4])
  })
})

describe("buildChunkGeometry", () => {
  it("lays out a vertex grid at world positions with two triangles per quad", () => {
    const map = createFlatMap({ name: "test", cellSize: 0.5, columns: 8, rows: 8 }, 2)
    const geometry = buildChunkGeometry(map, { firstColumn: 4, lastColumn: 8, firstRow: 0, lastRow: 4 }, 2)
    const positions = triples(geometry, "positions")

    expect(positions).toHaveLength(9)
    expect(positions[0]).toEqual([2, 2, 0])
    expect(positions.at(-1)).toEqual([4, 2, 2])
    expect(geometry.vertexData.indices).toHaveLength(4 * 6)
    expect(geometry.splat).toHaveLength(9 * 4)
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
    const left = buildChunkGeometry(map, { firstColumn: 0, lastColumn: 64, firstRow: 0, lastRow: 64 }, 2)
    const right = buildChunkGeometry(map, { firstColumn: 64, lastColumn: 128, firstRow: 0, lastRow: 64 }, 2)
    const rowLength = 33

    for (let row = 0; row < 33; row++) {
      const leftEdge = row * rowLength + 32
      const rightEdge = row * rowLength
      expect(triples(right, "positions")[rightEdge]).toEqual(triples(left, "positions")[leftEdge])
      expect(triples(right, "normals")[rightEdge]).toEqual(triples(left, "normals")[leftEdge])
      expect(quads(right.vertexData.colors)[rightEdge]).toEqual(quads(left.vertexData.colors)[leftEdge])
      expect(quads(right.splat)[rightEdge]).toEqual(quads(left.splat)[leftEdge])
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
    const geometry = buildChunkGeometry(map, { firstColumn: 0, lastColumn: 4, firstRow: 0, lastRow: 4 }, 1)
    const [x, y, z] = triples(geometry, "normals")[12]

    expect(x).toBeCloseTo(-Math.SQRT1_2)
    expect(y).toBeCloseTo(Math.SQRT1_2)
    expect(z).toBeCloseTo(0)
  })

  it("weights surfaces by their share of the surrounding 2 m, blending across patch edges", () => {
    // A strip 20 m long: chalk to the west, churned ground to the east.
    const map = createFlatMap({ name: "strip", cellSize: 0.5, columns: 40, rows: 1 }, 0, Surface.Chalk)
    for (let column = 20; column <= 40; column++) {
      map.surfaces[sampleIndex(map, column, 0)] = Surface.Churned
      map.surfaces[sampleIndex(map, column, 1)] = Surface.Churned
    }
    const geometry = buildChunkGeometry(map, { firstColumn: 0, lastColumn: 40, firstRow: 0, lastRow: 1 }, 1)
    const weights = quads(geometry.splat)

    // Weights are [grass, mud, chalk, churned] and always sum to 1.
    expect(weights[2]).toEqual([0, 0, 1, 0])
    expect(weights[30]).toEqual([0, 0, 0, 1])
    expect(weights[20]?.[Surface.Chalk]).toBeCloseTo(0.4)
    expect(weights[20]?.[Surface.Churned]).toBeCloseTo(0.6)
    for (const vertex of weights) {
      expect(vertex.reduce((sum, weight) => sum + weight, 0)).toBeCloseTo(1)
    }
  })

  it("treats unknown surface values as mud rather than failing", () => {
    const map = createFlatMap({ name: "corrupt", cellSize: 0.5, columns: 1, rows: 1 })
    map.surfaces.fill(99)
    const geometry = buildChunkGeometry(map, { firstColumn: 0, lastColumn: 1, firstRow: 0, lastRow: 1 }, 1)

    expect(quads(geometry.splat)[0]).toEqual([0, 1, 0, 0])
  })

  it("varies brightness gently through the vertex colour, to hide texture tiling", () => {
    const map = createFlatMap({ name: "wide", cellSize: 0.5, columns: 400, rows: 400 })
    const geometry = buildChunkGeometry(map, { firstColumn: 0, lastColumn: 400, firstRow: 0, lastRow: 400 }, 8)
    const shades = quads(geometry.vertexData.colors)

    for (const [r, g, b, a] of shades) {
      expect(r).toBe(g)
      expect(g).toBe(b)
      expect(r).toBeGreaterThanOrEqual(0.82)
      expect(r).toBeLessThanOrEqual(1.18)
      expect(a).toBe(1)
    }
    const values = shades.map(([r]) => r)
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.1)
  })
})
