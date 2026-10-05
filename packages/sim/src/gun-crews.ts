import type { EntityId } from "bitecs"
import { Weapon } from "./combat.ts"
import { applyCommand } from "./commands.ts"
import type { Simulation } from "./simulation.ts"
import { TICK_RATE } from "./simulation.ts"
import { isAlive } from "./squads.ts"

/** A squadmate within this many metres of a fallen gunner goes to take up the gun. */
export const CREW_REACH = 12
/** Once at the gun, he has it firing after this many seconds: clearing the belt, checking the water, laying it. */
export const TAKE_UP_SECONDS = 5
/** He gives up if he hasn't reached the gun in this many seconds. */
const GIVE_UP_SECONDS = 30
/** He's at the gun when this close to where the gunner fell, in metres. */
const AT_THE_GUN = 1.5

/** A squadmate on his way to take up a fallen gunner's gun. */
export interface GunPickup {
  /** The gunner who fell, lying where the gun is. */
  readonly gunner: EntityId
  /** The man going to take it up. */
  readonly by: EntityId
  /** The step he set off. */
  readonly startedAt: number
  /** The step he reached the gun, or -1 while he's on his way. */
  reachedAt: number
}

export interface GunCrewState {
  readonly pickups: GunPickup[]
}

/** A gun firing again under a new gunner, for the battle log and sound. */
export interface GunMannedEvent {
  readonly type: "gun-manned"
  readonly squad: number
  readonly soldier: EntityId
}

export function createGunCrews(): GunCrewState {
  return { pickups: [] }
}

/** The nearest living rifleman of the fallen gunner's squad within reach, or -1. */
function nextCrewman(sim: Simulation, gunner: EntityId, taken: ReadonlySet<EntityId>): EntityId {
  const { position, weapon } = sim.soldiers
  const squad = sim.squads[sim.soldiers.squad.id[gunner]]
  let best: EntityId = -1
  let bestDistance = CREW_REACH * CREW_REACH
  for (const member of squad?.members ?? []) {
    if (member === gunner || taken.has(member) || !isAlive(sim, member)) {
      continue
    }
    if (weapon.kind[member] === Weapon.MachineGun) {
      continue
    }
    const distance = (position.x[member] - position.x[gunner]) ** 2 + (position.z[member] - position.z[gunner]) ** 2
    if (distance <= bestDistance) {
      best = member
      bestDistance = distance
    }
  }
  return best
}

/**
 * Keeps machine guns in action when their gunners fall: the nearest squadmate within reach goes to the gun, and once
 * there has it firing again after a few seconds. A gun whose squad has nobody near is silent until it's retaken.
 * Reads this step's fallen soldiers, so it runs after combat and the artillery.
 */
export function gunCrewSystem(sim: Simulation): void {
  const { pickups } = sim.gunCrews
  const taken = new Set(pickups.map((pickup) => pickup.by))
  for (const event of sim.events) {
    if (event.type !== "fallen" || sim.soldiers.weapon.kind[event.soldier] !== Weapon.MachineGun) {
      continue
    }
    const by = nextCrewman(sim, event.soldier, taken)
    if (by >= 0) {
      taken.add(by)
      pickups.push({ gunner: event.soldier, by, startedAt: sim.tick, reachedAt: -1 })
      const { x, z } = sim.soldiers.position
      applyCommand(sim, { type: "move-to", soldier: by, x: x[event.soldier], z: z[event.soldier] })
    }
  }
  const { position, weapon } = sim.soldiers
  for (let index = pickups.length - 1; index >= 0; index--) {
    const pickup = pickups[index]!
    const gaveUp = sim.tick - pickup.startedAt > GIVE_UP_SECONDS * TICK_RATE
    if (!isAlive(sim, pickup.by) || (pickup.reachedAt < 0 && gaveUp)) {
      pickups.splice(index, 1)
      continue
    }
    if (pickup.reachedAt < 0) {
      const dx = position.x[pickup.by] - position.x[pickup.gunner]
      const dz = position.z[pickup.by] - position.z[pickup.gunner]
      if (dx * dx + dz * dz <= AT_THE_GUN * AT_THE_GUN) {
        pickup.reachedAt = sim.tick
      }
      continue
    }
    if (sim.tick - pickup.reachedAt >= TAKE_UP_SECONDS * TICK_RATE) {
      // The gun changes hands: the man lying beside it no longer has it.
      weapon.kind[pickup.gunner] = Weapon.Rifle
      weapon.kind[pickup.by] = Weapon.MachineGun
      weapon.cooldown[pickup.by] = 0
      pickups.splice(index, 1)
      sim.events.push({ type: "gun-manned", squad: sim.soldiers.squad.id[pickup.by], soldier: pickup.by })
    }
  }
}
