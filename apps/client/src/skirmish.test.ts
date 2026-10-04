import { createFlatMap, layOutFront, mapDepth } from "@verdun/map"
import { createSimulation, Side, soldierIds } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { setupSkirmish } from "./skirmish.ts"

const flat = createFlatMap({ name: "test", cellSize: 1, columns: 300, rows: 200 })
const map = { ...flat, trenches: layOutFront(flat) }

describe("setupSkirmish", () => {
  it("mans each side's front-line fire trench, French to the south and Germans to the north", () => {
    const sim = createSimulation({ map, seed: 1 })
    const { french, german } = setupSkirmish(sim, 50)
    const depth = mapDepth(map)

    expect(Array.from(soldierIds(sim))).toHaveLength(100)
    expect(french.every((soldier) => sim.soldiers.side.value[soldier] === Side.French)).toBe(true)
    expect(german.every((soldier) => sim.soldiers.side.value[soldier] === Side.German)).toBe(true)
    // Front lines at 25% and 75% of the depth, give or take a traverse, not the support trenches behind.
    expect(french.every((soldier) => Math.abs(sim.soldiers.position.z[soldier] - depth * 0.25) <= 3)).toBe(true)
    expect(german.every((soldier) => Math.abs(sim.soldiers.position.z[soldier] - depth * 0.75) <= 3)).toBe(true)
  })

  it("spreads soldiers along the whole trench", () => {
    const sim = createSimulation({ map, seed: 1 })
    const { french } = setupSkirmish(sim, 20)
    const xs = french.map((soldier) => sim.soldiers.position.x[soldier])

    expect(Math.min(...xs)).toBeLessThan(40)
    expect(Math.max(...xs)).toBeGreaterThan(240)
  })

  it("forms each line into squads of eight and gives the player the middle French squad", () => {
    const sim = createSimulation({ map, seed: 1 })
    const { french, playerSquad } = setupSkirmish(sim, 48)

    expect(sim.squads).toHaveLength(12)
    expect(sim.squads.every((squad) => squad.members.length === 8)).toBe(true)
    expect(playerSquad.side).toBe(Side.French)
    expect(playerSquad.members).toEqual(french.slice(24, 32))
  })

  it("refuses a map with no trenches to man", () => {
    expect(() => setupSkirmish(createSimulation({ map: flat, seed: 1 }))).toThrow("fire trench")
  })
})
