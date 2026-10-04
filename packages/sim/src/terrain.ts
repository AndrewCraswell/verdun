import { type BattlefieldMap, heightAt, sampleIndex, Surface } from "@verdun/map"
import { isInTrench } from "./stance.ts"

/**
 * Walking pace on each surface, as a fraction of pace on firm ground. Verdun's mud and shell-churned ground were
 * notorious: men took hours to cross a few hundred metres of crater field at night, sinking to the knee. By day, at a
 * dash, the surface and the crater lips (see `UPHILL_COST`) together leave a man about half his pace on firm ground.
 * Rain makes it worse (ground.ts).
 */
const SURFACE_PACE: Readonly<Record<Surface, number>> = {
  [Surface.Grass]: 1,
  [Surface.Chalk]: 0.95,
  [Surface.Mud]: 0.65,
  [Surface.Churned]: 0.55
}
/** Duckboards on a trench floor keep men out of the mud. */
const TRENCH_PACE = 0.9
/** How far ahead the ground is probed for slope, in metres. */
const SLOPE_PROBE = 0.6
/** Each unit of uphill grade costs this much: a 1-in-1 slope a third of pace; a trench wall is a scramble. */
const UPHILL_COST = 2.2
/** Steep drops slow men too (jumping down into a trench, sliding into a shell hole), but less. */
const DOWNHILL_COST = 0.8
/** Grades gentler than this downhill cost nothing. */
const EASY_DOWNHILL = 0.3
/** Never slower than this fraction: even a sheer wall gets climbed eventually. */
const SLOWEST = 0.08
/**
 * Grades steeper than this (45 degrees) aren't walked up but scrambled: hands on the sandbags or the crater lip, a knee
 * up, kit and all. A scramble goes up at `CLIMB_RATE` however steep the wall, so what it costs is its height.
 */
const SCRAMBLE_GRADE = 1
/**
 * Metres a second a soldier with 30 kg of kit climbs a wall: a 1 m step onto the fire step in under two seconds, out
 * over a parapet from the step in about two, and up from the floor of a trench in about four. Mud makes it slower.
 */
const CLIMB_RATE = 0.6

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
  const slope = 1 / slopeCost(Math.min(SCRAMBLE_GRADE, gradeAhead(map, x, z, directionX, directionZ)))
  return Math.max(SLOWEST, surface * slope)
}

function gradeAhead(map: BattlefieldMap, x: number, z: number, directionX: number, directionZ: number): number {
  return (heightAt(map, x + directionX * SLOPE_PROBE, z + directionZ * SLOPE_PROBE) - heightAt(map, x, z)) / SLOPE_PROBE
}

/**
 * The fastest a soldier can cross the ground ahead, in metres a second, when it rises as a wall: climbing, at
 * `CLIMB_RATE` straight up, slower in mud. Running doesn't help. Infinity where the ground is gentle enough to walk.
 */
export function climbLimit(map: BattlefieldMap, x: number, z: number, directionX: number, directionZ: number): number {
  const grade = gradeAhead(map, x, z, directionX, directionZ)
  return grade > SCRAMBLE_GRADE ? (CLIMB_RATE * surfacePace(map, x, z)) / grade : Infinity
}
