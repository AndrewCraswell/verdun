import { createFlatMap, layOutFront, Surface } from "@verdun/map"
import {
  createSimulation,
  createSquad,
  type EntityId,
  Side,
  type Simulation,
  type Squad,
  spawnSoldier,
  Weapon
} from "@verdun/sim"

/**
 * A small battle for the HUD's tests: flat grass 300 m by 200 m with both sides' trench lines laid out, two
 * objectives, and the player's French squad of eight in the open, its machine gun in the last slot.
 */
export function testBattle(): { sim: Simulation; squad: Squad; members: EntityId[] } {
  const flat = createFlatMap({ name: "sector", cellSize: 0.5, columns: 600, rows: 400 }, 5, Surface.Grass)
  const map = {
    ...flat,
    trenches: layOutFront(flat),
    objectives: [
      { name: "Crossroads", x: 150, z: 100, radius: 10 },
      { name: "The mine craters", x: 60, z: 60, radius: 10 }
    ]
  }
  const sim = createSimulation({ map, seed: 1 })
  const members = Array.from({ length: 8 }, (_, index) =>
    spawnSoldier(sim, {
      side: Side.French,
      x: 40 + index * 3,
      z: 20,
      weapon: index === 7 ? Weapon.MachineGun : Weapon.Rifle
    })
  )
  const squad = createSquad(sim, Side.French, members, "player")
  return { sim, squad, members }
}

/** The soldier in a slot, counting from 0, failing the test if there's none. */
export function slot(members: readonly EntityId[], index: number): EntityId {
  const soldier = members[index]
  if (soldier === undefined) {
    throw new Error(`No soldier in slot ${index}`)
  }
  return soldier
}
