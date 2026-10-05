import RAPIER from "@dimforge/rapier3d-compat"
import { type BattlefieldMap, heightAt, sampleIndex } from "@verdun/map"
import { type LineOfSight, TARGET_CLEARANCE } from "./line-of-sight.ts"
import { type SightBlock, sightBlocks } from "./sight-shapes.ts"

/** Scenery colliders reach this far below the ground, so none floats clear of a slope. */
const SCENERY_FOOTING = 0.5

/** A sight-blocking shape as a collider, from below the ground under it up to its height. */
function blockDesc(map: BattlefieldMap, block: SightBlock): RAPIER.ColliderDesc {
  const halfHeight = (block.height + SCENERY_FOOTING) / 2
  const y = heightAt(map, block.x, block.z) - SCENERY_FOOTING + halfHeight
  if (block.kind === "cylinder") {
    return RAPIER.ColliderDesc.cylinder(halfHeight, block.radius).setTranslation(block.x, y, block.z)
  }
  // A turn about the vertical, taking the box's along axis (local z) to (sin yaw, cos yaw), as scenery headings do.
  return RAPIER.ColliderDesc.cuboid(block.halfAcross, halfHeight, block.halfAlong)
    .setTranslation(block.x, y, block.z)
    .setRotation({ w: Math.cos(block.yaw / 2), x: 0, y: Math.sin(block.yaw / 2), z: 0 })
}

/** A piece of scenery's colliders, as it stands or knocked down to a height. */
function sceneryColliders(world: RAPIER.World, map: BattlefieldMap, index: number, height?: number): RAPIER.Collider[] {
  const item = map.scenery[index]
  return item ? sightBlocks(item, height).map((block) => world.createCollider(blockDesc(map, block))) : []
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
 * Line of sight against the terrain and what stands on it, as Rapier ray casts against static colliders: a heightfield
 * for the ground, and for scenery the shapes of its art (see sight-shapes.ts): boxes for houses, walls and wrecks,
 * cylinders for trees and smaller things. Soldiers aren't physics bodies, so they don't block sight.
 */
export async function createLineOfSight(map: BattlefieldMap): Promise<LineOfSight> {
  await initRapier()
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 })
  let terrain = world.createCollider(heightfieldDesc(map))
  const scenery = map.scenery.map((_, index) => sceneryColliders(world, map, index))
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
    setSightHeight(index, height) {
      for (const collider of scenery[index] ?? []) {
        world.removeCollider(collider, false)
      }
      scenery[index] = sceneryColliders(world, map, index, height)
      world.step()
    },
    dispose() {
      world.free()
    }
  }
}
