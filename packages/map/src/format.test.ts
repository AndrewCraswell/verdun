import { describe, expect, it } from "vitest"
import { createFlatMap, MAP_FORMAT_VERSION, mapDepth, mapWidth, sampleCount, sampleIndex, Surface } from "./format.ts"

describe("createFlatMap", () => {
  it("allocates one height sample per grid corner at the given height", () => {
    const map = createFlatMap({ name: "test", cellSize: 0.5, columns: 4, rows: 2 }, 3)

    expect(map.version).toBe(MAP_FORMAT_VERSION)
    expect(map.heights).toHaveLength(sampleCount(4, 2))
    expect(map.heights).toHaveLength(15)
    expect(Array.from(map.heights).every((height) => height === 3)).toBe(true)
  })

  it("gives every sample a surface, mud unless asked otherwise", () => {
    const muddy = createFlatMap({ name: "test", cellSize: 1, columns: 2, rows: 2 })
    const grassy = createFlatMap({ name: "test", cellSize: 1, columns: 2, rows: 2 }, 0, Surface.Grass)

    expect(muddy.surfaces).toHaveLength(9)
    expect(Array.from(muddy.surfaces).every((surface) => surface === Surface.Mud)).toBe(true)
    expect(Array.from(grassy.surfaces).every((surface) => surface === Surface.Grass)).toBe(true)
  })

  it("reports its size in metres", () => {
    const map = createFlatMap({ name: "test", cellSize: 0.5, columns: 1200, rows: 800 })

    expect(mapWidth(map)).toBe(600)
    expect(mapDepth(map)).toBe(400)
  })

  it("rejects maps without whole cells", () => {
    expect(() => createFlatMap({ name: "test", cellSize: 1, columns: 0, rows: 2 })).toThrow(RangeError)
    expect(() => createFlatMap({ name: "test", cellSize: 1, columns: 2.5, rows: 2 })).toThrow(RangeError)
  })

  it("rejects non-positive cell sizes", () => {
    expect(() => createFlatMap({ name: "test", cellSize: 0, columns: 2, rows: 2 })).toThrow(RangeError)
    expect(() => createFlatMap({ name: "test", cellSize: Number.NaN, columns: 2, rows: 2 })).toThrow(RangeError)
  })
})

describe("sampleIndex", () => {
  it("stores samples row by row", () => {
    const map = createFlatMap({ name: "test", cellSize: 1, columns: 3, rows: 2 })

    expect(sampleIndex(map, 0, 0)).toBe(0)
    expect(sampleIndex(map, 3, 0)).toBe(3)
    expect(sampleIndex(map, 0, 1)).toBe(4)
    expect(sampleIndex(map, 3, 2)).toBe(11)
  })
})
