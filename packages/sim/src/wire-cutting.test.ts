import { createFlatMap, Surface, type Trench, type WireBelt } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { Side } from "./components.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { createSquad } from "./squads.ts"
import { wireStanding } from "./wire.ts"

/** French line at z = 50, German at z = 150, each with a belt of wire 25 m in front of it. */
function front(): Simulation {
  const map = createFlatMap({ name: "front", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
  const line = (z: number, facing: "north" | "south"): Trench => ({
    kind: "fire",
    points: [
      [20, z],
      [180, z]
    ],
    facing
  })
  const belt = (z: number): WireBelt => ({
    points: [
      [20, z],
      [180, z]
    ]
  })
  return createSimulation({
    map: { ...map, trenches: [line(50, "north"), line(150, "south")], wire: [belt(75), belt(125)] },
    seed: 1
  })
}

function stepFor(sim: Simulation, seconds: number) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
  }
}

const germanWire = (sim: Simulation) => wireStanding(sim.wire, 20, 180, 120, 130)
const frenchWire = (sim: Simulation) => wireStanding(sim.wire, 20, 180, 70, 80)

describe("cutting wire", () => {
  it("is done by a bombardment on the belt, not by a barrage passing over it", () => {
    const shelled = front()
    const barraged = front()
    const plan = {
      side: Side.French,
      shell: Shell.FieldHighExplosive,
      fromX: 20,
      toX: 180,
      z: 125,
      band: 10,
      roundsPerMinute: 600,
      delay: 0,
      duration: 30
    }
    enqueueCommand(shelled, { type: "fire-mission", plan })
    enqueueCommand(barraged, { type: "fire-mission", plan: { ...plan, cutsWire: false } })
    stepFor(shelled, 40)
    stepFor(barraged, 40)

    expect(germanWire(shelled)).toBeLessThan(0.9)
    expect(germanWire(barraged)).toBe(1)
  })

  it("leaves the enemy's wire to the guns: the attackers' lanes go only through their own", () => {
    const sim = front()
    const squad = createSquad(
      sim,
      Side.French,
      [60, 64, 68, 72].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 51 }))
    )
    enqueueCommand(sim, {
      type: "barrage-attack",
      side: Side.French,
      fromX: 20,
      toX: 180,
      startZ: 90,
      objectiveZ: 150,
      roundsPerMinute: 60,
      lift: 50,
      interval: 90,
      standoff: 70,
      delay: 0,
      squads: [squad.id]
    })
    stepFor(sim, 30)

    expect(frenchWire(sim)).toBeLessThan(1)
    expect(germanWire(sim)).toBe(1)
  })
})
