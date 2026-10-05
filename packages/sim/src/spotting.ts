import type { EntityId } from "bitecs"
import { Shell } from "./artillery.ts"
import { Weapon } from "./combat.ts"
import { applyCommand } from "./commands.ts"
import { NEVER, Side } from "./components.ts"
import { type Simulation, TICK_RATE } from "./simulation.ts"
import { nearestSoldiers, soldiersNear } from "./spatial.ts"
import { isAlive } from "./squads.ts"
import { soldierEye } from "./stance.ts"

/** A machine gun firing within this many metres of an enemy is heard well enough to place it. */
export const HEARD_WITHIN = 150
/** Beyond hearing, a firing gun is placed by an enemy who can see it, out to this many metres. */
export const SEEN_WITHIN = 600
/** A spotted gun stays marked this many seconds after its last burst: long enough to bring fire down on it. */
export const SPOTTED_SECONDS = 60
/**
 * A side's commander brings a battery down on a spotted gun its men can see, but never on one within this many metres
 * of its own men: field guns scatter tens of metres.
 */
export const COUNTER_FIRE_CLEARANCE = 60
/** At most one fire mission on the same gun this often, in seconds: a battery's ration for one target. */
export const COUNTER_FIRE_EVERY = 180
/**
 * The counter-fire mission: a field battery's HE on a 40 m by 20 m box round the gun, after the usual 30 s to pass the
 * call back and lay the guns, for 30 s at 24 rounds a minute: twelve rounds, enough to silence or kill a crew in the
 * open, often not one in a good emplacement.
 */
const COUNTER_FIRE = { width: 40, band: 20, delay: 30, duration: 30, roundsPerMinute: 24 } as const
/** How many of the nearest enemies look for an unspotted gun each time it's checked. */
const LOOKERS = 8
/** An unspotted gun is checked again at most this often while it fires, in seconds: sight lines cost. */
const RECHECK_SECONDS = 1

/** A machine gun that has given itself away by firing, as its enemy knows it. */
export interface GunSighting {
  /** The gunner who fired it. */
  readonly soldier: EntityId
  /** The gun's side. The other side is the one that has spotted it. */
  readonly side: Side
  /** Where it fired from last. */
  x: number
  z: number
  /** The step it last fired on. */
  lastFired: number
  /** Whether the enemy has placed it: heard close by, or seen. */
  spotted: boolean
  /** Whether an enemy has seen it, not only heard it: what an observer needs to bring fire down on it. */
  seen: boolean
  /** The step its enemy last looked for it. */
  checkedAt: number
  /** The step the enemy last called a battery down on it. */
  shelledAt: number
}

/** Machine guns that have fired, and which of them the enemy has spotted. */
export interface SpottingState {
  readonly sightings: GunSighting[]
}

/** A machine gun spotted by the enemy, for the HUD's markers, the battle log and sound. */
export interface GunSpottedEvent {
  readonly type: "gun-spotted"
  /** The side that spotted it. */
  readonly side: Side
  /** The gunner. */
  readonly soldier: EntityId
  readonly x: number
  readonly z: number
}

export function createSpotting(): SpottingState {
  return { sightings: [] }
}

const enemyOf = (side: Side): Side => (side === Side.French ? Side.German : Side.French)

/** The enemy machine guns a side has spotted and that have fired within the last minute, oldest sighting first. */
export function spottedGuns(sim: Simulation, side: Side): readonly GunSighting[] {
  return sim.spotting.sightings.filter((sighting) => sighting.side !== side && sighting.spotted)
}

/** Whether the enemy places a firing gun: one of them close enough to hear it, or one of the nearest who can see it. */
function placeGun(sim: Simulation, gunner: EntityId, sighting: GunSighting): void {
  const { position, side } = sim.soldiers
  const enemy = enemyOf(sighting.side)
  const isEnemy = (other: EntityId) => side.value[other] === enemy && isAlive(sim, other)
  const heard = soldiersNear(sim, sighting.x, sighting.z, HEARD_WITHIN).some((other) => {
    const dx = position.x[other] - sighting.x
    const dz = position.z[other] - sighting.z
    return isEnemy(other) && dx * dx + dz * dz <= HEARD_WITHIN * HEARD_WITHIN
  })
  const lineOfSight = sim.lineOfSight
  const seen =
    lineOfSight !== null &&
    nearestSoldiers(sim, sighting.x, sighting.z, LOOKERS, SEEN_WITHIN, isEnemy).some((other) =>
      lineOfSight.isClear(soldierEye(sim, other), soldierEye(sim, gunner))
    )
  sighting.seen = sighting.seen || seen
  sighting.spotted = sighting.spotted || heard || seen
}

/**
 * Marks machine guns that give themselves away by firing. Every gun that fired this step is placed by the enemy if one
 * of them can hear it close by or see it; once spotted it stays marked until it has been quiet for a minute. Reads
 * this step's shots, so it runs after combat.
 */
export function spottingSystem(sim: Simulation): void {
  const { sightings } = sim.spotting
  const fired = new Set<EntityId>()
  for (const event of sim.events) {
    if (event.type === "shot" && sim.soldiers.weapon.kind[event.shooter] === Weapon.MachineGun) {
      fired.add(event.shooter)
    }
  }
  for (const gunner of [...fired].sort((a, b) => a - b)) {
    let sighting = sightings.find((candidate) => candidate.soldier === gunner)
    if (!sighting) {
      sighting = {
        soldier: gunner,
        side: sim.soldiers.side.value[gunner] === Side.German ? Side.German : Side.French,
        x: 0,
        z: 0,
        lastFired: sim.tick,
        spotted: false,
        seen: false,
        checkedAt: NEVER,
        shelledAt: NEVER
      }
      sightings.push(sighting)
    }
    sighting.x = sim.soldiers.position.x[gunner]
    sighting.z = sim.soldiers.position.z[gunner]
    sighting.lastFired = sim.tick
    if (!sighting.seen && sim.tick - sighting.checkedAt >= RECHECK_SECONDS * TICK_RATE) {
      const wasSpotted = sighting.spotted
      sighting.checkedAt = sim.tick
      placeGun(sim, gunner, sighting)
      if (sighting.spotted && !wasSpotted) {
        sim.events.push({
          type: "gun-spotted",
          side: enemyOf(sighting.side),
          soldier: gunner,
          x: sighting.x,
          z: sighting.z
        })
      }
    }
  }
  callCounterFire(sim)
  // Guns quiet for a minute are lost track of.
  for (let index = sightings.length - 1; index >= 0; index--) {
    if (sim.tick - sightings[index]!.lastFired > SPOTTED_SECONDS * TICK_RATE) {
      sightings.splice(index, 1)
    }
  }
}

/**
 * Each side's commander calls a battery down on the enemy guns its men can see, once a gun has been quiet from fire for
 * long enough, unless any of its own men are close enough to be caught by the scatter. Shells come out of the side's
 * stock like any fire mission.
 */
function callCounterFire(sim: Simulation): void {
  const { position, side } = sim.soldiers
  for (const sighting of sim.spotting.sightings) {
    if (!sighting.seen || sim.tick - sighting.shelledAt < COUNTER_FIRE_EVERY * TICK_RATE) {
      continue
    }
    const firer = enemyOf(sighting.side)
    const ownTooClose = soldiersNear(sim, sighting.x, sighting.z, COUNTER_FIRE_CLEARANCE).some((other) => {
      const dx = position.x[other] - sighting.x
      const dz = position.z[other] - sighting.z
      return (
        side.value[other] === firer &&
        isAlive(sim, other) &&
        dx * dx + dz * dz <= COUNTER_FIRE_CLEARANCE * COUNTER_FIRE_CLEARANCE
      )
    })
    if (ownTooClose) {
      continue
    }
    sighting.shelledAt = sim.tick
    applyCommand(sim, {
      type: "fire-mission",
      plan: {
        side: firer,
        shell: Shell.FieldHighExplosive,
        fromX: sighting.x - COUNTER_FIRE.width / 2,
        toX: sighting.x + COUNTER_FIRE.width / 2,
        z: sighting.z,
        band: COUNTER_FIRE.band,
        roundsPerMinute: COUNTER_FIRE.roundsPerMinute,
        delay: COUNTER_FIRE.delay,
        duration: COUNTER_FIRE.duration
      }
    })
  }
}
