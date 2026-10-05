import {
  GRENADE_FUSE,
  type GrenadeFlight,
  grenadeFlight,
  isAlive,
  Shell,
  SHELLS,
  type Simulation,
  soldierIds,
  type Squad,
  throwError,
  throwReach
} from "@verdun/sim"

/**
 * Where a grenade would go if the man under control threw it now at a point (H9 in docs/design/interface.md): its arc
 * from his hand, where it would come down, whether it clears the ground in front of him or strikes it and rolls back,
 * its blast, how widely a throw that long scatters, how far he can throw, and whether any of our own men are where it
 * would burst. Worked out from the simulation, for the preview drawn while the throw key is held.
 */

/** What the preview says about the throw, worst first: our men in the blast, it won't clear, it's too far, it's fine. */
export type ThrowVerdict = "danger" | "strikes" | "short" | "clear" | "none"

export interface ThrowPreview {
  /** The man throwing, and where he stands. */
  readonly from: { readonly x: number; readonly z: number }
  readonly flight: GrenadeFlight
  /** The most he can throw now, in metres, by how he holds himself. */
  readonly reach: number
  /** How far the point under the pointer is, in metres. */
  readonly distance: number
  /** Distance within which half of men in the open fall, in metres, around where it comes to rest. */
  readonly blast: number
  /** The throw's probable error at this length, in metres: half of throws land within it of the mark. */
  readonly scatter: number
  /** Seconds from the throw to the burst. */
  readonly fuse: number
  /** Our own men within the blast of where it would come to rest, the thrower included. */
  readonly ourMenInBlast: number
  readonly grenades: number
  readonly verdict: ThrowVerdict
}

/** Men within the blast and this much more, in metres, count as in it: a scatter's grace. */
const BLAST_MARGIN = 1

/** The preview of a throw at a ground point by the man under control, or null with nobody under control. */
export function throwPreview(sim: Simulation, squad: Squad, at: { x: number; z: number }): ThrowPreview | null {
  const thrower = squad.leader
  if (thrower < 0 || !isAlive(sim, thrower)) {
    return null
  }
  const { position, grenades, side } = sim.soldiers
  const from = { x: position.x[thrower], z: position.z[thrower] }
  const flight = grenadeFlight(sim, thrower, at.x, at.z)
  const distance = Math.hypot(at.x - from.x, at.z - from.z)
  const blast = SHELLS[Shell.Grenade].lethalExposed
  let ourMenInBlast = 0
  for (const soldier of soldierIds(sim)) {
    if (side.value[soldier] !== side.value[thrower] || !isAlive(sim, soldier)) {
      continue
    }
    if (Math.hypot(position.x[soldier] - flight.rest.x, position.z[soldier] - flight.rest.z) <= blast + BLAST_MARGIN) {
      ourMenInBlast++
    }
  }
  const count = grenades.count[thrower]
  let verdict: ThrowVerdict = "clear"
  if (count === 0) {
    verdict = "none"
  } else if (ourMenInBlast > 0) {
    verdict = "danger"
  } else if (flight.struck) {
    verdict = "strikes"
  } else if (flight.short) {
    verdict = "short"
  }
  return {
    from,
    flight,
    reach: throwReach(sim, thrower),
    distance,
    blast,
    scatter: throwError(Math.min(distance, throwReach(sim, thrower))),
    fuse: GRENADE_FUSE,
    ourMenInBlast,
    grenades: count,
    verdict
  }
}
