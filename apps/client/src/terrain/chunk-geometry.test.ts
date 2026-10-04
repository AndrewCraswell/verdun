import type { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import { createFlatMap, generateRollingTerrain, sampleIndex, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { surfaceColors } from "../palette.ts"
import { buildChunkGeometry, sampleSteps } from "./chunk-geometry.ts"

function triples(data: VertexData, attribute: "positions" | "normals"): number[][] {
  const values = Array.from(data[attribute] ?? [])
  return Array.from({ length: values.length / 3 }, (_, index) => values.slice(index * 3, index * 3 + 3))
}

function quads(data: VertexData): number[][] {
  const flat = Array.from(data.colors ?? [])
  return Array.from({ length: flat.length / 4 }, (_, index) => flat.slice(index * 4, index * 4 + 4))
}

/** True when a vertex colour is a surface's palette colour, give or take the gentle shading. */
function isShadeOf(color: number[] | undefined, surface: Surface): boolean {
  const palette = surfaceColors[surface]
  const ratio = (color?.[0] ?? 0) / palette.r
  const consistent = Math.abs((color?.[1] ?? 0) / palette.g - ratio) < 1e-6
  return ratio >= 0.9 - 1e-6 && ratio <= 1.1 + 1e-6 && consistent
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
    const data = buildChunkGeometry(
      map,
      { firstColumn: 4, lastColumn: 8, firstRow: 0, lastRow: 4 },
      2,
      surfaceColors
    ).vertexData
    const positions = triples(data, "positions")

    expect(positions).toHaveLength(9)
    expect(positions[0]).toEqual([2, 2, 0])
    expect(positions.at(-1)).toEqual([4, 2, 2])
    expect(data.indices).toHaveLength(4 * 6)
    expect(quads(data)).toHaveLength(9)
  })

  it("hangs a skirt below all four edges, seen from either side", () => {
    const map = createFlatMap({ name: "test", cellSize: 0.5, columns: 8, rows: 8 }, 2)
    // The south-west chunk: skirts along its south, north, west and east edges.
    const { vertexData, splat, wetness } = buildChunkGeometry(
      map,
      { firstColumn: 0, lastColumn: 4, firstRow: 0, lastRow: 4 },
      2,
      surfaceColors,
      undefined,
      1.5
    )
    const positions = triples(vertexData, "positions")

    expect(positions).toHaveLength(9 + 4 * 3)
    expect(positions.slice(9, 15)).toEqual([
      [0, 0.5, 0],
      [1, 0.5, 0],
      [2, 0.5, 0],
      [0, 0.5, 2],
      [1, 0.5, 2],
      [2, 0.5, 2]
    ])
    expect(splat).toHaveLength(21 * 4)
    expect(wetness).toHaveLength(21)
    // Two quads per edge, each drawn with both windings.
    expect(vertexData.indices).toHaveLength(4 * 6 + 4 * 2 * 12)
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
    const left = buildChunkGeometry(
      map,
      { firstColumn: 0, lastColumn: 64, firstRow: 0, lastRow: 64 },
      2,
      surfaceColors
    ).vertexData
    const right = buildChunkGeometry(
      map,
      { firstColumn: 64, lastColumn: 128, firstRow: 0, lastRow: 64 },
      2,
      surfaceColors
    ).vertexData
    const rowLength = 33

    for (let row = 0; row < 33; row++) {
      const leftEdge = row * rowLength + 32
      const rightEdge = row * rowLength
      expect(triples(right, "positions")[rightEdge]).toEqual(triples(left, "positions")[leftEdge])
      expect(triples(right, "normals")[rightEdge]).toEqual(triples(left, "normals")[leftEdge])
      expect(quads(right)[rightEdge]).toEqual(quads(left)[leftEdge])
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
    const data = buildChunkGeometry(
      map,
      { firstColumn: 0, lastColumn: 4, firstRow: 0, lastRow: 4 },
      1,
      surfaceColors
    ).vertexData
    const [x, y, z] = triples(data, "normals")[12]

    expect(x).toBeCloseTo(-Math.SQRT1_2)
    expect(y).toBeCloseTo(Math.SQRT1_2)
    expect(z).toBeCloseTo(0)
  })

  it("colours each surface flat, blending across patch edges", () => {
    // A strip 20 m long: chalk to the west, churned ground to the east.
    const map = createFlatMap({ name: "strip", cellSize: 0.5, columns: 40, rows: 1 }, 0, Surface.Chalk)
    for (let column = 20; column <= 40; column++) {
      map.surfaces[sampleIndex(map, column, 0)] = Surface.Churned
      map.surfaces[sampleIndex(map, column, 1)] = Surface.Churned
    }
    const colors = quads(
      buildChunkGeometry(map, { firstColumn: 0, lastColumn: 40, firstRow: 0, lastRow: 1 }, 1, surfaceColors).vertexData
    )

    expect(isShadeOf(colors[2], Surface.Chalk)).toBe(true)
    expect(isShadeOf(colors[30], Surface.Churned)).toBe(true)
    // On the edge, between the two.
    const edge = colors[20]?.[0] ?? 0
    expect(edge).toBeLessThan(surfaceColors[Surface.Chalk].r * 0.9)
    expect(edge).toBeGreaterThan(surfaceColors[Surface.Churned].r * 1.1)
    expect(colors[2]?.[3]).toBe(1)
  })

  it("weights the ground textures by the same blend, with the brightness variation last", () => {
    const map = createFlatMap({ name: "strip", cellSize: 0.5, columns: 40, rows: 1 }, 0, Surface.Grass)
    for (let column = 20; column <= 40; column++) {
      map.surfaces[sampleIndex(map, column, 0)] = Surface.Chalk
      map.surfaces[sampleIndex(map, column, 1)] = Surface.Chalk
    }
    const { vertexData, splat } = buildChunkGeometry(
      map,
      { firstColumn: 0, lastColumn: 40, firstRow: 0, lastRow: 1 },
      1,
      surfaceColors
    )
    const weights = (vertex: number) => Array.from(splat.subarray(vertex * 4, vertex * 4 + 4))

    expect(splat).toHaveLength(((vertexData.positions?.length ?? 0) / 3) * 4)
    expect(weights(2).slice(0, 3)).toEqual([1, 0, 0])
    expect(weights(30).slice(0, 3)).toEqual([0, 0, 1])
    const [grass = 0, , chalk = 0, shade = 0] = weights(20)
    expect(grass).toBeGreaterThan(0)
    expect(chalk).toBeGreaterThan(0)
    expect(grass + chalk).toBeCloseTo(1)
    expect(shade).toBeGreaterThan(0.85)
    expect(shade).toBeLessThan(1.15)
  })

  it("draws the heights and shading it is given instead of the map's", () => {
    const map = createFlatMap({ name: "test", cellSize: 0.5, columns: 4, rows: 4 }, 2)
    const bounds = { firstColumn: 0, lastColumn: 4, firstRow: 0, lastRow: 4 }
    const heights = new Float32Array(map.heights.length).fill(-1)
    const plain = buildChunkGeometry(map, bounds, 1, surfaceColors)
    const shaded = buildChunkGeometry(map, bounds, 1, surfaceColors, {
      heights,
      shade: new Float32Array(map.heights.length).fill(0.5)
    })

    expect(triples(shaded.vertexData, "positions").every(([, y]) => y === -1)).toBe(true)
    expect(shaded.splat[3]).toBeCloseTo((plain.splat[3] ?? 0) * 0.5)
  })

  it("treats unknown surface values as mud rather than failing", () => {
    const map = createFlatMap({ name: "corrupt", cellSize: 0.5, columns: 1, rows: 1 })
    map.surfaces.fill(99)
    const [first] = quads(
      buildChunkGeometry(map, { firstColumn: 0, lastColumn: 1, firstRow: 0, lastRow: 1 }, 1, surfaceColors).vertexData
    )

    expect(isShadeOf(first, Surface.Mud)).toBe(true)
  })

  it("varies brightness gently, so wide fields of one surface don't look like plastic", () => {
    const map = createFlatMap({ name: "wide", cellSize: 0.5, columns: 400, rows: 400 }, 0, Surface.Grass)
    const reds = quads(
      buildChunkGeometry(map, { firstColumn: 0, lastColumn: 400, firstRow: 0, lastRow: 400 }, 8, surfaceColors)
        .vertexData
    ).map(([r]) => r ?? 0)

    expect(Math.max(...reds) - Math.min(...reds)).toBeGreaterThan(surfaceColors[Surface.Grass].r * 0.05)
    expect(Math.max(...reds)).toBeLessThanOrEqual(surfaceColors[Surface.Grass].r * 1.1 + 1e-6)
  })
})
