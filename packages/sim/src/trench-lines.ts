import { type BattlefieldMap, type Trench, TRENCH_PROFILE } from "@verdun/map"

/** Where a point lies against a trench's centre line: how far along it, how far off it, and on which side. */
export interface TrenchPlace {
  readonly trench: Trench
  /** Distance along the centre line from its first point, in metres. */
  readonly along: number
  /** The centre line's whole length, in metres. */
  readonly length: number
  /** Distance from the centre line, in metres. */
  readonly distance: number
  /** Whether the point lies on the side a fire trench faces: the fire step's side. */
  readonly inFront: boolean
}

/** A trench's centre line is looked for no further than this from a point, in metres: a trench's own width and lips. */
const REACH = 3

/** One straight stretch of a trench's centre line, and how far along the line it starts. */
interface Stretch {
  readonly ax: number
  readonly az: number
  readonly dx: number
  readonly dz: number
  readonly length: number
  readonly from: number
}

const stretchesOf = new WeakMap<Trench, readonly Stretch[]>()

/** A trench's centre line as its stretches of some length, worked out once. */
function stretches(trench: Trench): readonly Stretch[] {
  let cached = stretchesOf.get(trench)
  if (!cached) {
    const made: Stretch[] = []
    let from = 0
    trench.points.forEach(([bx, bz], index) => {
      const previous = index > 0 ? trench.points[index - 1] : undefined
      if (!previous) {
        return
      }
      const [ax, az] = previous
      const length = Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2)
      if (length > 0) {
        made.push({ ax, az, dx: (bx - ax) / length, dz: (bz - az) / length, length, from })
        from += length
      }
    })
    cached = made
    stretchesOf.set(trench, cached)
  }
  return cached
}

/** A trench's centre line's whole length, in metres. */
function lengthOf(all: readonly Stretch[]): number {
  const last = all[all.length - 1]
  return last ? last.from + last.length : 0
}

/** Where a point lies against one trench, or null for a trench with no length. */
export function placeOn(trench: Trench, x: number, z: number): TrenchPlace | null {
  const all = stretches(trench)
  const facingZ = trench.facing === "north" ? 1 : -1
  let best: TrenchPlace | null = null
  for (const stretch of all) {
    const t = Math.min(stretch.length, Math.max(0, (x - stretch.ax) * stretch.dx + (z - stretch.az) * stretch.dz))
    const cx = stretch.ax + stretch.dx * t
    const cz = stretch.az + stretch.dz * t
    const distance = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2)
    if (!best || distance < best.distance) {
      best = {
        trench,
        along: stretch.from + t,
        length: lengthOf(all),
        distance,
        // As the trench was dug (trenches.ts): in front where the point lies further the way it faces.
        inFront: trench.kind === "fire" && (z - cz) * facingZ > 0
      }
    }
  }
  return best
}

/** The trench whose centre line runs nearest a point, within a trench's reach of it, or null. */
export function nearestTrench(map: BattlefieldMap, x: number, z: number): TrenchPlace | null {
  let best: TrenchPlace | null = null
  for (const trench of map.trenches) {
    const place = placeOn(trench, x, z)
    if (place && place.distance <= REACH && (!best || place.distance < best.distance)) {
      best = place
    }
  }
  return best
}

/**
 * The point `along` metres down a trench's centre line (clamped to its ends), and the way across it toward the side a
 * fire trench faces (a unit vector, or zero for a communication trench, or a stretch running straight toward the enemy).
 * A trench with no length gives its first point.
 */
export function pointAlong(trench: Trench, along: number): { x: number; z: number; frontX: number; frontZ: number } {
  const all = stretches(trench)
  const wanted = Math.min(lengthOf(all), Math.max(0, along))
  const stretch = all.find((each) => wanted <= each.from + each.length) ?? all[all.length - 1]
  if (!stretch) {
    const [x, z] = trench.points[0] ?? [0, 0]
    return { x, z, frontX: 0, frontZ: 0 }
  }
  const t = Math.min(stretch.length, wanted - stretch.from)
  // Across the stretch, turned to the side a fire trench faces.
  const toward = trench.kind === "fire" ? Math.sign(stretch.dx * (trench.facing === "north" ? 1 : -1)) : 0
  return {
    x: stretch.ax + stretch.dx * t,
    z: stretch.az + stretch.dz * t,
    frontX: -stretch.dz * toward,
    frontZ: stretch.dx * toward
  }
}

/** The middle of a fire trench's fire step, in metres in front of its centre line. */
export const FIRE_STEP_MIDDLE = (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2

/** Whether a place against a trench is up on its fire step. */
export function onFireStep(place: TrenchPlace): boolean {
  return (
    place.inFront &&
    place.distance > TRENCH_PROFILE.floorHalfWidth &&
    place.distance <= TRENCH_PROFILE.fireStepOuter + 0.2
  )
}
