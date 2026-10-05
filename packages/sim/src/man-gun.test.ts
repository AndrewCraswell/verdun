import { createFlatMap, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import { gunPartner } from "./man-gun.ts"
import { createSimulation, enqueueCommand, spawnSoldier, stepSimulation } from "./simulation.ts"

function field() {
  return createSimulation({
    map: createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass),
    seed: 1
  })
}

describe("manning a machine gun", () => {
  it("takes over the gun beside him, the gunner takes up a rifle, and hands it back", () => {
    const sim = field()
    const gunner = spawnSoldier(sim, { side: Side.French, x: 50, z: 50, weapon: Weapon.MachineGun })
    const player = spawnSoldier(sim, { side: Side.French, x: 51.5, z: 50 })
    spawnSoldier(sim, { side: Side.French, x: 70, z: 50 })
    expect(gunPartner(sim, player)).toBe(gunner)

    enqueueCommand(sim, { type: "man-gun", soldier: player })
    stepSimulation(sim)
    expect(sim.soldiers.weapon.kind[player]).toBe(Weapon.MachineGun)
    expect(sim.soldiers.weapon.kind[gunner]).toBe(Weapon.Rifle)
    expect(sim.events).toContainEqual(expect.objectContaining({ type: "gun-manned", soldier: player }))

    enqueueCommand(sim, { type: "man-gun", soldier: player })
    stepSimulation(sim)
    expect(sim.soldiers.weapon.kind[player]).toBe(Weapon.Rifle)
    expect(sim.soldiers.weapon.kind[gunner]).toBe(Weapon.MachineGun)
  })

  it("does nothing with no gun in reach, nor an enemy's", () => {
    const sim = field()
    const player = spawnSoldier(sim, { side: Side.French, x: 50, z: 50 })
    spawnSoldier(sim, { side: Side.German, x: 51, z: 50, weapon: Weapon.MachineGun })
    spawnSoldier(sim, { side: Side.French, x: 60, z: 50, weapon: Weapon.MachineGun })
    expect(gunPartner(sim, player)).toBe(-1)

    enqueueCommand(sim, { type: "man-gun", soldier: player })
    stepSimulation(sim)
    expect(sim.soldiers.weapon.kind[player]).toBe(Weapon.Rifle)
  })
})
