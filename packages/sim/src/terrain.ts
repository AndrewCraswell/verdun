import { type BattlefieldMap, heightAt, sampleIndex, Surface } from "@verdun/map"
import { isInTrench } from "./stance.ts"

/**
 * Walking pace on each surface, as a fraction of pace on firm ground. Verdun's mud and shell-churned ground were
 * notorious: men took hours to cross a few hundred metres of crater field at night, sinking to the knee.
 */
const SURFACE_PACE: Readonly<Record<Surface, number>> = {
  [Surface.Grass]: 1,
  [Surface.Chalk]: 0.95,
  [Surface.Mud]: 0.6,
  [Surface.Churned]: 0.5
}
/** Duckboards on a trench floor keep men out of the mud. */
const TRENCH_PACE = 0.9
/** How far ahead the ground is probed for slope, in metres. */
const SLOPE_PROBE = 0.6
/** Each unit of uphill grade costs this much: a 1-in-1 slope halves pace or worse; a trench wall is a scramble. */
const UPHILL_COST = 2.5
/** Steep drops slow men too (jumping down into a trench, sliding into a shell hole), but less. */
const DOWNHILL_COST = 0.8
/** Grades gentler than this downhill cost nothing. */
const EASY_DOWNHILL = 0.3
/** Never slower than this fraction: even a sheer wall gets climbed eventually. */
const SLOWEST = 0.08

/** The surface at a point: the nearest sample's. */
export function surfaceAt(map: BattlefieldMap, x: number, z: number): Surface {
  const column = Math.min(map.columns, Math.max(0, Math.round(x / map.cellSize)))
  const row = Math.min(map.rows, Math.max(0, Math.round(z / map.cellSize)))
  const value = map.surfaces[sampleIndex(map, column, row)]
  return value === Surface.Mud || value === Surface.Chalk || value === Surface.Churned ? value : Surface.Grass
}

/** Walking pace on the ground at a point, as a fraction of firm ground, before any slope: duckboards or the surface. */
export function surfacePace(map: BattlefieldMap, x: number, z: number): number {
  return isInTrench(map, x, z) ? TRENCH_PACE : SURFACE_PACE[surfaceAt(map, x, z)]
}

/** How much a grade costs to walk, as a multiple of the time on the flat: uphill is dear, steep downhill a little. */
export function slopeCost(grade: number): number {
  return grade > 0 ? 1 + UPHILL_COST * grade : 1 + DOWNHILL_COST * Math.max(0, -grade - EASY_DOWNHILL)
}

/**
 * How fast the ground lets a soldier walk from a point in a direction (a unit vector), as a fraction of their walking
 * pace: the surface underfoot, and the slope ahead.
 */
export function groundPace(map: BattlefieldMap, x: number, z: number, directionX: number, directionZ: number): number {
  const surface = surfacePace(map, x, z)
  const grade =
    (heightAt(map, x + directionX * SLOPE_PROBE, z + directionZ * SLOPE_PROBE) - heightAt(map, x, z)) / SLOPE_PROBE
  const slope = 1 / slopeCost(grade)
  return Math.max(SLOWEST, surface * slope)
}
