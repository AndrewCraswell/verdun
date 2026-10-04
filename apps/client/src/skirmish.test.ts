import { createFlatMap } from "@verdun/map"
import { createSimulation, Side, soldierIds, stepSimulation, TICK_RATE } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { setupSkirmish } from "./skirmish.ts"

const map = createFlatMap({ name: "test", cellSize: 1, columns: 600, rows: 400 })

describe("setupSkirmish", () => {
  it("lines up both sides at opposite ends of the map", () => {
    const sim = createSimulation({ map, seed: 1 })
    const { french, german } = setupSkirmish(sim, 50)

    expect(Array.from(soldierIds(sim))).toHaveLength(100)
    expect(french.every((soldier) => sim.soldiers.side.value[soldier] === Side.French)).toBe(true)
    expect(german.every((soldier) => sim.soldiers.side.value[soldier] === Side.German)).toBe(true)
    expect(french.every((soldier) => sim.soldiers.position.z[soldier] < 100)).toBe(true)
    expect(german.every((soldier) => sim.soldiers.position.z[soldier] > 300)).toBe(true)
  })

  it("sends the French line forward while the Germans hold", () => {
    const sim = createSimulation({ map, seed: 1 })
    const { french, german } = setupSkirmish(sim, 10)
    const frenchStart = french.map((soldier) => sim.soldiers.position.z[soldier])
    const germanStart = german.map((soldier) => sim.soldiers.position.z[soldier])

    for (let step = 0; step < 10 * TICK_RATE; step++) {
      stepSimulation(sim)
    }

    french.forEach((soldier, index) => expect(sim.soldiers.position.z[soldier]).toBeGreaterThan(frenchStart[index]))
    german.forEach((soldier, index) => expect(sim.soldiers.position.z[soldier]).toBe(germanStart[index]))
  })
})
