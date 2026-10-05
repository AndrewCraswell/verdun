import {
  type BattlefieldMap,
  footprintRadius,
  heightAt,
  mapDepth,
  mapWidth,
  sampleIndex,
  type Scenery,
  SCENERY_FOOTPRINTS,
  Surface
} from "@verdun/map"
import { sightBlocks } from "./sight-shapes.ts"
import { isInTrench } from "./trench-grid.ts"

/**
 * A soldier's body against the ground and the scenery: what he can walk up, what he climbs, what he slides along, and
 * what he can't stand inside. Pure functions of the map, so the player's man, the bots, the worker and the server all
 * move alike. Collide-and-slide, as character controllers since Quake's have done it, on the height grid rather than
 * against triangles.
 */

/** Half a man's width, in metres: his shoulder meets a wall before his middle does. */
export const BODY_RADIUS = 0.3
/** The ground is looked at this far beyond his edge, in metres, as well as the stride he's about to take. */
const SKIN = 0.1
/**
 * Ground rising faster than this ahead (45 degrees) isn't walked but stepped or climbed: the same grade at which
 * terrain.ts has men scramble.
 */
const STEEP_GRADE = 1
/** A rise this high or less is stepped up whichever way he comes at it, in metres: duckboards, a sandbag, a rut. */
const STEP_UP = 0.5
/**
 * A rise up to this high is a ledge, in metres: the fire step from a trench's floor (1.05 m), the parapet from the fire
 * step (1.25 m with its spoil), a crater's lip. Higher is a wall: a trench's back wall from its floor (2.3 m).
 */
export const LEDGE_RISE = 1.3
/** How far along the ground the top of a rise is looked for, in metres, and in steps this long. */
const RISE_REACH = 3
const RISE_STEP = 0.25
/** A step is tried this many times against the walls in its way: twice turns him into a corner, a third stops him. */
const PASSES = 3
/** Shoulders are probed this far either side of his middle, as a share of his half-width. */
const SHOULDER = 0.8

/**
 * How a man treats a ledge or wall he walks into. Steered, as the player steers him, he climbs a ledge only when he
 * heads straight at it, and a trench's wall never: those he vaults. On ground the shells have churned, out of the
 * trenches, a wall is a crater's side, loose earth he scrambles up heading straight at it, as at a ledge. On an order, his route chose the way, so he climbs whatever
 * lies across it as long as he's heading at it.
 */
export const Climbing = { Steered: 0, Ordered: 1 } as const
export type Climbing = (typeof Climbing)[keyof typeof Climbing]

/** Heading within this angle of straight at a rise (its cosine) climbs it rather than sliding along it. */
const CLIMB_HEADING: Readonly<Record<Climbing, number>> = {
  // About 25 degrees: walking along a trench with the keys a little off its line never takes him up a wall.
  [Climbing.Steered]: 0.9,
  // About 45 degrees.
  [Climbing.Ordered]: 0.7
}

/** Whether a man stands on shell-churned ground out of the trenches: in or by a crater, whose sides he can scramble. */
function inShellHole(map: BattlefieldMap, x: number, z: number): boolean {
  const column = Math.min(map.columns, Math.max(0, Math.round(x / map.cellSize)))
  const row = Math.min(map.rows, Math.max(0, Math.round(z / map.cellSize)))
  return map.surfaces[sampleIndex(map, column, row)] === Surface.Churned && !isInTrench(map, x, z)
}

/** What stands in a man's way. */
export const Obstacle = { None: 0, Ledge: 1, Wall: 2 } as const
export type Obstacle = (typeof Obstacle)[keyof typeof Obstacle]

/** The way a man can go this step: a direction no longer than one, and what he met. */
export interface Way {
  readonly x: number
  readonly z: number
  /** The rise he slid along or is climbing, or `Obstacle.None` where nothing steep was in the way. */
  readonly met: Obstacle
  /** Whether he goes up it rather than along it. */
  readonly climbing: boolean
}

/** The ground's uphill direction at a point, on the ground plane, and how steep it is there. */
function slope(map: BattlefieldMap, x: number, z: number): { x: number; z: number; grade: number } {
  const e = 0.25
  const gx = (heightAt(map, x + e, z) - heightAt(map, x - e, z)) / (2 * e)
  const gz = (heightAt(map, x, z + e) - heightAt(map, x, z - e)) / (2 * e)
  const grade = Math.sqrt(gx * gx + gz * gz)
  return grade > 0 ? { x: gx / grade, z: gz / grade, grade } : { x: 0, z: 0, grade: 0 }
}

/**
 * How high a steep rise stands above `floor`, looking on from (x, z) along (dx, dz) until the ground eases off: the
 * fire step, a parapet, a wall's top.
 */
function riseAbove(map: BattlefieldMap, x: number, z: number, dx: number, dz: number, floor: number): number {
  let top = heightAt(map, x, z)
  let previous = top
  for (let along = RISE_STEP; along <= RISE_REACH; along += RISE_STEP) {
    const height = heightAt(map, x + dx * along, z + dz * along)
    top = Math.max(top, height)
    if (height - previous <= RISE_STEP * STEEP_GRADE) {
      break
    }
    previous = height
  }
  return top - floor
}

interface Contact {
  /** The rise's uphill direction where he meets it. */
  readonly x: number
  readonly z: number
  readonly obstacle: Obstacle
  /** How squarely he heads at it: the cosine between his way and straight up it. */
  readonly heading: number
}

/** The steepest rise a step of `length` along (dx, dz) runs his middle or a shoulder into, or null. */
function contact(
  map: BattlefieldMap,
  x: number,
  z: number,
  dx: number,
  dz: number,
  length: number,
  floor: number
): Contact | null {
  const reach = BODY_RADIUS + SKIN + length
  let met: Contact | null = null
  for (const side of [0, 1, -1]) {
    const px = x + dx * reach - dz * BODY_RADIUS * SHOULDER * side
    const pz = z + dz * reach + dx * BODY_RADIUS * SHOULDER * side
    const rise = heightAt(map, px, pz) - floor
    if (rise <= reach * STEEP_GRADE) {
      continue
    }
    const up = slope(map, px, pz)
    const heading = dx * up.x + dz * up.z
    // A wall beside him, running the way he goes, isn't in his way.
    if (heading <= 0.05) {
      continue
    }
    const height = riseAbove(map, px, pz, dx, dz, floor)
    if (height <= STEP_UP) {
      continue
    }
    const obstacle = height <= LEDGE_RISE ? Obstacle.Ledge : Obstacle.Wall
    if (!met || heading > met.heading) {
      met = { x: up.x, z: up.z, obstacle, heading }
    }
  }
  return met
}

/**
 * The way a man standing at (x, z) can go this step, heading along (dx, dz), a unit vector, for a stride of `stride`
 * metres. Where a ledge or wall stands in his way he either climbs it (see `Climbing`) or slides along it, keeping the
 * part of his step that runs along it; boxed into a corner, he stops. The way's length is the share of his stride he
 * keeps.
 */
export function wayAhead(
  map: BattlefieldMap,
  x: number,
  z: number,
  dx: number,
  dz: number,
  stride: number,
  climbing: Climbing
): Way {
  const floor = heightAt(map, x, z)
  let wx = dx
  let wz = dz
  let met: Obstacle = Obstacle.None
  for (let pass = 0; pass < PASSES; pass++) {
    const length = Math.sqrt(wx * wx + wz * wz)
    if (length < 1e-6) {
      return { x: 0, z: 0, met, climbing: false }
    }
    const touched = contact(map, x, z, wx / length, wz / length, stride * length, floor)
    if (!touched) {
      return { x: wx, z: wz, met, climbing: false }
    }
    if (touched.obstacle > met) {
      met = touched.obstacle
    }
    const climbs =
      touched.heading >= CLIMB_HEADING[climbing] &&
      (touched.obstacle === Obstacle.Ledge || climbing === Climbing.Ordered || inShellHole(map, x, z))
    if (climbs && pass === 0) {
      return { x: wx, z: wz, met: touched.obstacle, climbing: true }
    }
    // Along it: take away the part of the step that goes up it.
    const into = wx * touched.x + wz * touched.z
    wx -= into * touched.x
    wz -= into * touched.z
  }
  // Still running into something after turning along every wall: a corner. He stops.
  const length = Math.sqrt(wx * wx + wz * wz)
  const last = length > 1e-6 ? contact(map, x, z, wx / length, wz / length, stride * length, floor) : null
  return last ? { x: 0, z: 0, met, climbing: false } : { x: wx, z: wz, met, climbing: false }
}

/**
 * A fence or low wall, as men climb it: a box along its line, `halfLength` either way along (`lineX`, `lineZ`), a unit
 * vector, and `halfDepth` either side of it.
 */
export interface Climbed {
  readonly x: number
  readonly z: number
  readonly lineX: number
  readonly lineZ: number
  readonly halfLength: number
  readonly halfDepth: number
}

/** A fence's rails run this far either side of its middle, in metres, times its scale: the art's 3.64 m... */
const FENCE_HALF_LENGTH = 1.82
/** ...and its posts stand this far either side of its line. */
const FENCE_HALF_DEPTH = 0.1

/**
 * The boxes a climbed piece of scenery stands in a man's way with: a fence's rails, a wall's stretches of stone as their
 * sight shapes measure them (sight-shapes.ts). A stretch no higher than a step is walked over.
 */
export function climbedShapes(item: Scenery): Climbed[] {
  if (item.kind === "knife-rest") {
    return [
      {
        x: item.x,
        z: item.z,
        lineX: Math.cos(item.heading),
        lineZ: -Math.sin(item.heading),
        halfLength: FENCE_HALF_LENGTH * item.scale,
        halfDepth: FENCE_HALF_DEPTH * item.scale
      }
    ]
  }
  return sightBlocks(item).flatMap((block) =>
    block.kind === "box" && block.height > STEP_UP
      ? [
          {
            x: block.x,
            z: block.z,
            lineX: Math.cos(block.yaw),
            lineZ: -Math.sin(block.yaw),
            halfLength: block.halfAcross,
            halfDepth: block.halfAlong
          }
        ]
      : []
  )
}

/** What a man can't stand in: an impassable piece of scenery's footprint, as a circle, or a climbed one's box. */
type Footing =
  | { readonly kind: "disc"; readonly x: number; readonly z: number; readonly radius: number }
  | ({ readonly kind: "box" } & Climbed)

/** How far a footing reaches from its middle, in metres. */
function footingReach(footing: Footing): number {
  return footing.kind === "disc" ? footing.radius : Math.sqrt(footing.halfLength ** 2 + footing.halfDepth ** 2)
}

/** A point relative to a box: how far along its line, and across it (the line turned a quarter clockwise from above). */
function local(box: Climbed, x: number, z: number): { along: number; across: number } {
  const dx = x - box.x
  const dz = z - box.z
  return { along: dx * box.lineX + dz * box.lineZ, across: dx * box.lineZ - dz * box.lineX }
}

/**
 * Where a man at (x, z) stands against a footing: how far outside its edge he is (negative inside), and the way out of
 * it, a unit vector.
 */
function standing(footing: Footing, x: number, z: number): { gap: number; outX: number; outZ: number } {
  if (footing.kind === "disc") {
    const dx = x - footing.x
    const dz = z - footing.z
    // Math.sqrt is correctly rounded on every engine; Math.hypot is not, which would break determinism.
    const distance = Math.sqrt(dx * dx + dz * dz)
    // Dead in the middle: out to the east, the same way every time.
    return distance > 1e-9
      ? { gap: distance - footing.radius, outX: dx / distance, outZ: dz / distance }
      : { gap: -footing.radius, outX: 1, outZ: 0 }
  }
  const { along, across } = local(footing, x, z)
  const pastEnd = Math.abs(along) - footing.halfLength
  const pastSide = Math.abs(across) - footing.halfDepth
  const alongSign = along < 0 ? -1 : 1
  const acrossSign = across < 0 ? -1 : 1
  if (pastEnd <= 0 && pastSide <= 0) {
    // Inside: out by the nearer face.
    return pastSide >= pastEnd
      ? { gap: pastSide, outX: footing.lineZ * acrossSign, outZ: -footing.lineX * acrossSign }
      : { gap: pastEnd, outX: footing.lineX * alongSign, outZ: footing.lineZ * alongSign }
  }
  const endOut = Math.max(0, pastEnd)
  const sideOut = Math.max(0, pastSide)
  const gap = Math.sqrt(endOut * endOut + sideOut * sideOut)
  const outAlong = (endOut / gap) * alongSign
  const outAcross = (sideOut / gap) * acrossSign
  return {
    gap,
    outX: footing.lineX * outAlong + footing.lineZ * outAcross,
    outZ: footing.lineZ * outAlong - footing.lineX * outAcross
  }
}

/** Bucket size for finding the scenery near a man, in metres: about the widest footprint. */
const SCENERY_BUCKET = 8

interface SceneryIndex {
  readonly columns: number
  readonly rows: number
  readonly buckets: readonly (readonly Footing[])[]
}

const sceneryIndexes = new WeakMap<BattlefieldMap, SceneryIndex>()

/**
 * The scenery nobody can walk through (ruins, trees, guns, bunkers: `walkCost` Infinity, as the routes have them; and
 * the fences and low walls men climb), bucketed by where it stands, each footing in every bucket it reaches. Built
 * once per map.
 */
function sceneryIndex(map: BattlefieldMap): SceneryIndex {
  const cached = sceneryIndexes.get(map)
  if (cached) {
    return cached
  }
  const columns = Math.max(1, Math.ceil(mapWidth(map) / SCENERY_BUCKET))
  const rows = Math.max(1, Math.ceil(mapDepth(map) / SCENERY_BUCKET))
  const buckets: Footing[][] = Array.from({ length: columns * rows }, () => [])
  const add = (footing: Footing) => {
    const reach = footingReach(footing) + BODY_RADIUS
    const minColumn = Math.max(0, Math.floor((footing.x - reach) / SCENERY_BUCKET))
    const maxColumn = Math.min(columns - 1, Math.floor((footing.x + reach) / SCENERY_BUCKET))
    const minRow = Math.max(0, Math.floor((footing.z - reach) / SCENERY_BUCKET))
    const maxRow = Math.min(rows - 1, Math.floor((footing.z + reach) / SCENERY_BUCKET))
    for (let row = minRow; row <= maxRow; row++) {
      for (let column = minColumn; column <= maxColumn; column++) {
        buckets[row * columns + column]?.push(footing)
      }
    }
  }
  for (const scenery of map.scenery) {
    const footprint = SCENERY_FOOTPRINTS[scenery.kind]
    if (footprint.climbed) {
      for (const shape of climbedShapes(scenery)) {
        add({ kind: "box", ...shape })
      }
    } else if (!Number.isFinite(footprint.walkCost)) {
      add({ kind: "disc", x: scenery.x, z: scenery.z, radius: footprintRadius(scenery) })
    }
  }
  const index = { columns, rows, buckets }
  sceneryIndexes.set(map, index)
  return index
}

/** The footings that may reach (x, z). */
function footingsNear(map: BattlefieldMap, x: number, z: number): readonly Footing[] {
  const { columns, rows, buckets } = sceneryIndex(map)
  const column = Math.min(columns - 1, Math.max(0, Math.floor(x / SCENERY_BUCKET)))
  const row = Math.min(rows - 1, Math.max(0, Math.floor(z / SCENERY_BUCKET)))
  return buckets[row * columns + column] ?? []
}

/** Whether a man standing at (x, z) would be inside a piece of impassable or climbed scenery. */
export function insideScenery(map: BattlefieldMap, x: number, z: number): boolean {
  return footingsNear(map, x, z).some((footing) => standing(footing, x, z).gap < BODY_RADIUS)
}

/**
 * Where a man stepping to (x, z) ends up clear of the scenery: pushed straight out of any footing he'd stand in, which
 * keeps the part of his step that runs round it, so he slides round a ruin's corner, a tree or along a fence rather than
 * stopping at it. Twice over, for footings that touch.
 */
export function clearOfScenery(map: BattlefieldMap, x: number, z: number): { x: number; z: number } {
  let px = x
  let pz = z
  for (let pass = 0; pass < 2; pass++) {
    let moved = false
    for (const footing of footingsNear(map, px, pz)) {
      const { gap, outX, outZ } = standing(footing, px, pz)
      if (gap >= BODY_RADIUS) {
        continue
      }
      // A hair past the edge, so he counts as out of it.
      const push = BODY_RADIUS - gap + 1e-6
      px += outX * push
      pz += outZ * push
      moved = true
    }
    if (!moved) {
      break
    }
  }
  return { x: px, z: pz }
}

/** The fence or low wall a man at (x, z) is on, within `reach` of its faces and along its length, or null. */
export function climbedUnder(map: BattlefieldMap, x: number, z: number, reach: number): Climbed | null {
  for (const footing of footingsNear(map, x, z)) {
    if (footing.kind !== "box") {
      continue
    }
    const { along, across } = local(footing, x, z)
    if (Math.abs(along) <= footing.halfLength + BODY_RADIUS && Math.abs(across) <= footing.halfDepth + reach) {
      return footing
    }
  }
  return null
}

/**
 * The fence or low wall that a man at (x, z) heading along (dx, dz), a unit vector, runs into within `reach` of his
 * edge, or null: how far on his middle comes within his half-width of its near face (`entry`) and gets as far past its
 * far face (`exit`), and the box. Only one he crosses squarely enough to climb, within 60 degrees of straight across,
 * and within its length, or he'd go round its end.
 */
export function climbedAhead(
  map: BattlefieldMap,
  x: number,
  z: number,
  dx: number,
  dz: number,
  reach: number
): { readonly entry: number; readonly exit: number; readonly climbed: Climbed } | null {
  let best: { entry: number; exit: number; climbed: Climbed } | null = null
  const probe = reach + BODY_RADIUS
  const near = new Set([...footingsNear(map, x, z), ...footingsNear(map, x + dx * probe, z + dz * probe)])
  for (const footing of near) {
    if (footing.kind !== "box") {
      continue
    }
    const { along, across } = local(footing, x, z)
    const wayAlong = dx * footing.lineX + dz * footing.lineZ
    const wayAcross = dx * footing.lineZ - dz * footing.lineX
    if (Math.abs(wayAcross) < 0.5) {
      continue
    }
    const depth = footing.halfDepth + BODY_RADIUS
    const toward = wayAcross < 0 ? -1 : 1
    const entry = (-toward * depth - across) / wayAcross
    const exit = (toward * depth - across) / wayAcross
    if (exit <= 0 || entry > probe) {
      continue
    }
    const crossing = along + wayAlong * ((Math.max(0, entry) + exit) / 2)
    if (Math.abs(crossing) > footing.halfLength) {
      continue
    }
    if (!best || entry < best.entry) {
      best = { entry: Math.max(0, entry), exit, climbed: footing }
    }
  }
  return best
}

/** Whether a man can be shoved from (x, z) to (toX, toZ): no wall to go up, and no scenery to stand in. */
export function canBeShoved(map: BattlefieldMap, x: number, z: number, toX: number, toZ: number): boolean {
  return heightAt(map, toX, toZ) - heightAt(map, x, z) <= STEP_UP / 2 && !insideScenery(map, toX, toZ)
}
