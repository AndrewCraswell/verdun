import { GRENADE_FUSE, STEP_SECONDS, type ThrownGrenade } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { grenadeWay, thrownTick } from "./grenade-way.ts"

const FUSE_TICKS = Math.round(GRENADE_FUSE / STEP_SECONDS)
const flat = () => 0

function thrown(overrides: Partial<ThrownGrenade> = {}): ThrownGrenade {
  return {
    from: { x: 0, y: 1.9, z: 0 },
    mark: { x: 0, y: 0, z: 25 },
    struck: null,
    rest: { x: 0, z: 25 },
    burstTick: 100 + FUSE_TICKS,
    ...overrides
  }
}

describe("a thrown grenade's way", () => {
  it("knows the tick it was thrown from when it bursts", () => {
    expect(thrownTick(thrown())).toBe(100)
  })

  it("leaves the hand, flies its arc, and lies where it came down until it bursts", () => {
    const way = grenadeWay(thrown(), flat)
    expect(way.heading).toBeCloseTo(0, 5)
    expect(way.leaves).toBeGreaterThan(0.5)
    expect(way.lands - way.leaves).toBeGreaterThan(1.8)
    expect(way.rests).toBe(way.lands)
    expect(way.bursts).toBeCloseTo(GRENADE_FUSE, 1)
    expect(way.rests).toBeLessThan(way.bursts)

    expect(way.at(0.1)).toMatchObject({ phase: "hand", x: 0, z: 0 })
    const midway = way.at((way.leaves + way.lands) / 2)
    expect(midway.phase).toBe("air")
    expect(midway.z).toBeCloseTo(12.5, 3)
    expect(midway.y).toBeGreaterThan(5)
    expect(midway.tumble).toBeGreaterThan(0)
    const down = way.at(way.lands + 0.5)
    expect(down).toMatchObject({ phase: "lying", x: 0, y: 0, z: 25, tumble: 0 })
  })

  it("rolls back from where it struck short, slowing to where it rests", () => {
    const way = grenadeWay(
      thrown({ mark: { x: 0, y: 0, z: 18 }, struck: { x: 0, y: 1, z: 2 }, rest: { x: 0, z: 0.5 } }),
      flat
    )
    expect(way.heading).toBeCloseTo(0, 5)
    // Struck 2 m out: barely in the air at all.
    expect(way.lands - way.leaves).toBeLessThan(0.4)
    expect(way.rests).toBeGreaterThan(way.lands)
    const early = way.at(way.lands + (way.rests - way.lands) * 0.25)
    const late = way.at(way.lands + (way.rests - way.lands) * 0.75)
    expect(early.phase).toBe("rolling")
    // Back toward the thrower, quicker at first: more in the first quarter of its roll than in the last.
    expect(early.z).toBeLessThan(2)
    expect(2 - early.z).toBeGreaterThan(late.z - 0.5)
    expect(way.at(way.rests + 0.01)).toMatchObject({ phase: "lying", z: 0.5 })
  })

  it("goes from the hand soon enough to be down before it bursts, however long the way", () => {
    const way = grenadeWay(
      thrown({ mark: { x: 30, y: 0, z: 0 }, struck: { x: 29, y: 0, z: 0 }, rest: { x: 20, z: 0 } }),
      flat
    )
    expect(way.heading).toBeCloseTo(Math.PI / 2, 5)
    expect(way.rests).toBeLessThanOrEqual(way.bursts)
    expect(way.at(way.bursts - 0.01).phase).not.toBe("hand")
  })

  it("sits on the ground where it lies, however the ground lies", () => {
    const way = grenadeWay(thrown(), (x, z) => 3 + x * 0.1 + z * 0.01)
    expect(way.at(way.bursts - 0.1).y).toBeCloseTo(3 + 0.25, 5)
  })
})
