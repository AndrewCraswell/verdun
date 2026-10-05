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

/** Each trench's distance along its centre line at each of its points. */
const lengthsOf = new WeakMap<Trench, Float64Array>()

function cumulative(trench: Trench): Float64Array {
  let lengths = lengthsOf.get(trench)
  if (!lengths) {
    lengths = new Float64Array(trench.points.length)
    for (let index = 1; index < trench.points.length; index++) {
      const [ax, az] = trench.points[index - 1] ?? [0, 0]
      const [bx, bz] = trench.points[index] ?? [0, 0]
      lengths[index] = (lengths[index - 1] ?? 0) + Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2)
    }
    lengthsOf.set(trench, lengths)
  }
  return lengths
}

/** Where a point lies against one trench, or null for a trench with no length. */
export function placeOn(trench: Trench, x: number, z: number): TrenchPlace | null {
  const lengths = cumulative(trench)
  const facingZ = trench.facing === "north" ? 1 : -1
  let best: TrenchPlace | null = null
  for (let index = 1; index < trench.points.length; index++) {
    const [ax, az] = trench.points[index - 1] ?? [0, 0]
    const [bx, bz] = trench.points[index] ?? [0, 0]
    const dx = bx - ax
    const dz = bz - az
    const lengthSquared = dx * dx + dz * dz
    if (lengthSquared === 0) {
      continue
    }
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / lengthSquared))
    const cx = ax + dx * t
    const cz = az + dz * t
    const distance = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2)
    if (!best || distance < best.distance) {
      best = {
        trench,
        along: (lengths[index - 1] ?? 0) + Math.sqrt(lengthSquared) * t,
        length: lengths[lengths.length - 1] ?? 0,
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
 */
export function pointAlong(trench: Trench, along: number): { x: number; z: number; frontX: number; frontZ: number } {
  const lengths = cumulative(trench)
  const total = lengths[lengths.length - 1] ?? 0
  const wanted = Math.min(total, Math.max(0, along))
  let index = 1
  while (index < trench.points.length - 1 && (lengths[index] ?? 0) < wanted) {
    index++
  }
  const [ax, az] = trench.points[index - 1] ?? [0, 0]
  const [bx, bz] = trench.points[index] ?? [0, 0]
  const from = lengths[index - 1] ?? 0
  const span = (lengths[index] ?? 0) - from
  const t = span > 0 ? (wanted - from) / span : 0
  const dx = bx - ax
  const dz = bz - az
  const length = Math.sqrt(dx * dx + dz * dz)
  let frontX = 0
  let frontZ = 0
  if (trench.kind === "fire" && length > 0) {
    const facingZ = trench.facing === "north" ? 1 : -1
    // Across the stretch, turned to the side it faces.
    const across = dx / length
    frontX = (-dz / length) * Math.sign(across * facingZ)
    frontZ = across * Math.sign(across * facingZ)
  }
  return { x: ax + dx * t, z: az + dz * t, frontX, frontZ }
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
