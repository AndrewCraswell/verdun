import {
  type EntityId,
  hitChance,
  isAlive,
  seesThroughSmoke,
  shotSteadiness,
  sightReach,
  type Simulation,
  soldierEye,
  soldierIds,
  WEAPONS
} from "@verdun/sim"
import { aimedTargetNow } from "../control/aimed-target.ts"
import { weaponOf } from "./squad-names.ts"

/**
 * What the man under control would make of the enemy he aims at (H8):
 * - `target`: in his sights; a shot goes at him.
 * - `blocked`: his own cover is in the way, his parapet or the side of his shell hole: he'd have to step up or out.
 * - `unseen`: something further off hides the man from him, though a squadmate sees him (he's drawn).
 * - `dark`: in his line of sight but too far to make out by this light, or behind smoke.
 * - `range`: beyond his weapon's reach.
 */
export type SightState = "target" | "blocked" | "unseen" | "dark" | "range"

export interface SightPicture {
  readonly state: SightState
  /** The enemy aimed at. */
  readonly man: EntityId
  /** Chance a shot hits him now, steadiness and all; 0 unless he's in the sights. */
  readonly chance: number
  /** How steady the aim is, from 0 (a snap shot) to 1. */
  readonly steadiness: number
}

/** An enemy within about 4 degrees of where a man faces is the one he's aiming at, as the shot itself judges. */
const CONE = 0.9975
/** His own cover is whatever blocks the first this many metres from his eye: a parapet, a crater's lip. */
const OWN_COVER = 3

/**
 * The enemy a man is aiming at, among those the player can see drawn (`seen`): the one the player picked out, or the
 * nearest within about 4 degrees of where he faces. -1 for none. Never a man the fog hides, so the sight picture gives
 * nobody away.
 */
export function aimedAt(sim: Simulation, shooter: EntityId, seen: (soldier: EntityId) => boolean): EntityId {
  const { position, facing, side, target } = sim.soldiers
  const picked = target.id[shooter]
  if (picked >= 0 && side.value[picked] !== side.value[shooter] && isAlive(sim, picked) && seen(picked)) {
    return picked
  }
  const x = position.x[shooter]
  const z = position.z[shooter]
  let best: EntityId = -1
  let bestDistance = Infinity
  for (const soldier of soldierIds(sim)) {
    if (side.value[soldier] === side.value[shooter]) {
      continue
    }
    const dx = position.x[soldier] - x
    const dz = position.z[soldier] - z
    const distance = Math.sqrt(dx * dx + dz * dz)
    if (
      distance > 0 &&
      distance < bestDistance &&
      (dx * facing.x[shooter] + dz * facing.z[shooter]) / distance > CONE &&
      seen(soldier)
    ) {
      best = soldier
      bestDistance = distance
    }
  }
  return best
}

/** A standing man's front, in square metres: what a shot's spread is measured against. */
const FRONT = 0.75
/** The spread's ring is never drawn tighter than this, nor wider, in metres across its radius. */
const SPREAD = { min: 0.9, max: 6 } as const

/**
 * How wide a shot's spread is at the man aimed at, as the radius of a ring round him, in metres, for its chance of
 * hitting: a man's front fills that share of the ring. A man in the open close by sits in a tight ring; a head over a
 * parapet, or a man far off, in a wide one; and the ring tightens as the aim steadies.
 */
export function spreadRadius(chance: number): number {
  if (!(chance > 0)) {
    return SPREAD.max
  }
  return Math.min(SPREAD.max, Math.max(SPREAD.min, Math.sqrt(FRONT / (Math.PI * chance))))
}

/** How steady a shot's aim is, from 0 to 1, from its share of the chance (half for a snap shot, all of it steadied). */
function steadinessOf(share: number): number {
  return Math.min(1, Math.max(0, (share - 0.5) / 0.5))
}

/**
 * The man under control's sight picture: whom he aims at and whether he can shoot him, and if not, why. Null with
 * nobody drawn in his line of fire.
 */
export function sightPicture(
  sim: Simulation,
  shooter: EntityId,
  seen: (soldier: EntityId) => boolean
): SightPicture | null {
  const share = shotSteadiness(sim, shooter)
  const steadiness = steadinessOf(share)
  const struck = aimedTargetNow(sim, shooter)
  if (struck >= 0 && seen(struck)) {
    return { state: "target", man: struck, chance: hitChance(sim, shooter, struck) * share, steadiness }
  }
  const man = aimedAt(sim, shooter, seen)
  if (man < 0) {
    return null
  }
  const of = (state: SightState): SightPicture => ({ state, man, chance: 0, steadiness })
  const eye = soldierEye(sim, shooter)
  const head = soldierEye(sim, man)
  const dx = head.x - eye.x
  const dz = head.z - eye.z
  const distance = Math.sqrt(dx * dx + dz * dz)
  if (distance > WEAPONS[weaponOf(sim, shooter)].range) {
    return of("range")
  }
  const lineOfSight = sim.lineOfSight
  if (!lineOfSight) {
    return of("unseen")
  }
  if (distance > OWN_COVER) {
    const near = OWN_COVER / distance
    const close = { x: eye.x + dx * near, y: eye.y + (head.y - eye.y) * near, z: eye.z + dz * near }
    if (!lineOfSight.isClear(eye, close)) {
      return of("blocked")
    }
  }
  if (!lineOfSight.isClear(eye, head)) {
    return of("unseen")
  }
  if (distance > sightReach(sim, shooter) || !seesThroughSmoke(sim, eye, head)) {
    return of("dark")
  }
  return of("unseen")
}
