import RAPIER from "@dimforge/rapier3d-compat"
import { type BattlefieldMap, heightAt, sampleIndex } from "@verdun/map"

/** A point in the world, in metres: `y` is up. */
export interface WorldPoint {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** A standing soldier's eye height above the ground under their feet, in metres. */
export const EYE_HEIGHT = 1.65

/**
 * Sight lines stop this short of their target, so a target lying on the ground isn't hidden by the ground under it.
 */
const TARGET_CLEARANCE = 0.1

export interface LineOfSight {
  /** True when no terrain lies between two points. */
  isClear(from: WorldPoint, to: WorldPoint): boolean
  /**
   * Rebuilds the terrain collider after the map's heights changed inside a world-space rectangle. Returns how many
   * colliders were rebuilt: 1, or 0 when the rectangle misses the map.
   */
  rebuildRegion(minX: number, minZ: number, maxX: number, maxZ: number): number
  dispose(): void
}

let rapierReady: Promise<void> | undefined

/** Rapier is WebAssembly and must initialise once before any world is created. */
function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init()
  return rapierReady
}

/**
 * Builds a Rapier heightfield for the whole map. Rapier's heightfield is centred on its collider, with rows along z and
 * columns along x, stored column by column.
 *
 * One heightfield covers the map rather than one per render chunk: with Rapier 0.21, rays entering a chunked
 * heightfield through its side sometimes missed the ground entirely (found and tested at M2).
 */
function heightfieldDesc(map: BattlefieldMap): RAPIER.ColliderDesc {
  const { rows, columns } = map
  const heights = new Float32Array((rows + 1) * (columns + 1))
  for (let column = 0; column <= columns; column++) {
    for (let row = 0; row <= rows; row++) {
      heights[column * (rows + 1) + row] = map.heights[sampleIndex(map, column, row)]
    }
  }
  const width = columns * map.cellSize
  const depth = rows * map.cellSize
  return RAPIER.ColliderDesc.heightfield(rows, columns, heights, { x: width, y: 1, z: depth }).setTranslation(
    width / 2,
    0,
    depth / 2
  )
}

/**
 * Line of sight against the terrain, as Rapier ray casts against static heightfield colliders. Soldiers aren't physics
 * bodies, so only the ground (and later, objects and smoke) block sight.
 */
export async function createLineOfSight(map: BattlefieldMap): Promise<LineOfSight> {
  await initRapier()
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  let terrain = world.createCollider(heightfieldDesc(map))
  // Scene queries only see colliders after a step. Nothing moves, so the step does no other work.
  world.step()

  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })

  return {
    isClear(from, to) {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const dz = to.z - from.z
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (distance <= TARGET_CLEARANCE) {
        return true
      }
      ray.origin = from
      ray.dir = { x: dx / distance, y: dy / distance, z: dz / distance }
      return world.castRay(ray, distance - TARGET_CLEARANCE, true) === null
    },
    rebuildRegion(minX, minZ, maxX, maxZ) {
      const touchesMap = maxX >= 0 && maxZ >= 0 && minX <= map.columns * map.cellSize && minZ <= map.rows * map.cellSize
      if (!touchesMap) {
        return 0
      }
      world.removeCollider(terrain, false)
      terrain = world.createCollider(heightfieldDesc(map))
      world.step()
      return 1
    },
    dispose() {
      world.free()
    }
  }
}

/** Where a soldier standing at a ground position sees from. */
export function eyeAt(map: BattlefieldMap, x: number, z: number): WorldPoint {
  return { x, y: heightAt(map, x, z) + EYE_HEIGHT, z }
}
