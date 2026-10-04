import { describe, expect, it } from "vitest"
import { createFlatMap, sampleIndex } from "./format.ts"
import { heightAt } from "./sampling.ts"

function slopedMap() {
  // A 2 x 2 cell map, 10 m cells, rising 1 m per metre east and 2 m per metre north.
  const map = createFlatMap({ name: "slope", cellSize: 10, columns: 2, rows: 2 })
  for (let row = 0; row <= 2; row++) {
    for (let column = 0; column <= 2; column++) {
      map.heights[sampleIndex(map, column, row)] = column * 10 + row * 20
    }
  }
  return map
}

describe("heightAt", () => {
  it("returns sample heights at grid corners", () => {
    const map = slopedMap()

    expect(heightAt(map, 0, 0)).toBe(0)
    expect(heightAt(map, 20, 0)).toBe(20)
    expect(heightAt(map, 20, 20)).toBe(60)
  })

  it("interpolates between samples", () => {
    const map = slopedMap()

    expect(heightAt(map, 5, 0)).toBeCloseTo(5)
    expect(heightAt(map, 15, 5)).toBeCloseTo(25)
    expect(heightAt(map, 12.5, 17.5)).toBeCloseTo(47.5)
  })

  it("clamps positions outside the map to its edge", () => {
    const map = slopedMap()

    expect(heightAt(map, -50, -50)).toBe(0)
    expect(heightAt(map, 500, 500)).toBe(60)
  })
})
