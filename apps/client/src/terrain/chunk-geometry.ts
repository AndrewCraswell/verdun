import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import {
  type BattlefieldMap,
  isSurface,
  latticeValue,
  sampleIndex,
  Surface,
  SURFACE_COUNT,
  valueNoise
} from "@verdun/map"

/** A rectangle of map samples, inclusive at both ends. Neighbouring chunks share their edge samples. */
export interface ChunkBounds {
  readonly firstColumn: number
  readonly lastColumn: number
  readonly firstRow: number
  readonly lastRow: number
}

/** Texture coordinates repeat every this many metres, in world space so textures line up across chunks. */
const UV_TILE_METERS = 8
/** Seeds for brightness variation: broad patches that hide texture tiling, plus a little per-vertex jitter. */
const SHADE_SEED = 11
const PATCH_SEED = 23
const PATCH_SCALE_METERS = 40
/** Surfaces blend over this many samples either side (2 m on the 0.5 m grid), softening hard patch edges. */
const BLEND_RADIUS = 4
const BLEND_STRIDE = 2

/** Sample indices from `first` to `last` every `step`, always ending exactly on `last`. */
export function sampleSteps(first: number, last: number, step: number): number[] {
  const steps: number[] = []
  for (let index = first; index < last; index += step) {
    steps.push(index)
  }
  steps.push(last)
  return steps
}

function heightOf(map: BattlefieldMap, column: number, row: number): number {
  const clampedColumn = Math.min(map.columns, Math.max(0, column))
  const clampedRow = Math.min(map.rows, Math.max(0, row))
  return map.heights[sampleIndex(map, clampedColumn, clampedRow)]
}

/**
 * Surface normal from the height field by central differences. It depends only on the map, never on which chunk asks,
 * so lighting is continuous across chunk seams.
 */
function normalAt(map: BattlefieldMap, column: number, row: number, step: number): [number, number, number] {
  const left = Math.max(0, column - step)
  const right = Math.min(map.columns, column + step)
  const near = Math.max(0, row - step)
  const far = Math.min(map.rows, row + step)
  const slopeX = (heightOf(map, right, row) - heightOf(map, left, row)) / ((right - left) * map.cellSize)
  const slopeZ = (heightOf(map, column, far) - heightOf(map, column, near)) / ((far - near) * map.cellSize)
  const length = Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ)
  return [-slopeX / length, 1 / length, -slopeZ / length]
}

/**
 * Share of each surface around a sample, as texture splat weights in `Surface` order. Reads the map by global sample
 * position, never by chunk, so neighbouring chunks agree along their shared edge.
 */
function surfaceWeights(map: BattlefieldMap, column: number, row: number): number[] {
  const weights = Array.from({ length: SURFACE_COUNT }, () => 0)
  let total = 0
  for (let dz = -BLEND_RADIUS; dz <= BLEND_RADIUS; dz += BLEND_STRIDE) {
    for (let dx = -BLEND_RADIUS; dx <= BLEND_RADIUS; dx += BLEND_STRIDE) {
      const sampleColumn = Math.min(map.columns, Math.max(0, column + dx))
      const sampleRow = Math.min(map.rows, Math.max(0, row + dz))
      const stored = map.surfaces[sampleIndex(map, sampleColumn, sampleRow)]
      weights[isSurface(stored) ? stored : Surface.Mud] += 1
      total += 1
    }
  }
  return weights.map((weight) => weight / total)
}

/** Brightness multiplier: broad 40 m patches of lighter and darker ground, plus slight per-vertex jitter. */
function shadeAt(column: number, row: number, x: number, z: number): number {
  const patch = valueNoise(PATCH_SEED, x, z, PATCH_SCALE_METERS)
  const jitter = latticeValue(SHADE_SEED, column, row)
  return 0.82 + patch * 0.3 + jitter * 0.06
}

export interface ChunkGeometry {
  /** Positions, height-field normals, world-space UVs and a brightness variation as vertex colour. */
  readonly vertexData: VertexData
  /** Four surface weights per vertex (grass, mud, chalk, churned) for the terrain splat material. */
  readonly splat: number[]
}

/** Builds one terrain chunk. `step` thins the 0.5 m simulation grid for rendering. */
export function buildChunkGeometry(map: BattlefieldMap, bounds: ChunkBounds, step: number): ChunkGeometry {
  const columns = sampleSteps(bounds.firstColumn, bounds.lastColumn, step)
  const rows = sampleSteps(bounds.firstRow, bounds.lastRow, step)

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const splat: number[] = []
  for (const row of rows) {
    for (const column of columns) {
      const x = column * map.cellSize
      const z = row * map.cellSize
      const index = sampleIndex(map, column, row)
      positions.push(x, map.heights[index], z)
      normals.push(...normalAt(map, column, row, step))
      uvs.push(x / UV_TILE_METERS, z / UV_TILE_METERS)
      const shade = shadeAt(column, row, x, z)
      colors.push(shade, shade, shade, 1)
      splat.push(...surfaceWeights(map, column, row))
    }
  }

  // Rows run toward +z, so triangles wind to face up in Babylon's left-handed system.
  const rowLength = columns.length
  const indices: number[] = []
  for (let row = 0; row < rows.length - 1; row++) {
    for (let column = 0; column < rowLength - 1; column++) {
      const nearLeft = row * rowLength + column
      const nearRight = nearLeft + 1
      const farLeft = nearLeft + rowLength
      const farRight = farLeft + 1
      indices.push(nearRight, farRight, farLeft, nearLeft, nearRight, farLeft)
    }
  }

  const vertexData = new VertexData()
  vertexData.positions = positions
  vertexData.normals = normals
  vertexData.uvs = uvs
  vertexData.colors = colors
  vertexData.indices = indices
  return { vertexData, splat }
}
