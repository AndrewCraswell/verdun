import type { EntityId } from "bitecs"
import { Weapon } from "./combat.ts"
import { type Simulation, soldierIds } from "./simulation.ts"
import { isAlive } from "./squads.ts"

/** A man takes over a gun, or hands his own over, to a comrade within this many metres. */
export const MAN_REACH = 2.5

/** The nearest living comrade of a soldier within reach carrying a weapon of a kind, or -1. */
function nearestWith(sim: Simulation, soldier: EntityId, wanted: (kind: number) => boolean): EntityId {
  const { position, side, weapon } = sim.soldiers
  let best: EntityId = -1
  let bestDistance = MAN_REACH * MAN_REACH
  for (const other of soldierIds(sim)) {
    if (other === soldier || side.value[other] !== side.value[soldier] || !isAlive(sim, other)) {
      continue
    }
    if (!wanted(weapon.kind[other] ?? Weapon.Rifle)) {
      continue
    }
    const distance = (position.x[other] - position.x[soldier]) ** 2 + (position.z[other] - position.z[soldier]) ** 2
    if (distance <= bestDistance) {
      best = other
      bestDistance = distance
    }
  }
  return best
}

/** The comrade a soldier would take a machine gun over from, or hand his own to: -1 when there's none in reach. */
export function gunPartner(sim: Simulation, soldier: EntityId): EntityId {
  const manning = sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun
  return nearestWith(sim, soldier, (kind) => (manning ? kind === Weapon.Rifle : kind === Weapon.MachineGun))
}

/**
 * A soldier beside a comrade's machine gun takes it over, and the gunner takes up his rifle; a soldier on a gun hands it
 * back to the rifleman nearest him. Whether the gun changed hands.
 */
export function manGun(sim: Simulation, soldier: EntityId): boolean {
  const partner = gunPartner(sim, soldier)
  if (partner < 0) {
    return false
  }
  const { weapon } = sim.soldiers
  const gunner = weapon.kind[soldier] === Weapon.MachineGun ? partner : soldier
  const from = gunner === soldier ? partner : soldier
  weapon.kind[from] = Weapon.Rifle
  weapon.kind[gunner] = Weapon.MachineGun
  weapon.cooldown[gunner] = 0
  sim.events.push({ type: "gun-manned", squad: sim.soldiers.squad.id[gunner], soldier: gunner })
  return true
}
