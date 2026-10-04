import { describe, expect, it } from "vitest"
import { createFlatMap } from "./format.ts"
import { generateRollingTerrain } from "./generate.ts"
import { fromMapDocument, toMapDocument } from "./serialization.ts"

describe("map documents", () => {
  it("round-trip through JSON", () => {
    const map = generateRollingTerrain({
      name: "sector",
      widthMeters: 20,
      depthMeters: 10,
      cellSize: 1,
      seed: 7,
      amplitude: 5
    })

    const file = JSON.stringify(toMapDocument(map))
    const restored = fromMapDocument(JSON.parse(file))

    expect(restored).toEqual(map)
  })

  it("rejects documents that are not objects", () => {
    expect(() => fromMapDocument(null)).toThrow("must be an object")
    expect(() => fromMapDocument("map")).toThrow("must be an object")
  })

  it("rejects unknown format versions", () => {
    const document = { ...toMapDocument(createFlatMap({ name: "m", cellSize: 1, columns: 1, rows: 1 })), version: 99 }

    expect(() => fromMapDocument(document)).toThrow("Unsupported map format version 99")
  })

  it("rejects malformed fields", () => {
    const valid = toMapDocument(createFlatMap({ name: "m", cellSize: 1, columns: 1, rows: 1 }))

    expect(() => fromMapDocument({ ...valid, name: 3 })).toThrow("name")
    expect(() => fromMapDocument({ ...valid, cellSize: -1 })).toThrow("cell size")
    expect(() => fromMapDocument({ ...valid, columns: 1.5 })).toThrow("columns and rows")
    expect(() => fromMapDocument({ ...valid, heights: [0, 0, 0] })).toThrow("4 finite numbers")
    expect(() => fromMapDocument({ ...valid, heights: [0, 0, 0, Number.NaN] })).toThrow("4 finite numbers")
  })
})
