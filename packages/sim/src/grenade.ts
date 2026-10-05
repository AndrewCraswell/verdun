import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"
import type { EntityId } from "bitecs"
import { Stance } from "./components.ts"
import type { WorldPoint } from "./line-of-sight.ts"
import type { Simulation } from "./simulation.ts"

/**
 * A hand grenade's flight: lobbed from the thrower's hand in an arc toward where he throws, coming down where the arc
 * meets the ground. A grenade that strikes steep ground short of its mark (the trench wall in front of a man too low
 * to throw clear, a parapet, a crater's rim) rolls back down the slope before it bursts: into his own bay, if that's
 * where the slope leads. Pure: it reads the map's heights and the thrower's stance, and draws no random numbers.
 */

/**
 * Grenades are thrown at targets between these distances, in metres: closer risks the thrower, further is beyond a
 * man's arm. A strong throw of an F1 or a Mills bomb carried about 30 m; the stick grenade a little further.
 */
export const GRENADE_RANGE = { min: 6, max: 32 } as const

/** Where the grenade leaves the hand, in metres above the ground he stands on, by how he holds himself. */
function handHeight(stance: number): number {
  switch (stance) {
    case Stance.Prone:
      return 0.45
    case Stance.Crouching:
      return 1.3
    case Stance.Sheltering:
      return 1
    default:
      return 1.9
  }
}

/** How far a man can throw for how he holds himself: kneeling costs a little, lying flat most of the throw. */
function armReach(stance: number): number {
  switch (stance) {
    case Stance.Prone:
      return 0.55
    case Stance.Crouching:
      return 0.85
    case Stance.Sheltering:
      return 0.5
    default:
      return 1
  }
}

/** The most a soldier can throw now, in metres: a full arm's throw standing, less kneeling, far less lying down. */
export function throwReach(sim: Simulation, thrower: EntityId): number {
  return GRENADE_RANGE.max * armReach(sim.soldiers.stance.value[thrower])
}

/** The lob leaves the hand rising at this slope, about 40°: steeper only when the mark is higher than that reaches. */
const LAUNCH = Math.tan((40 * Math.PI) / 180)
/** Metres per second per second. */
const GRAVITY = 9.81
/** The arc is followed in steps this long, along the ground, in metres. */
const ARC_STEP = 0.25
/** Ground this steep, rise over run, sends a grenade rolling: a trench wall, a parapet's face, a crater's rim. */
const STEEP = 0.7
/** A grenade stopped short by what it struck has lost its way: it rolls off anything steeper than this. */
const STRUCK_STEEP = 0.3
/** A rolling grenade stops where the ground is no steeper than this, or in a hollow. */
const SETTLED = 0.25
/** It rolls in steps this long, at most this far, in metres. */
const ROLL_STEP = 0.2
const ROLL_MOST = 6
/** A grenade that strikes something keeps going this far the way it flew, unless the ground ahead rises. */
const SKID = 1.2

export interface GroundPoint {
  readonly x: number
  readonly z: number
}

export interface GrenadeFlight {
  /** Where it leaves the hand. */
  readonly from: WorldPoint
  /** The arc as flown, from the hand to where it came down: x and z on the ground, y its height. */
  readonly path: readonly { readonly x: number; readonly y: number; readonly z: number }[]
  /** Where it was thrown at, brought within a man's reach. */
  readonly mark: GroundPoint
  /** The throw was longer than a man can throw: it falls at the most he can. */
  readonly short: boolean
  /** Where the arc struck the ground short of its mark, or null when it came down where it was thrown. */
  readonly struck: GroundPoint | null
  /** Where it came to rest, after rolling down any steep ground it fell on. */
  readonly rest: GroundPoint
  /** How far it rolled, in metres. */
  readonly rolled: number
}

/** A thrown ball's parabola from a hand onto a point on the ground. */
export interface Lob {
  /** How far it carries along the ground, in metres. */
  readonly span: number
  /** Its height, part of the way along the ground, in metres from the hand. */
  height(along: number): number
  /** The seconds it takes to carry so far along the ground: gravity sets the speed a curve like this is thrown at. */
  seconds(along: number): number
}

/** The lob from a hand onto the ground at a point: rising at the launch slope, or steeper onto higher ground. */
export function lob(from: WorldPoint, to: WorldPoint): Lob {
  const span = Math.max(Math.hypot(to.x - from.x, to.z - from.z), 0.01)
  const launch = Math.max(LAUNCH, (to.y - from.y) / span + 0.3)
  const fall = (from.y - to.y + span * launch) / (span * span)
  const speed = Math.sqrt(GRAVITY / (2 * fall))
  return {
    span,
    height: (along) => from.y + along * launch - fall * along * along,
    seconds: (along) => along / speed
  }
}

/** The ground's slope at a point, as rise over run, and which way is downhill. */
function slopeAt(map: BattlefieldMap, x: number, z: number): { steepness: number; downX: number; downZ: number } {
  const half = 0.5
  const gradientX = (heightAt(map, x + half, z) - heightAt(map, x - half, z)) / (2 * half)
  const gradientZ = (heightAt(map, x, z + half) - heightAt(map, x, z - half)) / (2 * half)
  const steepness = Math.hypot(gradientX, gradientZ)
  return steepness > 0
    ? { steepness, downX: -gradientX / steepness, downZ: -gradientZ / steepness }
    : { steepness: 0, downX: 0, downZ: 0 }
}

/** Where a grenade that came down at a point comes to rest: down steep ground until it eases off or bottoms out. */
function roll(map: BattlefieldMap, x: number, z: number, steep: number): { rest: GroundPoint; rolled: number } {
  let atX = x
  let atZ = z
  let rolled = 0
  if (slopeAt(map, atX, atZ).steepness < steep) {
    return { rest: { x, z }, rolled: 0 }
  }
  const width = mapWidth(map)
  const depth = mapDepth(map)
  while (rolled < ROLL_MOST) {
    const { steepness, downX, downZ } = slopeAt(map, atX, atZ)
    if (steepness <= SETTLED) {
      break
    }
    const nextX = Math.min(width, Math.max(0, atX + downX * ROLL_STEP))
    const nextZ = Math.min(depth, Math.max(0, atZ + downZ * ROLL_STEP))
    // In a hollow, or against the map's edge: it stops.
    if (heightAt(map, nextX, nextZ) >= heightAt(map, atX, atZ)) {
      break
    }
    atX = nextX
    atZ = nextZ
    rolled += ROLL_STEP
  }
  return { rest: { x: atX, z: atZ }, rolled }
}

/**
 * The flight of a grenade a soldier throws toward a ground point: up from his hand, over in an arc to the point (or
 * as far as he can throw toward it), down where the arc meets the ground, and rolling on from there if that ground is
 * steep.
 */
export function grenadeFlight(sim: Simulation, thrower: EntityId, x: number, z: number): GrenadeFlight {
  const { map } = sim
  const fromX = sim.soldiers.position.x[thrower]
  const fromZ = sim.soldiers.position.z[thrower]
  const toX = x - fromX
  const toZ = z - fromZ
  const asked = Math.hypot(toX, toZ)
  const stance = sim.soldiers.stance.value[thrower]
  const most = throwReach(sim, thrower)
  const short = asked > most
  const reach = short ? most / asked : 1
  const mark = { x: fromX + toX * reach, z: fromZ + toZ * reach }
  const length = asked * reach
  const hand = heightAt(map, fromX, fromZ) + handHeight(stance)
  // A thrown ball's parabola: rising from the hand at the launch slope and falling under gravity onto the mark.
  const arc = lob({ x: fromX, y: hand, z: fromZ }, { x: mark.x, y: heightAt(map, mark.x, mark.z), z: mark.z })
  const { span } = arc
  const at = (t: number): WorldPoint => ({
    x: fromX + (mark.x - fromX) * t,
    y: arc.height(span * t),
    z: fromZ + (mark.z - fromZ) * t
  })
  const below = (t: number) => {
    const point = at(t)
    return point.y < heightAt(map, point.x, point.z)
  }
  const steps = Math.max(1, Math.ceil(length / ARC_STEP))
  const from = at(0)
  const path = [from]
  let struck: GroundPoint | null = null
  for (let step = 1; step <= steps; step++) {
    const t = step / steps
    if (step < steps && below(t)) {
      // Struck the ground on the way: pin down where, between the last step in the air and this one.
      let low = (step - 1) / steps
      let high = t
      for (let halving = 0; halving < 8; halving++) {
        const middle = (low + high) / 2
        if (below(middle)) {
          high = middle
        } else {
          low = middle
        }
      }
      const hit = at(high)
      path.push(hit)
      struck = { x: hit.x, z: hit.z }
      break
    }
    path.push(at(t))
  }
  let down: GroundPoint = mark
  let skidded = 0
  if (struck) {
    // It keeps some way on: over a parapet's crest it tumbles on; against a wall rising ahead it stops dead.
    const headingX = (mark.x - fromX) / span
    const headingZ = (mark.z - fromZ) / span
    down = struck
    while (skidded < SKID) {
      const nextX = down.x + headingX * ROLL_STEP
      const nextZ = down.z + headingZ * ROLL_STEP
      if (heightAt(map, nextX, nextZ) > heightAt(map, down.x, down.z) + 0.05) {
        break
      }
      down = { x: nextX, z: nextZ }
      skidded += ROLL_STEP
    }
  }
  const { rest, rolled } = roll(map, down.x, down.z, struck ? STRUCK_STEEP : STEEP)
  return { from, path, mark, short, struck, rest, rolled: rolled + skidded }
}
