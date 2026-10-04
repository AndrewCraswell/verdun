import { createFlatMap } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Side } from "./components.ts"
import { createSimulation, enqueueCommand, type Simulation, spawnSoldier, stepSimulation } from "./simulation.ts"
import { restoreSimulation, SIM_STATE_VERSION, takeSnapshot } from "./snapshot.ts"

const map = createFlatMap({ name: "test", cellSize: 1, columns: 200, rows: 200 })

/** A small skirmish: two squads, half of each ordered forward, and some randomness drawn. */
function skirmish(seed: number): Simulation {
  const sim = createSimulation({ map, seed })
  for (let index = 0; index < 8; index++) {
    const french = spawnSoldier(sim, { side: Side.French, x: 20 + index * 3, z: 20 + sim.rng.next() * 5 })
    const german = spawnSoldier(sim, { side: Side.German, x: 20 + index * 3, z: 180 - sim.rng.next() * 5 })
    if (index === 1) {
      enqueueCommand(sim, { type: "steer", soldier: french, x: 0.3, z: 0.7 })
      enqueueCommand(sim, { type: "face", soldier: german, x: 1, z: 0 })
    }
    if (index % 2 === 0) {
      enqueueCommand(sim, { type: "move-to", soldier: french, x: 20 + index * 3, z: 150 })
      enqueueCommand(sim, { type: "move-to", soldier: german, x: 100, z: 100 })
    }
  }
  return sim
}

function run(sim: Simulation, steps: number): Simulation {
  for (let step = 0; step < steps; step++) {
    stepSimulation(sim)
  }
  return sim
}

describe("determinism", () => {
  it("produces identical worlds from the same seed and commands", () => {
    expect(takeSnapshot(run(skirmish(1916), 600))).toEqual(takeSnapshot(run(skirmish(1916), 600)))
  })

  it("diverges when the seed changes", () => {
    expect(takeSnapshot(run(skirmish(1916), 10))).not.toEqual(takeSnapshot(run(skirmish(1917), 10)))
  })
})

describe("snapshots", () => {
  it("record the version, tick, random state and every soldier", () => {
    const snapshot = takeSnapshot(run(skirmish(3), 5))

    expect(snapshot.version).toBe(SIM_STATE_VERSION)
    expect(snapshot.tick).toBe(5)
    expect(snapshot.soldiers).toHaveLength(16)
    expect(snapshot.soldiers.filter((soldier) => soldier.side === Side.German)).toHaveLength(8)
    expect(snapshot.soldiers.filter((soldier) => soldier.moveOrder !== null)).toHaveLength(8)
    expect(snapshot.soldiers.filter((soldier) => soldier.steer !== null)).toHaveLength(1)
    expect(snapshot.soldiers.find((soldier) => soldier.side === Side.German && soldier.facing.x === 1)).toBeDefined()
  })

  it("survive JSON and resume exactly where the original continues", () => {
    const original = run(skirmish(5), 100)
    const file = JSON.stringify(takeSnapshot(original))
    const saved = JSON.parse(file)
    const restored = restoreSimulation(map, saved)

    expect(takeSnapshot(restored)).toEqual(takeSnapshot(original))
    expect(takeSnapshot(run(restored, 300))).toEqual(takeSnapshot(run(original, 300)))
    expect(restored.rng.next()).toBe(original.rng.next())
  })

  it("refuse soldier ids that cannot be restored in order", () => {
    const snapshot = takeSnapshot(skirmish(5))
    const gapped = { ...snapshot, soldiers: snapshot.soldiers.slice(1) }

    expect(() => restoreSimulation(map, gapped)).toThrow("contiguous")
  })
})
