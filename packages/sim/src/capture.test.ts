import { createFlatMap, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { surrender } from "./capture.ts"
import { Side, Stance } from "./components.ts"
import {
  capturedIds,
  createSimulation,
  enqueueCommand,
  type Simulation,
  soldierIds,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { createSquad, isAlive } from "./squads.ts"

const map = createFlatMap({ name: "field", cellSize: 1, columns: 200, rows: 200 }, 0, Surface.Grass)

function stepFor(sim: Simulation, seconds: number) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
  }
}

/** German soldiers down a dugout, as if a barrage had just lifted off them. */
function shelteringGarrison(sim: Simulation, count: number) {
  const men = Array.from({ length: count }, (_, index) =>
    spawnSoldier(sim, { side: Side.German, x: 100 + index, z: 100 })
  )
  createSquad(sim, Side.German, men)
  for (const soldier of men) {
    sim.soldiers.stance.value[soldier] = Stance.Sheltering
    sim.soldiers.shelter.lastShelled[soldier] = 0
  }
  return men
}

describe("capture", () => {
  it("mostly takes men caught down a dugout prisoner; the rest come up fighting", () => {
    let prisoners = 0
    let fighters = 0
    for (let seed = 1; seed <= 10; seed++) {
      const sim = createSimulation({ map, seed })
      const men = shelteringGarrison(sim, 4)
      spawnSoldier(sim, { side: Side.French, x: 101, z: 95 })
      stepFor(sim, 0.5)
      prisoners += men.filter((soldier) => !isAlive(sim, soldier)).length
      // The rest are up: in the open here, so they drop prone.
      fighters += men.filter(
        (soldier) => isAlive(sim, soldier) && sim.soldiers.stance.value[soldier] !== Stance.Sheltering
      ).length
    }

    expect(prisoners + fighters).toBe(40)
    expect(prisoners).toBeGreaterThan(20)
    expect(fighters).toBeGreaterThan(2)
  })

  it("leaves a dugout alone while no attacker has reached it", () => {
    const sim = createSimulation({ map, seed: 1 })
    const men = shelteringGarrison(sim, 4)
    spawnSoldier(sim, { side: Side.French, x: 100, z: 80 })
    stepFor(sim, 0.5)

    expect(capturedIds(sim)).toHaveLength(0)
    expect(men.every((soldier) => sim.soldiers.stance.value[soldier] === Stance.Sheltering)).toBe(true)
  })

  it("makes broken soldiers give up when the enemy close by outnumbers their friends", () => {
    const sim = createSimulation({ map, seed: 1 })
    const broken = spawnSoldier(sim, { side: Side.German, x: 100, z: 100 })
    const steady = spawnSoldier(sim, { side: Side.German, x: 150, z: 100 })
    createSquad(sim, Side.German, [broken, steady])
    sim.soldiers.morale.value[broken] = 0.1
    sim.soldiers.morale.value[steady] = 0.1
    spawnSoldier(sim, { side: Side.French, x: 105, z: 100 })
    spawnSoldier(sim, { side: Side.French, x: 160, z: 100 })
    spawnSoldier(sim, { side: Side.German, x: 152, z: 100 })
    stepFor(sim, 0.5)

    expect(Array.from(capturedIds(sim))).toEqual([broken])
  })

  it("sends prisoners to their captors' rear, out of the fight and deaf to orders", () => {
    const sim = createSimulation({ map, seed: 1 })
    const german = spawnSoldier(sim, { side: Side.German, x: 100, z: 100 })
    const french = spawnSoldier(sim, { side: Side.French, x: 50, z: 50 })
    createSquad(sim, Side.German, [german])
    createSquad(sim, Side.French, [french])
    surrender(sim, german)
    surrender(sim, french)
    expect(sim.events).toContainEqual({ type: "capture", soldier: german })
    enqueueCommand(sim, { type: "move-to", soldier: german, x: 100, z: 190 })
    stepFor(sim, 10)

    expect(Array.from(soldierIds(sim))).toEqual([])
    expect(sim.soldiers.position.z[german]).toBeLessThan(100 - 10)
    expect(sim.soldiers.position.z[french]).toBeGreaterThan(50 + 10)
    expect(sim.squads.map((squad) => squad.leader)).toEqual([-1, -1])
  })

  it("saves and restores prisoners and stances", () => {
    const sim = createSimulation({ map, seed: 1 })
    const men = shelteringGarrison(sim, 3)
    surrender(sim, men[0] ?? -1)
    stepSimulation(sim)
    // Through JSON, as a save file would go.
    const file = JSON.stringify(takeSnapshot(sim))
    const restored = restoreSimulation(map, JSON.parse(file))

    expect(takeSnapshot(restored)).toEqual(takeSnapshot(sim))
    expect(Array.from(capturedIds(restored))).toEqual([men[0]])
    expect(restored.soldiers.stance.value[men[1] ?? -1]).toBe(Stance.Sheltering)
  })
})
