import { createFlatMap } from "@verdun/map"
import { createSimulation, Side, spawnSoldier, stepSimulation, surrender, TICK_RATE } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { worldStats } from "./stats-model.ts"

describe("worldStats", () => {
  it("counts soldiers, the fallen and prisoners by side, and sums up artillery, clouds and wind", () => {
    const sim = createSimulation({ map: createFlatMap({ name: "m", cellSize: 1, columns: 100, rows: 100 }), seed: 1 })
    spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const fallen = spawnSoldier(sim, { side: Side.German, x: 50, z: 50 })
    const prisoner = spawnSoldier(sim, { side: Side.German, x: 60, z: 50 })
    sim.pendingCommands.push({ type: "kill", soldier: fallen })
    for (let step = 0; step < 61 * TICK_RATE; step++) {
      stepSimulation(sim)
    }
    surrender(sim, prisoner)

    expect(worldStats(sim)).toEqual({
      clock: `Tick ${61 * TICK_RATE}, 1:01 of battle`,
      soldiers: "1 French, 0 German",
      fallen: "0 French, 1 German",
      prisoners: "0 French, 1 German",
      artillery: "0 fire missions, 0 shells in flight",
      clouds: "Gas 0 cells, smoke 0 cells",
      wind: expect.stringMatching(/^Wind \d+\.\d m\/s$/)
    })
  })
})
