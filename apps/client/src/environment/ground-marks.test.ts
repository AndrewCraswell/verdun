import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, sampleIndex } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { basinsOf, createGroundMarks } from "./ground-marks.ts"

const engines: NullEngine[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

/** A level field 40 m square at 10 m, with a crater 1 m deep and 3 m across at (20, 20). */
function cratered() {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 80, rows: 80 }, 10)
  for (let row = 0; row <= 80; row++) {
    for (let column = 0; column <= 80; column++) {
      const distance = Math.sqrt((column * 0.5 - 20) ** 2 + (row * 0.5 - 20) ** 2) / 3
      if (distance < 1) {
        map.heights[sampleIndex(map, column, row)] = 10 - (1 - distance * distance)
      }
    }
  }
  return map
}

describe("the ground's basins", () => {
  it("hold water in a crater, a hand's depth at most, and none on level ground", () => {
    const basins = basinsOf(cratered())
    expect(basins.step).toBe(1)
    expect(basins.width).toBe(41)
    const at = (x: number, z: number) => basins.level[z * basins.width + x]!
    // The crater's floor is at 9 m; water could stand on it, but never more than 25 cm deep.
    expect(at(20, 20)).toBeGreaterThan(9.1)
    expect(at(20, 20)).toBeLessThanOrEqual(9.25 + 1e-6)
    // Level ground far from it holds none: the water line is the ground itself.
    expect(at(5, 5)).toBeCloseTo(10, 5)
  })
})

describe("the ground marks", () => {
  it("tread trails in lying snow, let fresh snow fill them, and clear when it thaws", () => {
    const engine = new NullEngine()
    engines.push(engine)
    const marks = createGroundMarks(new Scene(engine), cratered())
    expect(marks.base).toBeLessThan(9.3)
    const at = (x: number, z: number) => marks.trodden[z * 41 + x]!

    marks.tread([{ x: 10.2, z: 30.4 }], 10)
    expect(at(10, 30)).toBeGreaterThan(200)
    expect(at(11, 30)).toBeGreaterThan(50)
    expect(at(15, 30)).toBe(0)

    marks.tread([], 12)
    expect(at(10, 30)).toBeLessThan(200)
    expect(at(10, 30)).toBeGreaterThan(50)

    marks.tread([], 0)
    expect(at(10, 30)).toBe(0)
    marks.reshape()
    marks.dispose()
  })
})
