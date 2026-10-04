import { type BattlefieldMap, sampleIndex, Surface } from "./format.ts"

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

/**
 * Blasts a crater into the ground: a parabolic bowl, a lip of spoil around it, and churned earth. Craters stack: a new
 * one in an old crater digs deeper, so a sector under weeks of shelling ends up as the moonscape Verdun became. Returns
 * the area that changed.
 */
export function stampCrater(map: BattlefieldMap, crater: Crater): ChangedArea {
  const reach = crater.radius * LIP_EXTENT
  const minColumn = Math.max(0, Math.floor((crater.x - reach) / map.cellSize))
  const maxColumn = Math.min(map.columns, Math.ceil((crater.x + reach) / map.cellSize))
  const minRow = Math.max(0, Math.floor((crater.z - reach) / map.cellSize))
  const maxRow = Math.min(map.rows, Math.ceil((crater.z + reach) / map.cellSize))

  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      const distance = Math.hypot(column * map.cellSize - crater.x, row * map.cellSize - crater.z) / crater.radius
      if (distance > LIP_EXTENT) {
        continue
      }
      const index = sampleIndex(map, column, row)
      if (distance < 1) {
        map.heights[index] -= crater.depth * (1 - distance * distance)
      } else {
        map.heights[index] += crater.depth * LIP_HEIGHT * (1 - (distance - 1) / (LIP_EXTENT - 1))
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
