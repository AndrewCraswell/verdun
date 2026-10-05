import { gunzipSync, gzipSync } from "node:zlib"
import type { BattlefieldMap } from "@verdun/map"

/** The map's ground at one moment: every height sample and every surface. */
export interface Ground {
  readonly heights: Float32Array
  readonly surfaces: Uint8Array
}

/**
 * The ground shells have reshaped, compressed, as a save keeps it: how far each height sample has moved since the map
 * was generated, and each sample's surface where shells changed it (`UNCHANGED` elsewhere). Untouched ground is zeros
 * and `UNCHANGED`, so a whole sector packs small.
 */
export interface SavedGround {
  readonly heights: Uint8Array
  readonly surfaces: Uint8Array
}

/** A surface no shell has changed. No `Surface` comes near it. */
const UNCHANGED = 255

/** A copy of the map's ground as it stands: taken when the map is generated, it's what saves are measured against. */
export function groundOf(map: BattlefieldMap): Ground {
  return { heights: map.heights.slice(), surfaces: map.surfaces.slice() }
}

export function saveGround(map: BattlefieldMap, generated: Ground): SavedGround {
  const moved = new Float32Array(map.heights.length)
  const surfaces = new Uint8Array(map.surfaces.length).fill(UNCHANGED)
  for (let sample = 0; sample < moved.length; sample++) {
    moved[sample] = map.heights[sample] - generated.heights[sample]
    if (map.surfaces[sample] !== generated.surfaces[sample]) {
      surfaces[sample] = map.surfaces[sample]
    }
  }
  return { heights: gzipSync(new Uint8Array(moved.buffer)), surfaces: gzipSync(surfaces) }
}

/**
 * Reshapes a freshly generated map as the saved ground was. Measured as movements, the craters land on the new ground
 * even when a later build has changed the map's terrain. Returns false, leaving the map as generated, when the save is
 * of a map of another size.
 */
export function restoreGround(map: BattlefieldMap, saved: SavedGround): boolean {
  const bytes = gunzipSync(saved.heights)
  const surfaces = gunzipSync(saved.surfaces)
  if (bytes.byteLength !== map.heights.byteLength || surfaces.length !== map.surfaces.length) {
    return false
  }
  // Copied out of the unzipped buffer, which may not start on a 4-byte boundary.
  const moved = new Float32Array(Uint8Array.from(bytes).buffer)
  for (let sample = 0; sample < moved.length; sample++) {
    map.heights[sample] += moved[sample]
    if (surfaces[sample] !== UNCHANGED) {
      map.surfaces[sample] = surfaces[sample]
    }
  }
  return true
}
