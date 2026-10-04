import { describe, expect, it } from "vitest"
import { communicationRoute, crenellatedTrace, junctionNear, junctionOnBay, TRENCH_GRID } from "./trench-trace.ts"
import type { GroundPoint } from "./trenches.ts"

/** Every turn in a line is a right angle. */
function turnsAreSquare(points: readonly GroundPoint[]): boolean {
  return points.slice(2).every(([cx, cz], index) => {
    const [ax, az] = points[index]
    const [bx, bz] = points[index + 1]
    const dot = (bx - ax) * (cx - bx) + (bz - az) * (cz - bz)
    return Math.abs(dot) < 1e-6
  })
}

/** Lengths of a line's segments. */
function segmentLengths(points: readonly GroundPoint[]): number[] {
  return points.slice(1).map(([bx, bz], index) => Math.hypot(bx - points[index][0], bz - points[index][1]))
}

describe("crenellatedTrace", () => {
  const trace = crenellatedTrace({
    fromX: 10,
    toX: 200,
    frontZ: (x) => 100 + x / 20,
    towardEnemy: 1,
    sections: (bay) => 1 + (bay % 3)
  })

  it("alternates front bays with rear bays stepped back from the enemy", () => {
    expect(trace.bays[0]?.front).toBe(true)
    expect(trace.bays[1]?.front).toBe(false)
    const steppedBack = trace.bays.every((bay, index) => {
      const neighbours = [trace.bays[index - 1], trace.bays[index + 1]].filter((other) => other !== undefined)
      return bay.front || neighbours.every((front) => front.z - bay.z >= 2 * TRENCH_GRID.clearance - 1e-9)
    })
    expect(steppedBack).toBe(true)
  })

  it("spans the requested width with right-angle turns and room for the kit's corners", () => {
    expect(trace.points[0]?.[0]).toBe(10)
    expect(trace.points.at(-1)?.[0]).toBe(200)
    expect(turnsAreSquare(trace.points)).toBe(true)
    // Bays and legs alike leave room for a corner piece at each end.
    const lengths = segmentLengths(trace.points).filter((length) => length > 0)
    expect(Math.min(...lengths)).toBeGreaterThanOrEqual(2 * TRENCH_GRID.clearance - 1e-9)
  })

  it("steps south-facing lines back to the north", () => {
    const south = crenellatedTrace({ fromX: 0, toX: 60, frontZ: () => 50, towardEnemy: -1, sections: () => 2 })

    expect(south.bays[1]?.z).toBeGreaterThan(50)
  })

  it("refuses a width too narrow for a single bay", () => {
    expect(() => crenellatedTrace({ fromX: 0, toX: 5, frontZ: () => 0, towardEnemy: 1, sections: () => 1 })).toThrow(
      RangeError
    )
  })
})

describe("junctions", () => {
  const bay = { fromX: 0, toX: 30, z: 5, front: true }

  it("sit on a bay's centre line, clear of the turns at its ends", () => {
    expect(junctionOnBay(bay, 15)).toEqual([15, 5])
    expect(junctionOnBay(bay, 1)).toEqual([2 * TRENCH_GRID.clearance, 5])
    expect(junctionOnBay({ ...bay, toX: 12 }, 6)).toBeNull()
  })

  it("pick the nearest bay of the wanted kind that has room", () => {
    const bays = [bay, { fromX: 30, toX: 60, z: -3, front: false }, { fromX: 60, toX: 62, z: 5, front: true }]

    expect(junctionNear(bays, 61, true)).toEqual([30 - 2 * TRENCH_GRID.clearance, 5])
    expect(junctionNear(bays, 40, false)[1]).toBe(-3)
    expect(() => junctionNear([{ ...bay, toX: 10 }], 5, true)).toThrow(RangeError)
  })
})

describe("communicationRoute", () => {
  it("zigzags from one end to the other with right-angle turns", () => {
    const route = communicationRoute([100, 50], [106, 110])

    expect(route[0]).toEqual([100, 50])
    expect(route.at(-1)?.[0]).toBeCloseTo(106)
    expect(route.at(-1)?.[1]).toBeCloseTo(110)
    expect(turnsAreSquare(route)).toBe(true)
    expect(route.length).toBeGreaterThan(4)
    expect(Math.min(...segmentLengths(route))).toBeGreaterThanOrEqual(2 * TRENCH_GRID.clearance)
  })

  it("runs north or south and honours the shortest first and last legs", () => {
    const route = communicationRoute([0, 100], [0, 40], { firstLeg: 12, lastLeg: 20 })

    expect(route[1]?.[1]).toBeCloseTo(88)
    expect(route.at(-2)?.[1]).toBeCloseTo(60)
  })

  it("uses a single jog when the ends are too close for more", () => {
    const route = communicationRoute([0, 0], [10, 20])

    expect(route).toHaveLength(4)
    expect(route[1]?.[0]).toBe(0)
    expect(route[2]?.[0]).toBe(10)
  })

  it("throws when the ends are too close for its turns", () => {
    expect(() => communicationRoute([0, 0], [0, 10])).toThrow(RangeError)
    expect(() => communicationRoute([0, 0], [3, 18])).toThrow(RangeError)
  })
})
