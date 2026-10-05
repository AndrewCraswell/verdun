import { createFlatMap, layOutFront, mapDepth } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import { createSimulation, soldierIds, stepSimulation } from "./simulation.ts"
import { callForFire, callGasOn, setupSkirmish } from "./skirmish.ts"

const flat = createFlatMap({ name: "test", cellSize: 1, columns: 300, rows: 200 })
const map = { ...flat, trenches: layOutFront(flat) }

describe("setupSkirmish", () => {
  it("mans each side's front-line fire trench, French to the south and Germans to the north", () => {
    const sim = createSimulation({ map, seed: 1 })
    const { french, german } = setupSkirmish(sim, 50, 0)
    const depth = mapDepth(map)

    expect(Array.from(soldierIds(sim))).toHaveLength(100)
    expect(french.every((soldier) => sim.soldiers.side.value[soldier] === Side.French)).toBe(true)
    expect(german.every((soldier) => sim.soldiers.side.value[soldier] === Side.German)).toBe(true)
    // Front lines at 25% and 75% of the depth, give or take a traverse and the step up toward the enemy.
    expect(french.every((soldier) => Math.abs(sim.soldiers.position.z[soldier] - depth * 0.25) <= 4)).toBe(true)
    expect(german.every((soldier) => Math.abs(sim.soldiers.position.z[soldier] - depth * 0.75) <= 4)).toBe(true)
  })

  it("arms some squads with rifle grenadiers and snipers alongside the machine guns", () => {
    const sim = createSimulation({ map, seed: 1 })
    const { french } = setupSkirmish(sim, 48, 0)
    const carrying = (weapon: number) => french.filter((soldier) => sim.soldiers.weapon.kind[soldier] === weapon)

    // Six squads: grenadiers in squads 0 and 4, a sniper in squad 4, a machine gun in squad 2.
    expect(carrying(Weapon.RifleGrenadier)).toEqual([french[2], french[34]])
    expect(carrying(Weapon.Sniper)).toEqual([french[33]])
    expect(carrying(Weapon.MachineGun)).toEqual([french[23]])
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
    const { french, playerSquad } = setupSkirmish(sim, 48, 0)

    expect(sim.squads).toHaveLength(12)
    expect(sim.squads.every((squad) => squad.members.length === 8)).toBe(true)
    expect(playerSquad.side).toBe(Side.French)
    expect(playerSquad.members).toEqual(french.slice(24, 32))
    expect(playerSquad.controller).toBe("player")
    expect(sim.squads.filter((squad) => squad.controller === "player")).toHaveLength(1)
  })

  it("gives the player the middle German squad when they fight for Germany", () => {
    const sim = createSimulation({ map, seed: 1 })
    const { german, playerSquad } = setupSkirmish(sim, 48, 0, 160, Side.German)

    expect(playerSquad.side).toBe(Side.German)
    expect(playerSquad.members).toEqual(german.slice(24, 32))
    expect(sim.squads.filter((squad) => squad.controller === "player")).toEqual([playerSquad])
  })

  it("keeps reserves in each side's support line, behind its front line", () => {
    const sim = createSimulation({ map, seed: 1 })
    const { french, german, reserves } = setupSkirmish(sim, 48, 16)

    expect(reserves).toHaveLength(4)
    expect(reserves.every((squad) => squad.controller === "ai" && squad.order.kind === "reserve")).toBe(true)
    const behind = (squad: (typeof reserves)[number], front: readonly number[]) => {
      const lineZ = sim.soldiers.position.z[front[0] ?? 0]
      const z = sim.soldiers.position.z[squad.leader]
      return squad.side === Side.French ? z < lineZ - 20 : z > lineZ + 20
    }
    expect(reserves.every((squad) => behind(squad, squad.side === Side.French ? french : german))).toBe(true)
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

  it("calls fire on a point, arriving after the communications delay", () => {
    const sim = createSimulation({ map, seed: 1 })
    setupSkirmish(sim, 16)
    callForFire(sim, Side.French, 120, 140)
    stepSimulation(sim)
    const [mission] = sim.artillery.missions

    expect(mission?.fromX).toBe(90)
    expect(mission?.toX).toBe(150)
    expect(mission?.z).toBe(140)
    expect(mission?.delay).toBe(30)
  })

  it("calls a gas shoot on a point, after the same delay as any call for fire", () => {
    const sim = createSimulation({ map, seed: 1 })
    setupSkirmish(sim, 16)
    callGasOn(sim, Side.French, 120, 140)
    stepSimulation(sim)
    const [mission] = sim.artillery.missions

    expect(mission?.shell).toBe(Shell.FieldGas)
    expect([mission?.fromX, mission?.toX, mission?.z, mission?.delay]).toEqual([70, 170, 140, 30])
  })

  it("refuses a map with no trenches to man", () => {
    expect(() => setupSkirmish(createSimulation({ map: flat, seed: 1 }))).toThrow("fire trench")
  })
})
