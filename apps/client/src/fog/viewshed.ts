import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"
import type { WorldPoint } from "@verdun/sim"

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

/**
 * Marks every fog cell visible from an eye point, out to a range. Rays fan out across the height grid; along each, a
 * point is visible when the slope up to it is at least the steepest slope met so far (the classic radial viewshed).
 * This is presentation only: gameplay sight lines use the simulation's line of sight.
 */
export function computeViewshed(map: BattlefieldMap, eye: WorldPoint, range: number, grid: FogGrid): void {
  grid.values.fill(0)
  const width = mapWidth(map)
  const depth = mapDepth(map)
  const step = grid.cellSize / 2
  // Enough rays that neighbouring rays are less than a cell apart at full range.
  const rays = Math.ceil((2 * Math.PI * range) / (grid.cellSize * 0.75))

  const mark = (x: number, z: number) => {
    const column = Math.min(grid.columns - 1, Math.floor(x / grid.cellSize))
    const row = Math.min(grid.rows - 1, Math.floor(z / grid.cellSize))
    grid.values[row * grid.columns + column] = 255
  }
  mark(eye.x, eye.z)

  for (let ray = 0; ray < rays; ray++) {
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
      steepest = Math.max(steepest, (ground - eye.y) / distance)
    }
  }
}
