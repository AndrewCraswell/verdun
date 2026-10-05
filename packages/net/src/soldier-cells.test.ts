import { describe, expect, it } from "vitest"
import { applyCellPatch, cellGrid, cellOf, cellPatches, cellsNear, soldierArray } from "./soldier-cells.ts"

/** Fleury's 600 by 400 m in 100 m cells: six across, four down. */
const grid = cellGrid(600, 400, 100)

describe("the map's cells", () => {
  it("number the cells row by row, and put points off the map in the nearest", () => {
    expect(grid).toEqual({ size: 100, columns: 6, rows: 4 })
    expect(cellOf(grid, 50, 50)).toBe(0)
    expect(cellOf(grid, 550, 50)).toBe(5)
    expect(cellOf(grid, 50, 150)).toBe(6)
    expect(cellOf(grid, -20, 900)).toBe(18)
    expect(cellGrid(10, 10, 100)).toEqual({ size: 100, columns: 1, rows: 1 })
  })

  it("count the cells any part of which is within a radius of a man", () => {
    // In the middle of cell 8: its neighbours' edges are 50 m away, their corners about 71 m.
    expect([...cellsNear(grid, [{ x: 250, z: 150 }], 40)]).toEqual([8])
    expect([...cellsNear(grid, [{ x: 250, z: 150 }], 60)].sort((a, b) => a - b)).toEqual([2, 7, 8, 9, 14])
    expect(cellsNear(grid, [{ x: 250, z: 150 }], 80).size).toBe(9)
    expect(cellsNear(grid, [], 120).size).toBe(0)
  })
})

describe("a cell's changes", () => {
  it("are the soldiers in it whose values changed, by array, with their new values", () => {
    const previous = { "position.x": Uint16Array.of(10, 20, 30), "health.value": Float32Array.of(1, 1, 1) }
    const next = { "position.x": Uint16Array.of(10, 25, 35), "health.value": Float32Array.of(1, 0.5, 1) }
    const patches = cellPatches(previous, next, Int32Array.of(0, 0, 3))

    expect(patches.get(0)).toEqual({
      "position.x": [Uint16Array.of(1), Uint16Array.of(25)],
      "health.value": [Uint16Array.of(1), Float32Array.of(0.5)]
    })
    expect(patches.get(3)).toEqual({ "position.x": [Uint16Array.of(2), Uint16Array.of(35)] })

    const mirror = { "position.x": Uint16Array.of(10, 20, 30), "health.value": Float32Array.of(1, 1, 1) }
    for (const patch of patches.values()) {
      applyCellPatch(mirror, patch, 3)
    }
    expect(mirror).toEqual(next)
  })

  it("send every value of a man who's crossed into a cell, and of new men, lengthening the arrays", () => {
    const previous = { "health.value": Float32Array.of(1, 1) }
    const next = { "health.value": Float32Array.of(1, 1, 0.8) }
    const patches = cellPatches(previous, next, Int32Array.of(0, 1, 1), new Set([1]))

    expect(patches.get(1)).toEqual({ "health.value": [Uint16Array.of(1, 2), Float32Array.of(1, 0.8)] })
    const mirror: Record<string, Float32Array> = { "health.value": Float32Array.of(1, 1) }
    applyCellPatch(mirror, patches.get(1), 3)
    expect(mirror["health.value"]).toEqual(Float32Array.of(1, 1, 0.8))
    expect(cellPatches(null, next, Int32Array.of(0, 0, 0)).get(0)?.["health.value"]?.[0]).toEqual(
      Uint16Array.of(0, 1, 2)
    )
  })

  it("refuse changes that don't fit the battle, and kinds of array they can't carry", () => {
    const arrays = { "health.value": Float32Array.of(1) }

    expect(() => applyCellPatch(arrays, null, 1)).toThrow("A cell's changes aren't a record")
    expect(() => applyCellPatch(arrays, { "morale.value": [Uint16Array.of(0), Float32Array.of(1)] }, 1)).toThrow(
      "A cell's changes to morale.value don't fit the battle"
    )
    expect(() => applyCellPatch(arrays, { "health.value": [[0], [1]] }, 1)).toThrow(
      "A cell's changes to health.value don't fit the battle"
    )
    expect(() => soldierArray("BigInt64Array", 1)).toThrow(
      "The soldiers' arrays hold a BigInt64Array, which can't be sent"
    )
  })
})
