import { createFlatMap, layOutFront, mapDepth } from "@verdun/map"
import { createSimulation, Shell, Side, soldierIds, stepSimulation, Weapon } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import {
  attackBehindBarrage,
  bombardEnemyLine,
  CREEPING_BARRAGE,
  callForFire,
  callGasOn,
  setupSkirmish
} from "./skirmish.ts"

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

  it("sends a whole side over the top behind a creeping barrage that opens just beyond its wire", () => {
    const sim = createSimulation({ map, seed: 1 })
    setupSkirmish(sim, 48)
    attackBehindBarrage(sim, Side.French)
    stepSimulation(sim)
    const [barrage] = sim.artillery.missions
    const depth = mapDepth(map)

    expect(barrage?.shell).toBe(Shell.FieldHighExplosive)
    // The front line averages bays and traverses, which sit a little behind it.
    expect(Math.abs((barrage?.z ?? 0) - (depth * 0.25 + CREEPING_BARRAGE.openAhead))).toBeLessThanOrEqual(3)
    expect(barrage?.creep?.lift).toBe(CREEPING_BARRAGE.lift)
    for (const squad of sim.squads.filter((squad) => squad.side === Side.French)) {
      expect(squad.order.kind).toBe("creep")
      expect(squad.order.kind === "creep" && Math.abs(squad.order.objectiveZ - depth * 0.75) <= 3).toBe(true)
    }
    expect(
      sim.squads.filter((squad) => squad.side === Side.German).every((squad) => squad.order.kind !== "creep")
    ).toBe(true)
  })

  it("bombards the enemy front line with heavy and field guns", () => {
    const sim = createSimulation({ map, seed: 1 })
    setupSkirmish(sim, 16)
    bombardEnemyLine(sim, Side.French)
    stepSimulation(sim)

    expect(sim.artillery.missions.map((mission) => mission.shell)).toEqual([
      Shell.HeavyHighExplosive,
      Shell.FieldHighExplosive,
      Shell.FieldHighExplosive
    ])
    const [heavy, field, wire] = sim.artillery.missions
    const enemyLine = mapDepth(map) * 0.75
    expect([heavy, field].every((mission) => Math.abs((mission?.z ?? 0) - enemyLine) <= 3)).toBe(true)
    // The third sweeps the wire belts in front of the line.
    expect(Math.abs((wire?.z ?? 0) - (enemyLine - 30))).toBeLessThanOrEqual(3)
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

  it("does nothing without front lines to work from", () => {
    const sim = createSimulation({ map: flat, seed: 1 })
    attackBehindBarrage(sim, Side.French)
    bombardEnemyLine(sim, Side.French)

    expect(sim.pendingCommands).toHaveLength(0)
  })

  it("refuses a map with no trenches to man", () => {
    expect(() => setupSkirmish(createSimulation({ map: flat, seed: 1 }))).toThrow("fire trench")
  })
})
