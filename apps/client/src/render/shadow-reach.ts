import type { Plane } from "@babylonjs/core/Maths/math.plane"
import type { Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { DeepImmutable } from "@babylonjs/core/types"

/** Whether shadow passes leave out casters whose shadows can't be seen: off, for measuring (pnpm perf --ab). */
export const shadowCasterCulling = { enabled: true }

/** The bounds of a caster and its shadow, gathered corner by corner, reused: a test allocates nothing. */
const low = { x: 0, y: 0, z: 0 }
const high = { x: 0, y: 0, z: 0 }

function take(x: number, y: number, z: number): void {
  low.x = Math.min(low.x, x)
  low.y = Math.min(low.y, y)
  low.z = Math.min(low.z, z)
  high.x = Math.max(high.x, x)
  high.y = Math.max(high.y, y)
  high.z = Math.max(high.z, z)
}

/** Whether a box touches the view: outside it only if wholly behind one of its planes. */
function boxInView(view: readonly DeepImmutable<Plane>[]): boolean {
  for (const plane of view) {
    const { normal, d } = plane
    // The corner furthest along the plane's normal: if even that is behind it, the whole box is.
    const x = normal.x >= 0 ? high.x : low.x
    const y = normal.y >= 0 ? high.y : low.y
    const z = normal.z >= 0 ? high.z : low.z
    if (normal.x * x + normal.y * y + normal.z * z + d < 0) {
      return false
    }
  }
  return true
}

/**
 * Whether anything of a caster's shadow can fall within the camera's view (its planes, `view`): the caster's bounds and
 * where the light through each of their corners meets the ground no lower than `floor`, the lowest the ground can be,
 * hold every shadow it casts. `project` puts a corner down on the floor, or returns false where it can't be bounded,
 * and then the caster is kept.
 */
function shadowInView(
  min: DeepImmutable<Vector3>,
  max: DeepImmutable<Vector3>,
  view: readonly DeepImmutable<Plane>[],
  project: (x: number, y: number, z: number) => boolean
): boolean {
  low.x = min.x
  low.y = min.y
  low.z = min.z
  high.x = max.x
  high.y = max.y
  high.z = max.z
  for (let corner = 0; corner < 8; corner++) {
    const x = corner & 1 ? max.x : min.x
    const y = corner & 2 ? max.y : min.y
    const z = corner & 4 ? max.z : min.z
    if (!project(x, y, z)) {
      return true
    }
  }
  return boxInView(view)
}

/**
 * Whether a caster's shadow from the sun, its light going `way`, can fall within the camera's view: the shadow-caster
 * culling of a game engine, which Babylon's shadow passes don't do. A shadow pass takes in everything in the light's
 * view of a slice of the camera's, a box much wider than the camera's own view: casters to its sides shade only ground
 * nobody sees.
 */
export function sunShadowInView(
  min: DeepImmutable<Vector3>,
  max: DeepImmutable<Vector3>,
  way: DeepImmutable<Vector3>,
  floor: number,
  view: readonly DeepImmutable<Plane>[]
): boolean {
  const length = Math.hypot(way.x, way.y, way.z)
  const down = length > 0 ? -way.y / length : 0
  if (down <= 0) {
    return true
  }
  return shadowInView(min, max, view, (x, y, z) => {
    const along = Math.max(0, y - floor) / down
    take(x + (way.x / length) * along, y - down * along, z + (way.z / length) * along)
    return true
  })
}

/** The lowest the ground can be: the map's lowest height, less what shellfire can dig out of it. */
export function lowestGround(heights: ArrayLike<number>, dug = 5): number {
  let lowest = Number.POSITIVE_INFINITY
  for (let index = 0; index < heights.length; index++) {
    lowest = Math.min(lowest, heights[index] ?? lowest)
  }
  return (Number.isFinite(lowest) ? lowest : 0) - dug
}
