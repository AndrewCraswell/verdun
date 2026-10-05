import { createFlatMap, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import { createLineOfSight } from "./line-of-sight.ts"
import { createSimulation, type Simulation, spawnSoldier, stepSimulation, TICK_RATE } from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { COUNTER_FIRE_EVERY, SPOTTED_SECONDS, spottedGuns, spottingSystem } from "./spotting.ts"

function field(): Simulation {
  return createSimulation({
    map: createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 600 }, 5, Surface.Grass),
    seed: 1
  })
}

/** A burst from a gun this step, as combat reports it. */
function burst(sim: Simulation, gunner: number): void {
  const { x, z } = sim.soldiers.position
  const at = { x: x[gunner], y: 6.5, z: z[gunner] }
  sim.events.push({ type: "shot", shooter: gunner, target: -1, hit: false, from: at, to: at })
}

describe("spotting machine guns", () => {
  it("marks a gun the enemy can hear close by, and forgets it a minute after it falls quiet", () => {
    const sim = field()
    const gunner = spawnSoldier(sim, { side: Side.French, x: 100, z: 50, weapon: Weapon.MachineGun })
    spawnSoldier(sim, { side: Side.German, x: 100, z: 180 })
    burst(sim, gunner)
    spottingSystem(sim)

    expect(spottedGuns(sim, Side.German)).toEqual([
      expect.objectContaining({ soldier: gunner, side: Side.French, spotted: true, seen: false })
    ])
    expect(spottedGuns(sim, Side.French)).toEqual([])
    expect(sim.events).toContainEqual({ type: "gun-spotted", side: Side.German, soldier: gunner, x: 100, z: 50 })

    sim.tick += SPOTTED_SECONDS * TICK_RATE + 1
    sim.events.length = 0
    spottingSystem(sim)
    expect(spottedGuns(sim, Side.German)).toEqual([])
  })

  it("leaves a gun unmarked when no enemy is near enough to hear it and none can see it", () => {
    const sim = field()
    const gunner = spawnSoldier(sim, { side: Side.French, x: 100, z: 50, weapon: Weapon.MachineGun })
    spawnSoldier(sim, { side: Side.German, x: 100, z: 250 })
    burst(sim, gunner)
    spottingSystem(sim)

    expect(spottedGuns(sim, Side.German)).toEqual([])
    expect(sim.events.some((event) => event.type === "gun-spotted")).toBe(false)
  })

  it("marks a gun an enemy sees firing from far beyond hearing, so observers can bring fire on it", async () => {
    const sim = field()
    sim.lineOfSight = await createLineOfSight(sim.map)
    const gunner = spawnSoldier(sim, { side: Side.French, x: 100, z: 50, weapon: Weapon.MachineGun })
    spawnSoldier(sim, { side: Side.German, x: 100, z: 450 })
    burst(sim, gunner)
    spottingSystem(sim)

    expect(spottedGuns(sim, Side.German)).toEqual([expect.objectContaining({ soldier: gunner, seen: true })])
    sim.lineOfSight.dispose()
  })

  it("brings a battery down on a gun the enemy can see, once in a while, but not near its own men", async () => {
    const sim = field()
    sim.lineOfSight = await createLineOfSight(sim.map)
    const gunner = spawnSoldier(sim, { side: Side.French, x: 100, z: 50, weapon: Weapon.MachineGun })
    const german = spawnSoldier(sim, { side: Side.German, x: 100, z: 400 })
    burst(sim, gunner)
    spottingSystem(sim)
    expect(sim.artillery.missions).toEqual([
      expect.objectContaining({ side: Side.German, fromX: 80, toX: 120, lineZ: 50 })
    ])

    // Not again until the battery's ration for the gun comes round.
    sim.tick += 10 * TICK_RATE
    burst(sim, gunner)
    spottingSystem(sim)
    expect(sim.artillery.missions).toHaveLength(1)

    // German infantry close to the gun: the battery holds its fire.
    sim.soldiers.position.z[german] = 90
    sim.tick += COUNTER_FIRE_EVERY * TICK_RATE
    burst(sim, gunner)
    spottingSystem(sim)
    expect(sim.artillery.missions).toHaveLength(1)
    sim.lineOfSight.dispose()
  })

  it("keeps its sightings through a save and restore", () => {
    const sim = field()
    const gunner = spawnSoldier(sim, { side: Side.French, x: 100, z: 50, weapon: Weapon.MachineGun })
    spawnSoldier(sim, { side: Side.German, x: 100, z: 180 })
    burst(sim, gunner)
    spottingSystem(sim)

    const restored = restoreSimulation(sim.map, takeSnapshot(sim))
    expect(restored.spotting).toEqual(sim.spotting)
    stepSimulation(restored)
    expect(spottedGuns(restored, Side.German)).toHaveLength(1)
  })
})
