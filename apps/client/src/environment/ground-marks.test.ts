import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { ToHalfFloat } from "@babylonjs/core/Misc/textureTools"
import { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, createFlatMap, generateFleurySector, sampleIndex, stampCrater } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { basinsOf, createGroundMarks, type GroundMarks } from "./ground-marks.ts"

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

/**
 * The basins as they were found before their buffers were kept, with fresh buffers for every blur: what the kept
 * buffers must give bit for bit. A 1 m step, as the game uses.
 */
function freshBasinsOf(map: BattlefieldMap) {
  const blur = (values: Float32Array, width: number, height: number, radius: number) => {
    const pass = (
      from: Float32Array,
      to: Float32Array,
      length: number,
      lines: number,
      along: number,
      across: number
    ) => {
      for (let line = 0; line < lines; line++) {
        let sum = 0
        let count = 0
        for (let index = 0; index < Math.min(radius, length); index++) {
          sum += from[line * across + index * along]!
          count++
        }
        for (let index = 0; index < length; index++) {
          if (index + radius < length) {
            sum += from[line * across + (index + radius) * along]!
            count++
          }
          if (index - radius - 1 >= 0) {
            sum -= from[line * across + (index - radius - 1) * along]!
            count--
          }
          to[line * across + index * along] = sum / count
        }
      }
    }
    const a = new Float32Array(values.length)
    const b = new Float32Array(values.length)
    pass(values, a, width, height, 1, width)
    pass(a, b, height, width, width, 1)
    pass(b, a, width, height, 1, width)
    pass(a, b, height, width, width, 1)
    return b
  }
  const stride = Math.max(1, Math.round(1 / map.cellSize))
  const width = Math.floor(map.columns / stride) + 1
  const height = Math.floor(map.rows / stride) + 1
  const ground = new Float32Array(width * height)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      ground[row * width + column] = map.heights[sampleIndex(map, column * stride, row * stride)] ?? 0
    }
  }
  const mean = blur(ground, width, height, Math.max(1, Math.round(3 / (stride * map.cellSize) / 2)))
  const level = new Float32Array(width * height)
  for (let index = 0; index < level.length; index++) {
    level[index] = Math.min(mean[index]!, ground[index]! + 0.25)
  }
  const pool = blur(ground, width, height, Math.max(1, Math.round(25 / (stride * map.cellSize) / 2)))
  return { level, pool }
}

/** The basin texture's half floats for basins, as they were encoded before: water level in red, fog pool in green. */
function freshEncoding({ level, pool }: { level: Float32Array; pool: Float32Array }, base: number) {
  const half = new Uint16Array(level.length * 2)
  for (let index = 0; index < level.length; index++) {
    half[index * 2] = ToHalfFloat(level[index]! - base)
    half[index * 2 + 1] = ToHalfFloat(pool[index]! - base)
  }
  return half
}

/** What the basin texture was last given, as the null engine keeps it. */
function basinData(marks: GroundMarks): Uint16Array {
  const data = marks.basins.getInternalTexture()?._bufferView
  if (!(data instanceof Uint16Array)) {
    throw new Error("The basin texture holds no half floats")
  }
  return data
}

/** The first index at which two arrays' bits differ, or -1 if they are the same bit for bit. */
function firstDifference(actual: Float32Array | Uint16Array, expected: Float32Array | Uint16Array): number {
  const bits = (values: Float32Array | Uint16Array) =>
    values instanceof Float32Array ? new Uint32Array(values.buffer, values.byteOffset, values.length) : values
  const [got, wanted] = [bits(actual), bits(expected)]
  if (got.length !== wanted.length) {
    return Math.min(got.length, wanted.length)
  }
  return got.findIndex((value, index) => value !== wanted[index])
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
    // Fog pools below the lie of the land round about: in the crater's floor, not on the level field.
    const pool = (x: number, z: number) => basins.pool[z * basins.width + x]!
    expect(pool(20, 20)).toBeGreaterThan(9)
    expect(pool(20, 20)).toBeLessThan(10)
    expect(pool(5, 5)).toBeCloseTo(10, 1)
  })

  it("are found in kept buffers bit for bit as in fresh ones, on the generated sector and again after craters", () => {
    const map = generateFleurySector({ seed: 1916 })
    const fresh = freshBasinsOf(map)
    const basins = basinsOf(map)
    expect(firstDifference(basins.level, fresh.level)).toBe(-1)
    expect(firstDifference(basins.pool, fresh.pool)).toBe(-1)

    const engine = new NullEngine()
    engines.push(engine)
    const marks = createGroundMarks(new Scene(engine), map)
    const base = fresh.level.reduce((lowest, level) => Math.min(lowest, level), Number.POSITIVE_INFINITY)
    expect(marks.base).toBe(base)
    expect(firstDifference(basinData(marks), freshEncoding(fresh, base))).toBe(-1)

    // Shelling reshapes the ground, and the basins are found again in the buffers the first ones were found in.
    for (const at of [
      { x: 300, z: 200 },
      { x: 302, z: 203 },
      { x: 120, z: 340 },
      { x: 480, z: 90 }
    ]) {
      stampCrater(map, { ...at, radius: 3, depth: 1.4 })
    }
    marks.reshape()
    const reshaped = freshBasinsOf(map)
    expect(firstDifference(reshaped.level, fresh.level)).not.toBe(-1)
    expect(firstDifference(basinData(marks), freshEncoding(reshaped, base))).toBe(-1)
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

  it("leave the hollows unfound and the basin texture flat without basins, as on the low setting", () => {
    const engine = new NullEngine()
    engines.push(engine)
    const map = cratered()
    const marks = createGroundMarks(new Scene(engine), map, { basins: false })
    expect(marks.base).toBe(0)
    expect(basinData(marks).every((half) => half === 0)).toBe(true)
    stampCrater(map, { x: 10, z: 10, radius: 3, depth: 1 })
    marks.reshape()
    expect(basinData(marks).every((half) => half === 0)).toBe(true)
    marks.dispose()
  })
})
