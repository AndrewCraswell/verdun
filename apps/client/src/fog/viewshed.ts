import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"
import { blockReach, insideBlock, sightBlocks, type WorldPoint } from "@verdun/sim"

/** A coarse grid over the map recording what the player can see: 255 visible, 0 not. Row by row, south to north. */
export interface FogGrid {
  /** Edge length of one fog cell, in metres. */
  readonly cellSize: number
  readonly columns: number
  readonly rows: number
  readonly values: Uint8Array
}

export function createFogGrid(map: BattlefieldMap, cellSize = 2): FogGrid {
  const columns = Math.ceil(mapWidth(map) / cellSize)
  const rows = Math.ceil(mapDepth(map) / cellSize)
  return { cellSize, columns, rows, values: new Uint8Array(columns * rows) }
}

/**
 * Ground counts as seen when something this tall standing on it would be visible, so a crouching enemy behind a fold
 * in the ground stays hidden while open ground doesn't flicker at grazing angles.
 */
const TARGET_HEIGHT = 0.4

/** Edge of the grid scenery tops are kept on, in metres. */
const SCENERY_CELL = 1

interface SceneryTops {
  readonly columns: number
  readonly rows: number
  /** The top of whatever stands in each cell (ruin, wall, tree, wreck), or -Infinity where nothing does. */
  readonly tops: Float32Array
}

const sceneryTopsCache = new WeakMap<BattlefieldMap, SceneryTops>()

/**
 * How high the map's scenery stands, cell by cell, with the same footprints and heights the simulation's line of sight
 * gives it (see the simulation's sight shapes): what you can't see past is what the enemy can't see past either.
 */
function sceneryTops(map: BattlefieldMap): SceneryTops {
  const cached = sceneryTopsCache.get(map)
  if (cached) {
    return cached
  }
  const columns = Math.ceil(mapWidth(map) / SCENERY_CELL)
  const rows = Math.ceil(mapDepth(map) / SCENERY_CELL)
  const tops = new Float32Array(columns * rows).fill(-Infinity)
  for (const item of map.scenery) {
    for (const block of sightBlocks(item)) {
      const top = heightAt(map, block.x, block.z) + block.height
      const reach = blockReach(block)
      const minColumn = Math.max(0, Math.floor((block.x - reach) / SCENERY_CELL))
      const maxColumn = Math.min(columns - 1, Math.floor((block.x + reach) / SCENERY_CELL))
      const minRow = Math.max(0, Math.floor((block.z - reach) / SCENERY_CELL))
      const maxRow = Math.min(rows - 1, Math.floor((block.z + reach) / SCENERY_CELL))
      for (let row = minRow; row <= maxRow; row++) {
        for (let column = minColumn; column <= maxColumn; column++) {
          const cell = row * columns + column
          const inside = insideBlock(block, (column + 0.5) * SCENERY_CELL, (row + 0.5) * SCENERY_CELL)
          if (inside && top > (tops[cell] ?? -Infinity)) {
            tops[cell] = top
          }
        }
      }
    }
  }
  const made = { columns, rows, tops }
  sceneryTopsCache.set(map, made)
  return made
}

/** Reads the top of whatever scenery stands at a ground point, in metres, or -Infinity where nothing does. */
export function sceneryTopAt(map: BattlefieldMap): (x: number, z: number) => number {
  const { columns, rows, tops } = sceneryTops(map)
  return (x, z) => {
    const column = Math.floor(x / SCENERY_CELL)
    const row = Math.floor(z / SCENERY_CELL)
    if (column < 0 || row < 0 || column >= columns || row >= rows) {
      return -Infinity
    }
    return tops[row * columns + column] ?? -Infinity
  }
}

/**
 * Marks every fog cell visible from an eye point, out to a range. Rays fan out across the height grid; along each, a
 * point is visible when the slope up to it is at least the steepest slope met so far (the classic radial viewshed).
 * Ruins, walls, trees and wrecks block the view as the ground does, by the tops of their footprints.
 * This is presentation only: gameplay sight lines use the simulation's line of sight.
 */
export function computeViewshed(map: BattlefieldMap, eye: WorldPoint, range: number, grid: FogGrid): void {
  const job = startViewshed(map, eye, range, grid)
  job.advance(job.rays)
}

/** A viewshed worked out a few rays at a time, so its cost can be spread over frames. */
export interface ViewshedJob {
  /** How many rays it casts in all. */
  readonly rays: number
  /** Casts up to this many more rays. Returns true once every ray is cast. */
  advance(rays: number): boolean
}

/** Starts a viewshed (see `computeViewshed`): clears the grid and marks the eye's own cell. */
export function startViewshed(map: BattlefieldMap, eye: WorldPoint, range: number, grid: FogGrid): ViewshedJob {
  grid.values.fill(0)
  const scenery = sceneryTops(map)
  const width = mapWidth(map)
  const depth = mapDepth(map)
  // Samples and rays a little under a cell apart, even at full range, so no cell falls between them.
  const step = grid.cellSize * 0.75
  const rays = Math.ceil((2 * Math.PI * range) / (grid.cellSize * 0.85))

  const mark = (x: number, z: number) => {
    const column = Math.min(grid.columns - 1, Math.floor(x / grid.cellSize))
    const row = Math.min(grid.rows - 1, Math.floor(z / grid.cellSize))
    grid.values[row * grid.columns + column] = 255
  }
  mark(eye.x, eye.z)

  const cast = (ray: number) => {
    const angle = (ray / rays) * 2 * Math.PI
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)
    let steepest = -Infinity
    for (let distance = step; distance <= range; distance += step) {
      const x = eye.x + dx * distance
      const z = eye.z + dz * distance
      if (x < 0 || z < 0 || x > width || z > depth) {
        break
      }
      const ground = heightAt(map, x, z)
      if ((ground + TARGET_HEIGHT - eye.y) / distance >= steepest) {
        mark(x, z)
      }
      const standing =
        scenery.tops[Math.floor(z / SCENERY_CELL) * scenery.columns + Math.floor(x / SCENERY_CELL)] ?? -Infinity
      steepest = Math.max(steepest, (Math.max(ground, standing) - eye.y) / distance)
    }
  }

  let next = 0
  return {
    rays,
    advance(count) {
      const until = Math.min(rays, next + count)
      for (; next < until; next++) {
        cast(next)
      }
      return next >= rays
    }
  }
}
