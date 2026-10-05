import { createFlatMap, Surface, type Trench } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { FIRE_STEP_MIDDLE, nearestTrench, onFireStep, placeOn, pointAlong } from "./trench-lines.ts"

/** A north-facing fire trench: east 10 m, then a traverse north-east, then east again; a repeated point in it. */
const fire: Trench = {
  kind: "fire",
  points: [
    [0, 0],
    [10, 0],
    [10, 0],
    [16, 6],
    [26, 6]
  ],
  facing: "north"
}
const southward: Trench = {
  kind: "fire",
  points: [
    [0, 50],
    [20, 50]
  ],
  facing: "south"
}
const communication: Trench = {
  kind: "communication",
  points: [
    [40, 0],
    [40, 30]
  ],
  facing: null
}

describe("placing a point against a trench", () => {
  it("measures along the centre line across its bends, skipping a repeated point", () => {
    const place = placeOn(fire, 13, 3.5)
    expect(place?.along).toBeCloseTo(10 + Math.sqrt(2 * 3.25 ** 2), 5)
    expect(place?.length).toBeCloseTo(10 + Math.sqrt(72) + 10, 5)
    expect(place?.distance).toBeCloseTo(Math.sqrt(2) * 0.25, 5)
  })

  it("knows the fire step's side for trenches facing either way, and has none in a communication trench", () => {
    expect(placeOn(fire, 5, 0.7)?.inFront).toBe(true)
    expect(placeOn(fire, 5, -0.7)?.inFront).toBe(false)
    expect(placeOn(southward, 5, 49.3)?.inFront).toBe(true)
    expect(placeOn(southward, 5, 50.7)?.inFront).toBe(false)
    expect(placeOn(communication, 41, 10)?.inFront).toBe(false)
  })

  it("has nothing to say of a trench with no length", () => {
    expect(placeOn({ kind: "fire", points: [[3, 3]], facing: "north" }, 3, 3)).toBeNull()
  })

  it("finds the nearest trench within reach, and none further off", () => {
    const map = { ...createFlatMap({ name: "m", cellSize: 1, columns: 60, rows: 60 }, 0, Surface.Grass) }
    const trenches = { ...map, trenches: [fire, southward, communication] }
    expect(nearestTrench(trenches, 39, 5)?.trench).toBe(communication)
    expect(nearestTrench(trenches, 5, 49)?.trench).toBe(southward)
    expect(nearestTrench(trenches, 30, 30)).toBeNull()
  })
})

describe("points along a trench", () => {
  it("walks the centre line, clamped to its ends, with the front turned the way the trench faces", () => {
    expect(pointAlong(fire, 5)).toMatchObject({ x: 5, z: 0, frontZ: 1 })
    expect(pointAlong(fire, -4)).toMatchObject({ x: 0, z: 0 })
    const end = pointAlong(fire, 1000)
    expect(end.x).toBeCloseTo(26)
    expect(end.z).toBeCloseTo(6)
    const traverse = pointAlong(fire, 10 + Math.sqrt(72) / 2)
    expect(traverse.x).toBeCloseTo(13)
    expect(traverse.frontX).toBeCloseTo(-Math.SQRT1_2)
    expect(traverse.frontZ).toBeCloseTo(Math.SQRT1_2)
    expect(pointAlong(southward, 5)).toMatchObject({ x: 5, z: 50, frontZ: -1 })
    expect(pointAlong(communication, 10)).toMatchObject({ x: 40, z: 10 })
    expect(Math.abs(pointAlong(communication, 10).frontX)).toBe(0)
  })

  it("gives a trench with no length its only point, and an empty one the origin", () => {
    expect(pointAlong({ kind: "fire", points: [[3, 4]], facing: "north" }, 2)).toMatchObject({ x: 3, z: 4 })
    expect(pointAlong({ kind: "fire", points: [], facing: "north" }, 2)).toMatchObject({ x: 0, z: 0 })
  })

  it("tells the fire step from the floor and the parapet", () => {
    const step = placeOn(fire, 5, FIRE_STEP_MIDDLE)
    expect(step && onFireStep(step)).toBe(true)
    const floor = placeOn(fire, 5, 0.1)
    expect(floor && onFireStep(floor)).toBe(false)
    const behind = placeOn(fire, 5, -FIRE_STEP_MIDDLE)
    expect(behind && onFireStep(behind)).toBe(false)
    const parapet = placeOn(fire, 5, 2.5)
    expect(parapet && onFireStep(parapet)).toBe(false)
  })
})
