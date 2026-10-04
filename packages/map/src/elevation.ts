/**
 * Real ground heights for a sector, surveyed rather than generated: a grid of samples on the map's own corners, as
 * written by scripts/fetch-elevation.mjs from IGN's LiDAR HD terrain model.
 *
 * File format, little-endian: a 20-byte header (magic "VDEL", version u16, columns u16, rows u16, two padding bytes,
 * cell size f32 in metres, base height f32 in metres), then `(columns + 1) * (rows + 1)` u16 samples, row by row from
 * the south edge, each the height above the base in centimetres.
 */
export interface Elevation {
  readonly columns: number
  readonly rows: number
  readonly cellSize: number
  /** Height above sea level of a sample at 0, in metres. Heights here are relative to it. */
  readonly base: number
  /** Metres above `base`, one per sample, row by row from the south edge. */
  readonly heights: Float32Array
}

const MAGIC = 0x4c45_4456
const VERSION = 1
const HEADER_BYTES = 20

/** Reads an elevation file. Throws with the reason when the bytes aren't one. */
export function decodeElevation(bytes: ArrayBuffer | Uint8Array): Elevation {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (view.byteLength < HEADER_BYTES) {
    throw new TypeError("Elevation file is too short for its header")
  }
  const header = new DataView(view.buffer, view.byteOffset, HEADER_BYTES)
  if (header.getUint32(0, true) !== MAGIC || header.getUint16(4, true) !== VERSION) {
    throw new TypeError("Not an elevation file, or a version this build can't read")
  }
  const columns = header.getUint16(6, true)
  const rows = header.getUint16(8, true)
  const cellSize = header.getFloat32(12, true)
  const base = header.getFloat32(16, true)
  const samples = (columns + 1) * (rows + 1)
  if (view.byteLength !== HEADER_BYTES + samples * 2) {
    throw new TypeError(`Elevation file should hold ${samples} samples`)
  }
  const centimetres = new DataView(view.buffer, view.byteOffset + HEADER_BYTES, samples * 2)
  const heights = new Float32Array(samples)
  for (let index = 0; index < samples; index++) {
    heights[index] = centimetres.getUint16(index * 2, true) / 100
  }
  return { columns, rows, cellSize, base, heights }
}

/** Height above the base at a point, bilinearly interpolated; points outside clamp to the edge. */
export function elevationAt(elevation: Elevation, x: number, z: number): number {
  const { columns, rows, cellSize, heights } = elevation
  const gridX = Math.min(columns, Math.max(0, x / cellSize))
  const gridZ = Math.min(rows, Math.max(0, z / cellSize))
  const column = Math.min(Math.floor(gridX), columns - 1)
  const row = Math.min(Math.floor(gridZ), rows - 1)
  const fx = gridX - column
  const fz = gridZ - row
  const at = (c: number, r: number) => heights[r * (columns + 1) + c] ?? 0
  const near = at(column, row) * (1 - fx) + at(column + 1, row) * fx
  const far = at(column, row + 1) * (1 - fx) + at(column + 1, row + 1) * fx
  return near * (1 - fz) + far * fz
}
