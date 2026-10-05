import { type BattlefieldMap, sampleIndex } from "@verdun/map"
import type { GroundPatch } from "@verdun/sim"

/**
 * The ground shells have reshaped, as a player joining late is sent it: one rectangle of samples round every crater,
 * each sample's height as how far it has moved since the map was generated, in whole millimetres, and its surface where
 * shells changed it (`UNCHANGED` elsewhere). The player generates the same map, so this is all they need, and untouched
 * ground inside the rectangle is zeros that compress to nothing: a fraction of the heights themselves.
 */
export interface GroundMovement {
  readonly minColumn: number
  readonly maxColumn: number
  readonly minRow: number
  readonly maxRow: number
  readonly moved: Int16Array
  readonly surfaces: Uint8Array
}

/** A surface no shell has changed. No `Surface` comes near it. */
const UNCHANGED = 255
/** Millimetres to the metre. Sixteen bits of them reach 32 m up or down, far beyond the deepest crater's. */
const MM = 1000

/** How the ground of `map` has moved from `generated`, the same map's ground as it was generated; null if it hasn't. */
export function groundMovement(
  map: BattlefieldMap,
  generated: { readonly heights: Float32Array; readonly surfaces: Uint8Array }
): GroundMovement | null {
  let minColumn = map.columns
  let maxColumn = -1
  let minRow = map.rows
  let maxRow = -1
  for (let row = 0; row <= map.rows; row++) {
    for (let column = 0; column <= map.columns; column++) {
      const sample = sampleIndex(map, column, row)
      if (map.heights[sample] !== generated.heights[sample] || map.surfaces[sample] !== generated.surfaces[sample]) {
        minColumn = Math.min(minColumn, column)
        maxColumn = Math.max(maxColumn, column)
        minRow = Math.min(minRow, row)
        maxRow = Math.max(maxRow, row)
      }
    }
  }
  if (maxRow < 0) {
    return null
  }
  const size = (maxColumn - minColumn + 1) * (maxRow - minRow + 1)
  const moved = new Int16Array(size)
  const surfaces = new Uint8Array(size).fill(UNCHANGED)
  let at = 0
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      const sample = sampleIndex(map, column, row)
      moved[at] = Math.round((map.heights[sample] - generated.heights[sample]) * MM)
      if (map.surfaces[sample] !== generated.surfaces[sample]) {
        surfaces[at] = map.surfaces[sample]
      }
      at++
    }
  }
  return { minColumn, maxColumn, minRow, maxRow, moved, surfaces }
}

/** The ground as it now stands, from its movement and `map`, the map as generated, as the mirror takes ground in. */
export function groundFromMovement(map: BattlefieldMap, movement: GroundMovement): GroundPatch {
  const { minColumn, maxColumn, minRow, maxRow } = movement
  const size = (maxColumn - minColumn + 1) * (maxRow - minRow + 1)
  const heights = new Float32Array(size)
  const surfaces = new Uint8Array(size)
  let at = 0
  for (let row = minRow; row <= maxRow; row++) {
    for (let column = minColumn; column <= maxColumn; column++) {
      const sample = sampleIndex(map, column, row)
      heights[at] = map.heights[sample] + movement.moved[at] / MM
      const surface = movement.surfaces[at]
      surfaces[at] = surface === UNCHANGED ? map.surfaces[sample] : surface
      at++
    }
  }
  return { minColumn, maxColumn, minRow, maxRow, heights, surfaces }
}
