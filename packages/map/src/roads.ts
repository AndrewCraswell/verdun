import type { BattlefieldMap } from "./format.ts"
import { heightAt } from "./sampling.ts"
import { type Debus, footprintRadius, type Road, type RoadSide, SCENERY_FOOTPRINTS } from "./scenery.ts"
import { lineZ } from "./sector-file.ts"
import type { GroundPoint } from "./trenches.ts"

/** Where each side's roads stop being drivable: the z beyond which, toward the enemy, they are shelled to nothing. */
export interface RearRoadLimits {
  readonly french: number
  readonly german: number
}

/**
 * Cuts roads where they cross each side's rear limit, so each piece lies wholly behind one side's lines, serving its
 * lorries, or between them, serving no one. The French rear lies toward -z when `frenchTowardEnemy` is 1.
 */
export function roadsBehindLines(
  lines: readonly (readonly GroundPoint[])[],
  limits: RearRoadLimits,
  frenchTowardEnemy: 1 | -1
): Road[] {
  const behind = (z: number): RoadSide | null => {
    if (frenchTowardEnemy * (limits.french - z) > 0) {
      return "french"
    }
    return -frenchTowardEnemy * (limits.german - z) > 0 ? "german" : null
  }
  const roads: Road[] = []
  for (const line of lines) {
    const [first] = line
    if (!first) {
      continue
    }
    let points: GroundPoint[] = [first]
    const cutAt = (point: GroundPoint) => {
      points.push(point)
      const [a, b] = points
      if (a && b) {
        roads.push({ points, behind: behind((a[1] + b[1]) / 2) })
      }
      points = [point]
    }
    for (let index = 1; index < line.length; index++) {
      const [ax, az] = line[index - 1] ?? first
      const [bx, bz] = line[index] ?? first
      const crossings = [limits.french, limits.german]
        .filter((limit) => (az - limit) * (bz - limit) < 0)
        .map((limit) => (limit - az) / (bz - az))
        .sort((p, q) => p - q)
      for (const t of crossings) {
        cutAt([ax + (bx - ax) * t, az + (bz - az) * t])
      }
      points.push([bx, bz])
    }
    if (points.length >= 2) {
      cutAt(points.pop() ?? first)
    }
  }
  return roads
}

/** A side's trench lines, for finding where its lorries can stop unseen. */
export interface SideLines {
  readonly side: RoadSide
  readonly towardEnemy: 1 | -1
  readonly front: readonly GroundPoint[]
  /** Every line the side's men watch from: front, support and reserve. */
  readonly lines: readonly (readonly GroundPoint[])[]
}

/** The top of a lorry's canvas tilt, in metres above the road: no enemy eye may see it where it stops. */
const LORRY_HEIGHT = 2.6
/** A lorry is this long: its ends must be out of sight as well as its middle. */
const LORRY_LENGTH = 6
/** An eye in a fire trench, looking over the parapet, stands this far above the ground at the trench. */
const EYE_HEIGHT = 1.2
/** Lorries stop at least this far behind their own front line. */
const BEHIND_FRONT = 60
/** Stops are tried a lorry's length apart along the roads, and the enemy's lines are watched from eyes 20 m apart. */
const STEP = { road: LORRY_LENGTH, eyes: 20, sight: 2 } as const

/**
 * Where a side's lorries set down its men: the spot on its own roads nearest its front line, at least 60 m behind it,
 * where no eye along any of the enemy's trench lines sees any part of a lorry over the ground or what stands on it.
 * `avoid` rules out places a lorry can't stop, such as a bridge over a trench. Null when nowhere on its roads is hidden.
 */
export function findDebus(
  map: BattlefieldMap,
  roads: readonly Road[],
  own: SideLines,
  enemy: SideLines,
  avoid: (x: number, z: number) => boolean
): Debus | null {
  const width = map.columns * map.cellSize
  const depth = map.rows * map.cellSize
  const tops = sceneryTops(map, width, depth)
  const standing = (x: number, z: number) =>
    Math.max(heightAt(map, x, z), tops[Math.round(z) * (Math.ceil(width) + 1) + Math.round(x)] ?? 0)
  const eyes: { x: number; z: number; y: number }[] = []
  for (const line of enemy.lines) {
    for (let x = 0; x <= width; x += STEP.eyes) {
      const z = lineZ(line, x)
      eyes.push({ x, z, y: heightAt(map, x, z) + EYE_HEIGHT })
    }
  }
  const sees = (eye: { x: number; z: number; y: number }, x: number, z: number) => {
    const aim = heightAt(map, x, z) + LORRY_HEIGHT
    const distance = Math.hypot(x - eye.x, z - eye.z)
    for (let along = 3; along < distance; along += STEP.sight) {
      const t = along / distance
      if (standing(eye.x + (x - eye.x) * t, eye.z + (z - eye.z) * t) > eye.y + (aim - eye.y) * t) {
        return false
      }
    }
    return true
  }
  /** How many of the enemy's eyes see some part of a lorry stopped with its ends at `ends`, counting no further than `cap`. */
  const exposure = (ends: readonly GroundPoint[], cap: number) => {
    let count = 0
    for (const eye of eyes) {
      if (count >= cap) {
        break
      }
      if (ends.some(([x, z]) => sees(eye, x, z))) {
        count += 1
      }
    }
    return count
  }
  const stops: { x: number; z: number; heading: number; behind: number; ends: GroundPoint[] }[] = []
  for (const road of roads.filter((candidate) => candidate.behind === own.side)) {
    for (let index = 1; index < road.points.length; index++) {
      const [ax, az] = road.points[index - 1] ?? [0, 0]
      const [bx, bz] = road.points[index] ?? [0, 0]
      const length = Math.hypot(bx - ax, bz - az)
      if (!(length > 0)) {
        continue
      }
      // Facing along the road toward the front, or as it was drawn where it runs along the lines.
      const toward = own.towardEnemy * (bz - az) < 0 ? -1 : 1
      const dx = ((bx - ax) / length) * toward
      const dz = ((bz - az) / length) * toward
      for (let along = 0; along <= length; along += STEP.road) {
        const x = ax + ((bx - ax) * along) / length
        const z = az + ((bz - az) * along) / length
        const half = LORRY_LENGTH / 2
        const ends: GroundPoint[] = [
          [x, z],
          [x - dx * half, z - dz * half],
          [x + dx * half, z + dz * half]
        ]
        const behind = own.towardEnemy * (lineZ(own.front, x) - z)
        if (behind >= BEHIND_FRONT && ends.every(([px, pz]) => px >= 0 && pz >= 0 && px <= width && pz <= depth)) {
          stops.push({ x, z, heading: Math.atan2(dx, dz), behind, ends })
        }
      }
    }
  }
  stops.sort((p, q) => p.behind - q.behind)
  let best: Debus | null = null
  for (const { x, z, heading, ends } of stops) {
    if (ends.some(([px, pz]) => avoid(px, pz))) {
      continue
    }
    const seenBy = exposure(ends, best ? best.seenBy : eyes.length + 1)
    if (!best || seenBy < best.seenBy) {
      best = { side: own.side, x, z, heading, seenBy }
    }
    if (seenBy === 0) {
      break
    }
  }
  return best
}

/** The top of whatever stands on the ground that blocks the eye, on a 1 m grid. */
function sceneryTops(map: BattlefieldMap, width: number, depth: number): Float32Array {
  const stride = Math.ceil(width) + 1
  const tops = new Float32Array(stride * (Math.ceil(depth) + 1))
  for (const item of map.scenery) {
    const height = SCENERY_FOOTPRINTS[item.kind].sightHeight * item.scale
    if (height <= 0) {
      continue
    }
    const radius = footprintRadius(item)
    const top = heightAt(map, item.x, item.z) + height
    for (let z = Math.max(0, Math.floor(item.z - radius)); z <= Math.min(depth, Math.ceil(item.z + radius)); z++) {
      for (let x = Math.max(0, Math.floor(item.x - radius)); x <= Math.min(width, Math.ceil(item.x + radius)); x++) {
        if (Math.hypot(x - item.x, z - item.z) <= radius) {
          tops[z * stride + x] = Math.max(tops[z * stride + x] ?? 0, top)
        }
      }
    }
  }
  return tops
}
