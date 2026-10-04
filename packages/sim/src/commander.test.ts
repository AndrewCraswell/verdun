import { carveTrenches, createFlatMap, Surface, type Trench } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { COUNTER_ATTACK_DELAY } from "./commander.ts"
import { Side, Stance } from "./components.ts"
import { isStandTo } from "./routine.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { createSquad } from "./squads.ts"

/** A German front line at z = 150 and support line at z = 190, both facing south toward the French. */
function sector() {
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
  return { ...map, trenches }
}

function stepFor(sim: Simulation, seconds: number) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
  }
}

/** The French have taken the German front line; German reserves wait in the support line. */
function frontTaken(withReserves = true) {
  const sim = createSimulation({ map: sector(), seed: 1 })
  for (let index = 0; index < 10; index++) {
    spawnSoldier(sim, { side: Side.French, x: 60 + index * 8, z: 149 })
  }
  spawnSoldier(sim, { side: Side.German, x: 170, z: 150 })
  const reserve = withReserves
    ? createSquad(
        sim,
        Side.German,
        [80, 90, 100, 110].map((x) => spawnSoldier(sim, { side: Side.German, x, z: 189.2 }))
      )
    : null
  if (reserve) {
    reserve.order = { kind: "reserve" }
  }
  return { sim, reserve }
}

describe("counter-attacks", () => {
  it("notice a lost front line and keep the reserves below while they organise", () => {
    const { sim, reserve } = frontTaken()
    stepFor(sim, 5.1)

    expect(sim.commanders[Side.German].lostAt).toBeGreaterThanOrEqual(0)
    expect(sim.commanders[Side.French].lostAt).toBe(-1)
    const [sentry, ...men] = reserve?.members ?? []
    expect(sim.soldiers.stance.value[sentry ?? -1]).toBe(Stance.Standing)
    expect(men.every((member) => sim.soldiers.stance.value[member] === Stance.Sheltering)).toBe(true)
  })

  it("shell the lost trench first, then send the reserves in behind a creeping barrage", () => {
    const { sim, reserve } = frontTaken()
    stepFor(sim, COUNTER_ATTACK_DELAY + 6)

    expect(sim.commanders[Side.German].counterAttackedAt).toBeGreaterThan(0)
    expect(sim.artillery.missions.map((mission) => [mission.side, mission.shell, mission.z])).toEqual([
      [Side.German, Shell.FieldHighExplosive, 150],
      [Side.German, Shell.HeavyHighExplosive, 150]
    ])
    expect(reserve?.order.kind).toBe("reserve")

    stepFor(sim, 125)
    expect(reserve?.order.kind).toBe("creep")
    expect(sim.artillery.missions.some((mission) => mission.creep !== undefined)).toBe(true)
    const started = sim.commanders[Side.German].counterAttackedAt
    stepFor(sim, 60)
    expect(sim.commanders[Side.German].counterAttackedAt).toBe(started)
  })

  it("wait for the dawn stand-to when it's near, and go in at once earlier in the night", () => {
    // Lost at 00:45 on 23 June 1916, a midsummer night: first light, the sun at 10° below, comes about 02:00.
    const small = frontTaken()
    enqueueCommand(small.sim, { type: "clock", at: Date.UTC(1916, 5, 23, 0, 45) })
    stepFor(small.sim, COUNTER_ATTACK_DELAY + 6)
    expect(small.sim.commanders[Side.German].lostAt).toBeGreaterThanOrEqual(0)
    expect(small.sim.commanders[Side.German].counterAttackedAt).toBe(-1)
    while (!isStandTo(small.sim)) {
      stepFor(small.sim, 5)
    }
    stepFor(small.sim, 6)
    expect(small.sim.commanders[Side.German].counterAttackedAt).toBeGreaterThan(0)

    // Lost at 22:00 the evening before: dawn is hours off, so no waiting.
    const late = frontTaken()
    enqueueCommand(late.sim, { type: "clock", at: Date.UTC(1916, 5, 22, 22) })
    stepFor(late.sim, COUNTER_ATTACK_DELAY + 6)
    expect(late.sim.commanders[Side.German].counterAttackedAt).toBeGreaterThan(0)
  })

  it("don't happen without reserves", () => {
    const { sim } = frontTaken(false)
    stepFor(sim, COUNTER_ATTACK_DELAY + 10)

    expect(sim.commanders[Side.German].lostAt).toBeGreaterThanOrEqual(0)
    expect(sim.commanders[Side.German].counterAttackedAt).toBe(-1)
    expect(sim.artillery.missions).toHaveLength(0)
  })

  it("are saved and restored mid-way", () => {
    const { sim } = frontTaken()
    stepFor(sim, COUNTER_ATTACK_DELAY + 6)
    const file = JSON.stringify(takeSnapshot(sim))
    const restored = restoreSimulation(sim.map, JSON.parse(file))

    expect(restored.commanders).toEqual(sim.commanders)
  })
})
