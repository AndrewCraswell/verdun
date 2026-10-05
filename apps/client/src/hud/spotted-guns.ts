import { type EntityId, Side, type Simulation, SPOTTED_SECONDS, spottedGuns, type Squad } from "@verdun/sim"

/**
 * Machine guns given away by their fire (W-marks in docs/design/interface.md): the enemy's guns our side has spotted,
 * to bring fire or a grenadier onto, and our own squad's gun once the enemy has spotted it, so the player knows to
 * move it. Each fades as the minute since its last burst runs out.
 */

export interface SpottedGun {
  /** The gunner, standing in for the gun. */
  readonly soldier: EntityId
  readonly x: number
  readonly z: number
  /** 1 just after its last burst, falling to 0 as the enemy loses track of it. */
  readonly fresh: number
  /** Seen by one of our men, not only heard: an observer can bring fire down on it. */
  readonly seen: boolean
  /** Our own squad's gun, spotted by the enemy; otherwise an enemy gun we've spotted. */
  readonly ours: boolean
}

export function spottedGunsView(sim: Simulation, squad: Squad, tickRate: number): SpottedGun[] {
  const side = squad.side
  const enemy = side === Side.French ? Side.German : Side.French
  const fresh = (lastFired: number) => Math.max(0, 1 - (sim.tick - lastFired) / (SPOTTED_SECONDS * tickRate))
  const theirs = spottedGuns(sim, side).map((gun) => ({
    soldier: gun.soldier,
    x: gun.x,
    z: gun.z,
    fresh: fresh(gun.lastFired),
    seen: gun.seen,
    ours: false
  }))
  const ours = spottedGuns(sim, enemy)
    .filter((gun) => squad.members.includes(gun.soldier))
    .map((gun) => ({
      soldier: gun.soldier,
      x: gun.x,
      z: gun.z,
      fresh: fresh(gun.lastFired),
      seen: gun.seen,
      ours: true
    }))
  return [...theirs, ...ours].filter((gun) => gun.fresh > 0)
}
