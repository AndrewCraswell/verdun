import { carveTrenches, createFlatMap, Surface, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { GRENADE_RANGE, throwGrenade } from "./combat.ts"
import { Side } from "./components.ts"
import { createLineOfSight, type LineOfSight } from "./line-of-sight.ts"
import {
  createSimulation,
  enqueueCommand,
  GRENADES_CARRIED,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"

const opened: LineOfSight[] = []
afterEach(() => {
  for (const lineOfSight of opened.splice(0)) {
    lineOfSight.dispose()
  }
})

async function field(): Promise<Simulation> {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
  const trench: Trench = {
    kind: "fire",
    points: [
      [20, 100],
      [180, 100]
    ],
    facing: "north"
  }
  carveTrenches(map, [trench])
  const sim = createSimulation({ map: { ...map, trenches: [trench] }, seed: 3 })
  const lineOfSight = await createLineOfSight(sim.map)
  opened.push(lineOfSight)
  sim.lineOfSight = lineOfSight
  return sim
}

describe("grenades", () => {
  it("are thrown toward a point, at most a throw's length, and burst after their fuse", async () => {
    const sim = await field()
    const thrower = spawnSoldier(sim, { side: Side.French, x: 100, z: 140 })

    expect(throwGrenade(sim, thrower, 100, 60)).toBe(true)
    expect(sim.events).toContainEqual({ type: "throw", soldier: thrower })
    expect(sim.soldiers.grenades.count[thrower]).toBe(GRENADES_CARRIED - 1)
    const [grenade] = sim.artillery.shells
    expect(grenade?.shell).toBe(Shell.Grenade)
    expect(Math.abs((grenade?.z ?? 0) - (140 - GRENADE_RANGE.max))).toBeLessThan(10)
    expect(grenade?.landsAtTick).toBe(90)
    // Still priming and throwing: no second grenade yet.
    expect(throwGrenade(sim, thrower, 100, 60)).toBe(false)
  })

  it("run out", async () => {
    const sim = await field()
    const thrower = spawnSoldier(sim, { side: Side.French, x: 100, z: 140 })
    sim.soldiers.grenades.count[thrower] = 0

    expect(throwGrenade(sim, thrower, 100, 120)).toBe(false)
    enqueueCommand(sim, { type: "throw-grenade", soldier: thrower, x: 100, z: 120 })
    stepSimulation(sim)
    expect(sim.artillery.shells).toHaveLength(0)
  })

  it("are lobbed into a trench at men a rifle can't reach, and kill in the bay they land in", async () => {
    const sim = await field()
    const bomber = spawnSoldier(sim, { side: Side.French, x: 100, z: 118 })
    sim.soldiers.facing.z[bomber] = -1
    spawnSoldier(sim, { side: Side.German, x: 100, z: 100 })
    // A soldier with nothing to shoot at looks around every two seconds.
    for (let step = 0; step < 2.1 * TICK_RATE; step++) {
      stepSimulation(sim)
    }

    expect(sim.artillery.shells.some((shell) => shell.shell === Shell.Grenade)).toBe(true)
    expect(sim.soldiers.grenades.count[bomber]).toBe(GRENADES_CARRIED - 1)
    let casualties = 0
    for (let trial = 0; trial < 20; trial++) {
      const trialSim = await field()
      const man = spawnSoldier(trialSim, { side: Side.German, x: 100, z: 100 })
      trialSim.artillery.shells.push({ shell: Shell.Grenade, side: Side.French, x: 101.5, z: 100, landsAtTick: 0 })
      stepSimulation(trialSim)
      casualties += trialSim.soldiers.health.value[man] < 1 ? 1 : 0
    }
    expect(casualties).toBeGreaterThan(12)
  })

  it("aren't thrown where they'd land among friends", async () => {
    const sim = await field()
    const bomber = spawnSoldier(sim, { side: Side.French, x: 100, z: 118 })
    spawnSoldier(sim, { side: Side.German, x: 100, z: 100 })
    spawnSoldier(sim, { side: Side.French, x: 104, z: 100.5 })
    for (let step = 0; step < TICK_RATE; step++) {
      stepSimulation(sim)
    }

    expect(sim.soldiers.grenades.count[bomber]).toBe(GRENADES_CARRIED)
  })

  it("aren't wasted on men in the open, who can simply be shot", async () => {
    const sim = await field()
    const rifleman = spawnSoldier(sim, { side: Side.French, x: 100, z: 160 })
    spawnSoldier(sim, { side: Side.German, x: 100, z: 145 })
    for (let step = 0; step < TICK_RATE; step++) {
      stepSimulation(sim)
    }

    expect(sim.soldiers.grenades.count[rifleman]).toBe(GRENADES_CARRIED)
  })
})
