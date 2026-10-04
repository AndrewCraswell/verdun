import { createFlatMap, layOutFront, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Side } from "./components.ts"
import { sectorControl } from "./objectives.ts"
import { createSimulation, spawnSoldier, stepSimulation, TICK_RATE } from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"

function sector() {
  const flat = createFlatMap({ name: "sector", cellSize: 0.5, columns: 600, rows: 400 }, 5, Surface.Grass)
  return {
    ...flat,
    trenches: layOutFront(flat),
    objectives: [
      { name: "Behind the French line", x: 100, z: 20, radius: 10 },
      { name: "No man's land", x: 150, z: 100, radius: 10 },
      { name: "Behind the German line", x: 200, z: 180, radius: 10 }
    ]
  }
}

function stepFor(sim: ReturnType<typeof createSimulation>, seconds: number) {
  for (let step = 0; step < seconds * TICK_RATE; step++) {
    stepSimulation(sim)
  }
}

describe("objectives", () => {
  it("start with whoever's lines they lie behind, and no one between the lines", () => {
    const sim = createSimulation({ map: sector(), seed: 1 })

    expect(sim.objectives.map((objective) => objective.holder)).toEqual([Side.French, -1, Side.German])
    expect(sectorControl(sim)).toEqual({ [Side.French]: 1 / 3, [Side.German]: 1 / 3 })
  })

  it("are taken by men on them with no enemy there, held while contested, and kept when left", () => {
    const sim = createSimulation({ map: sector(), seed: 1 })
    const attacker = spawnSoldier(sim, { side: Side.French, x: 200, z: 182 })
    stepFor(sim, 3)

    expect(sim.objectives[2]?.holder).toBe(Side.French)
    const defender = spawnSoldier(sim, { side: Side.German, x: 202, z: 178 })
    stepFor(sim, 3)
    expect(sim.objectives[2]?.contested).toBe(true)
    expect(sim.objectives[2]?.holder).toBe(Side.French)

    sim.pendingCommands.push({ type: "kill", soldier: attacker }, { type: "kill", soldier: defender })
    stepFor(sim, 3)
    expect(sim.objectives[2]?.holder).toBe(Side.French)
    expect(sim.objectives[2]?.contested).toBe(false)
  })

  it("announce a change of hands, and are saved and restored", () => {
    const sim = createSimulation({ map: sector(), seed: 1 })
    spawnSoldier(sim, { side: Side.German, x: 150, z: 100 })
    const taken: unknown[] = []
    for (let step = 0; step < 3 * TICK_RATE; step++) {
      stepSimulation(sim)
      taken.push(...sim.events.filter((event) => event.type === "objective-taken"))
    }

    expect(taken).toEqual([{ type: "objective-taken", name: "No man's land", side: Side.German }])
    const file = JSON.stringify(takeSnapshot(sim))
    expect(restoreSimulation(sim.map, JSON.parse(file)).objectives).toEqual(sim.objectives)
  })
})
