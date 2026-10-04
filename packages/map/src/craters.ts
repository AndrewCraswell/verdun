import { type BattlefieldMap, sampleIndex, Surface } from "./format.ts"
import { latticeValue } from "./noise.ts"

/** A shell crater: a bowl with a raised lip of thrown-out earth. */
export interface Crater {
  readonly x: number
  readonly z: number
  /** Radius of the bowl, in metres. The lip extends half as far again. */
  readonly radius: number
  /** Depth of the bowl at its centre, in metres. */
  readonly depth: number
}

/** World-space rectangle of ground a change touched, for rebuilding terrain meshes and colliders. */
export interface ChangedArea {
  readonly minX: number
  readonly minZ: number
  readonly maxX: number
  readonly maxZ: number
}

/** The lip reaches this many bowl radii from the centre. */
const LIP_EXTENT = 1.5
/** Lip height as a fraction of the bowl's depth. */
const LIP_HEIGHT = 0.3
/** How far a crater's edge wanders in and out of a circle, as a share of its radius. */
const RAGGEDNESS = 0.14
const SHAPE_SEED = 4_211

/**
 * A crater's outline and its spoil, by direction: no shell hole is a circle, and a shell coming in at an angle throws
 * most of its earth forward. Waves of a few lobes in angle, their phases fixed by where the crater is, so the same
 * crater always comes out the same (the simulation stamps them too).
 */
function craterShape(crater: Crater): { edge(angle: number): number; spoil(angle: number): number } {
  const key = (salt: number) => latticeValue(SHAPE_SEED + salt, Math.round(crater.x * 8), Math.round(crater.z * 8))
  const lobes = [2, 3, 5].map((count, index) => ({
    count,
    phase: key(index) * Math.PI * 2,
    weight: [0.5, 0.32, 0.18][index] ?? 0
  }))
  const throwDirection = key(7) * Math.PI * 2
  const throwStrength = 0.3 + key(8) * 0.5
  return {
    edge: (angle) =>
      1 + RAGGEDNESS * lobes.reduce((sum, lobe) => sum + lobe.weight * Math.sin(lobe.count * angle + lobe.phase), 0),
    spoil: (angle) =>
      Math.max(0.25, 1 - throwStrength + throwStrength * 2 * Math.max(0, Math.cos(angle - throwDirection)))
  }
}

/**
 * Blasts a crater into the ground: a parabolic bowl with a ragged edge, a lip of spoil thrown mostly one way, and
 * churned earth. Craters stack: a new one in an old crater digs deeper, so a sector under weeks of shelling ends up as
 * the moonscape Verdun became. Returns the area that changed.
 */
export function stampCrater(map: BattlefieldMap, crater: Crater): ChangedArea {
  const shape = craterShape(crater)
  const reach = crater.radius * LIP_EXTENT * (1 + RAGGEDNESS)
  const minColumn = Math.max(0, Math.floor((crater.x - reach) / map.cellSize))
  const maxColumn = Math.min(map.columns, Math.ceil((crater.x + reach) / map.cellSize))
  const minRow = Math.max(0, Math.floor((crater.z - reach) / map.cellSize))
  const maxRow = Math.min(map.rows, Math.ceil((crater.z + reach) / map.cellSize))

  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      const dx = column * map.cellSize - crater.x
      const dz = row * map.cellSize - crater.z
      const angle = Math.atan2(dz, dx)
      const distance = Math.hypot(dx, dz) / (crater.radius * shape.edge(angle))
      if (distance > LIP_EXTENT) {
        continue
      }
      const index = sampleIndex(map, column, row)
      if (distance < 1) {
        map.heights[index] -= crater.depth * (1 - distance * distance)
      } else {
        map.heights[index] += crater.depth * LIP_HEIGHT * shape.spoil(angle) * (1 - (distance - 1) / (LIP_EXTENT - 1))
      }
      map.surfaces[index] = Surface.Churned
    }
  }
  return {
    minX: minColumn * map.cellSize,
    minZ: minRow * map.cellSize,
    maxX: maxColumn * map.cellSize,
    maxZ: maxRow * map.cellSize
  }
}

/**
 * Lets the ground slump where it stands steeper than `talus` (rise over run) inside the given areas: fresh crater walls
 * and lips settle, as loose earth does after a bombardment, and no wall stands vertical. A few passes move earth from
 * each too-steep sample to its lower neighbours.
 */
export function slumpGround(map: BattlefieldMap, areas: readonly ChangedArea[], talus = 1, passes = 3): void {
  const mask = new Uint8Array((map.columns + 1) * (map.rows + 1))
  for (const area of areas) {
    const minColumn = Math.max(1, Math.floor(area.minX / map.cellSize))
    const maxColumn = Math.min(map.columns - 1, Math.ceil(area.maxX / map.cellSize))
    const minRow = Math.max(1, Math.floor(area.minZ / map.cellSize))
    const maxRow = Math.min(map.rows - 1, Math.ceil(area.maxZ / map.cellSize))
    for (let row = minRow; row <= maxRow; row++) {
      mask.fill(1, sampleIndex(map, minColumn, row), sampleIndex(map, maxColumn, row) + 1)
    }
  }
  const limit = talus * map.cellSize
  const stride = map.columns + 1
  const neighbours = [-1, 1, -stride, stride]
  for (let pass = 0; pass < passes; pass++) {
    for (let index = 0; index < mask.length; index++) {
      if (mask[index] === 0) {
        continue
      }
      const here = map.heights[index] ?? 0
      for (const offset of neighbours) {
        const there = map.heights[index + offset] ?? here
        const excess = here - there - limit
        if (excess > 0) {
          // Half the excess slides down: enough to settle in a few passes without overshooting.
          const moved = excess * 0.25
          map.heights[index] = (map.heights[index] ?? 0) - moved
          map.heights[index + offset] = there + moved
        }
      }
    }
  }
}

/** The smallest area covering both, or the other when one is null. */
export function mergeAreas(a: ChangedArea | null, b: ChangedArea): ChangedArea {
  if (!a) {
    return b
  }
  return {
    minX: Math.min(a.minX, b.minX),
    minZ: Math.min(a.minZ, b.minZ),
    maxX: Math.max(a.maxX, b.maxX),
    maxZ: Math.max(a.maxZ, b.maxZ)
  }
}
