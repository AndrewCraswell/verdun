import { type BattlefieldMap, heightAt } from "@verdun/map"

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
export const TARGET_CLEARANCE = 0.1

/**
 * Sight lines over the battlefield. The simulation's own are physics ray casts (physics-sight.ts, imported apart as
 * "@verdun/sim/physics", so a page that never steps the simulation needn't load the physics); others may answer the
 * same questions more lightly.
 */
export interface LineOfSight {
  /** True when no terrain, and no scenery standing high enough, lies between two points. */
  isClear(from: WorldPoint, to: WorldPoint): boolean
  /**
   * Rebuilds the terrain collider after the map's heights changed inside a world-space rectangle. Returns how many
   * colliders were rebuilt: 1, or 0 when the rectangle misses the map.
   */
  rebuildRegion(minX: number, minZ: number, maxX: number, maxZ: number): number
  /**
   * Sets how high a piece of the map's scenery (by its index in `map.scenery`) now stands, as when shellfire brings a
   * ruin's walls down; 0 clears it from sight altogether.
   */
  setSightHeight(index: number, height: number): void
  dispose(): void
}

/** Where a soldier standing at a ground position sees from. */
export function eyeAt(map: BattlefieldMap, x: number, z: number): WorldPoint {
  return { x, y: heightAt(map, x, z) + EYE_HEIGHT, z }
}
