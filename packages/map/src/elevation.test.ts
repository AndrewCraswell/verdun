import { describe, expect, it } from "vitest"
import { decodeElevation, elevationAt } from "./elevation.ts"

/** An elevation file of `columns` x `rows` cells, each sample's height in centimetres given by `height`. */
function file(
  columns: number,
  rows: number,
  cellSize: number,
  base: number,
  height: (column: number, row: number) => number
) {
  const samples = (columns + 1) * (rows + 1)
  const bytes = new DataView(new ArrayBuffer(20 + samples * 2))
  bytes.setUint32(0, 0x4c45_4456, true)
  bytes.setUint16(4, 1, true)
  bytes.setUint16(6, columns, true)
  bytes.setUint16(8, rows, true)
  bytes.setFloat32(12, cellSize, true)
  bytes.setFloat32(16, base, true)
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      bytes.setUint16(20 + (row * (columns + 1) + column) * 2, height(column, row), true)
    }
  }
  return bytes.buffer
}

describe("decodeElevation", () => {
  it("reads the grid, in metres above its base, row by row from the south", () => {
    const elevation = decodeElevation(file(2, 1, 0.5, 301, (column, row) => column * 100 + row * 1000))

    expect([elevation.columns, elevation.rows, elevation.cellSize, elevation.base]).toEqual([2, 1, 0.5, 301])
    expect(Array.from(elevation.heights)).toEqual([0, 1, 2, 10, 11, 12])
  })

  it("rejects anything else", () => {
    expect(() => decodeElevation(new ArrayBuffer(4))).toThrow("too short")
    expect(() => decodeElevation(new ArrayBuffer(40))).toThrow("Not an elevation file")
    const truncated = file(2, 2, 1, 0, () => 0).slice(0, 30)
    expect(() => decodeElevation(new Uint8Array(truncated))).toThrow("should hold 9 samples")
  })
})

describe("elevationAt", () => {
  it("interpolates between samples and clamps outside the grid", () => {
    const elevation = decodeElevation(file(2, 2, 1, 0, (column) => column * 100))

    expect(elevationAt(elevation, 0.5, 1)).toBeCloseTo(0.5)
    expect(elevationAt(elevation, 1.25, 0.3)).toBeCloseTo(1.25)
    expect(elevationAt(elevation, -5, 1)).toBe(0)
    expect(elevationAt(elevation, 9, 9)).toBe(2)
  })
})
