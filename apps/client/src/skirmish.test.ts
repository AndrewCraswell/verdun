import { createFlatMap, layOutFront, mapDepth } from "@verdun/map"
import { createSimulation, Side, soldierIds, stepSimulation, Weapon } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { goOverTheTop, setupSkirmish } from "./skirmish.ts"

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
    // Front lines at 25% and 75% of the depth, give or take a traverse and the step up toward the enemy.
    expect(french.every((soldier) => Math.abs(sim.soldiers.position.z[soldier] - depth * 0.25) <= 4)).toBe(true)
    expect(german.every((soldier) => Math.abs(sim.soldiers.position.z[soldier] - depth * 0.75) <= 4)).toBe(true)
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
    expect(playerSquad.controller).toBe("player")
    expect(sim.squads.filter((squad) => squad.controller === "player")).toHaveLength(1)
  })

  it("puts soldiers up on the fire step, toward the enemy, with a machine gun every fifth squad", () => {
    const sim = createSimulation({ map, seed: 1 })
    const { french, german } = setupSkirmish(sim, 80)
    const depth = mapDepth(map)
    const gunners = [...french, ...german].filter((soldier) => sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun)

    // North of the trench centre line for the French, south of it for the Germans.
    expect(french.some((soldier) => sim.soldiers.position.z[soldier] > depth * 0.25)).toBe(true)
    expect(german.some((soldier) => sim.soldiers.position.z[soldier] < depth * 0.75)).toBe(true)
    // Ten squads a side: two gunners each.
    expect(gunners).toHaveLength(4)
  })

  it("sends a whole side over the top toward the enemy line opposite each squad", () => {
    const sim = createSimulation({ map, seed: 1 })
    setupSkirmish(sim, 48)
    goOverTheTop(sim, Side.French)
    stepSimulation(sim)
    const french = sim.squads.filter((squad) => squad.side === Side.French)
    const german = sim.squads.filter((squad) => squad.side === Side.German)

    for (const squad of french) {
      expect(squad.order.kind).toBe("advance")
      expect(squad.order.kind === "advance" && Math.abs(squad.order.z - mapDepth(map) * 0.75) <= 3).toBe(true)
    }
    expect(german.every((squad) => squad.order.kind === "hold")).toBe(true)
  })

  it("refuses a map with no trenches to man", () => {
    expect(() => setupSkirmish(createSimulation({ map: flat, seed: 1 }))).toThrow("fire trench")
  })
})
