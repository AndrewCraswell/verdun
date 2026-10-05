import { carveTrenches, createFlatMap, Surface, type Trench } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Side } from "./components.ts"
import {
  createSimulation,
  type SimEvent,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { createSquad } from "./squads.ts"

/** A German front line at z = 150 and support line at z = 190, both facing south toward the French. */
function sector(): Simulation {
  const map = createFlatMap({ name: "sector", cellSize: 0.5, columns: 400, rows: 440 }, 5, Surface.Grass)
  const line = (z: number): Trench => ({
    kind: "fire",
    points: [
      [20, z],
      [180, z]
    ],
    facing: "south"
  })
  const trenches = [line(150), line(190)]
  carveTrenches(map, trenches)
  return createSimulation({ map: { ...map, trenches }, seed: 1 })
}

function stepFor(sim: Simulation, seconds: number): SimEvent[] {
  const events: SimEvent[] = []
  for (let step = 0; step < seconds * TICK_RATE; step++) {
    stepSimulation(sim)
    events.push(...sim.events)
  }
  return events
}

/** Two German reserve squads below in the support line, one behind x = 90 and one far off at x = 170. */
function reserves(sim: Simulation) {
  const squad = (x: number) => {
    const reserve = createSquad(
      sim,
      Side.German,
      [0, 1, 2, 3, 4].map((slot) => spawnSoldier(sim, { side: Side.German, x: x + slot * 2, z: 189.2 }))
    )
    reserve.order = { kind: "reserve" }
    return reserve
  }
  return { near: squad(85), far: squad(165) }
}

describe("counter-thrusts", () => {
  it("send the nearest reserves straight up to a stretch of the front line the enemy has broken into", () => {
    const sim = sector()
    const { near, far } = reserves(sim)
    for (const x of [62, 66, 70, 74, 78]) {
      spawnSoldier(sim, { side: Side.French, x, z: 150 })
    }
    spawnSoldier(sim, { side: Side.German, x: 100, z: 150.5 })
    const events = stepFor(sim, 2.1)

    // Five intruders against one defender: the nearer squad of five goes first, then the next for the odds.
    expect(near.order).toEqual({ kind: "advance", x: 90, z: 150 })
    expect(far.order).toEqual({ kind: "advance", x: 90, z: 150 })
    expect(events).toContainEqual({ type: "counter-thrust", side: Side.German, x: 90, squads: 2 })
  })

  it("leave the reserves below while the stretch's own garrison outnumbers a handful of intruders", () => {
    const sim = sector()
    const { near, far } = reserves(sim)
    for (const x of [62, 66, 70]) {
      spawnSoldier(sim, { side: Side.French, x, z: 150 })
    }
    for (const x of [64, 68, 72, 76]) {
      spawnSoldier(sim, { side: Side.German, x, z: 150.5 })
    }
    const events = stepFor(sim, 4.1)

    expect(near.order).toEqual({ kind: "reserve" })
    expect(far.order).toEqual({ kind: "reserve" })
    expect(events.some((event) => event.type === "counter-thrust")).toBe(false)
  })

  it("send half the reserves straight up to man the front line when the side calls its SOS barrage, once", () => {
    const sim = sector()
    const { near, far } = reserves(sim)
    sim.artillery.sosCalledAt[Side.German] = 0
    const events = stepFor(sim, 4.1)

    expect(near.order).toEqual({ kind: "advance", x: 85, z: 150 })
    expect(far.order).toEqual({ kind: "reserve" })
    expect(events.filter((event) => event.type === "reserves-up")).toEqual([
      { type: "reserves-up", side: Side.German, squads: 1 }
    ])
  })

  it("leave the reserves to the commander's deliberate counter-attack once the whole front line is lost", () => {
    const sim = sector()
    const { near, far } = reserves(sim)
    sim.commanders[Side.German].lostAt = 0
    for (const x of [62, 66, 70, 74, 78]) {
      spawnSoldier(sim, { side: Side.French, x, z: 150 })
    }
    stepFor(sim, 2.1)

    expect(near.order).toEqual({ kind: "reserve" })
    expect(far.order).toEqual({ kind: "reserve" })
  })
})
