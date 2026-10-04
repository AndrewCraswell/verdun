import type { Color3 } from "@babylonjs/core/Maths/math.color"
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

function heightOf(map: BattlefieldMap, heights: Float32Array, column: number, row: number): number {
  const clampedColumn = Math.min(map.columns, Math.max(0, column))
  const clampedRow = Math.min(map.rows, Math.max(0, row))
  return heights[sampleIndex(map, clampedColumn, clampedRow)]
}

/**
 * Surface normal from the height field by central differences. It depends only on the map, never on which chunk asks,
 * so lighting is continuous across chunk seams.
 */
function normalAt(
  map: BattlefieldMap,
  heights: Float32Array,
  column: number,
  row: number,
  step: number
): [number, number, number] {
  const left = Math.max(0, column - step)
  const right = Math.min(map.columns, column + step)
  const near = Math.max(0, row - step)
  const far = Math.min(map.rows, row + step)
  const slopeX =
    (heightOf(map, heights, right, row) - heightOf(map, heights, left, row)) / ((right - left) * map.cellSize)
  const slopeZ =
    (heightOf(map, heights, column, far) - heightOf(map, heights, column, near)) / ((far - near) * map.cellSize)
  const length = Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ)
  return [-slopeX / length, 1 / length, -slopeZ / length]
}

/**
 * Share of each surface around a sample, in `Surface` order. Reads the map by global sample
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
  return 0.9 + patch * 0.16 + jitter * 0.04
}

/** How far around a sample the ground is compared with it to find hollows, in samples. */
const HOLLOW_REACH = 20

/** Ground holds water where it lies well below the ground around it: 0 on level ground, 1 in a deep hollow. */
function wetnessAt(map: BattlefieldMap, column: number, row: number): number {
  const here = heightOf(map, map.heights, column, row)
  const around =
    (heightOf(map, map.heights, column - HOLLOW_REACH, row) +
      heightOf(map, map.heights, column + HOLLOW_REACH, row) +
      heightOf(map, map.heights, column, row - HOLLOW_REACH) +
      heightOf(map, map.heights, column, row + HOLLOW_REACH)) /
    4
  return Math.min(1, Math.max(0, (around - here - 0.4) / 1.4))
}

/** One flat colour per surface: Synty-style terrain for version 1 (see docs/assets/art-direction.md). */
export type SurfaceColors = Readonly<Record<Surface, Color3>>

export interface ChunkGeometry {
  readonly vertexData: VertexData
  /**
   * Per-vertex ground texture weights for the splat material, four floats each: grass, mud and chalk shares (churned
   * ground is the remainder), then the brightness variation.
   */
  readonly splat: Float32Array
  /** Per-vertex wetness from 0 to 1: muddy ground lying well below the ground around it. */
  readonly wetness: Float32Array
}

/**
 * Builds one terrain chunk: positions, height-field normals, world-space UVs, vertex colours that blend the surface
 * palette across patch edges with a gentle brightness variation, and the same blend as texture weights. `step` thins
 * the 0.5 m simulation grid for rendering. `ground` replaces the map's heights for drawing and darkens some samples;
 * see render-heights.ts.
 */
export function buildChunkGeometry(
  map: BattlefieldMap,
  bounds: ChunkBounds,
  step: number,
  surfaceColors: SurfaceColors,
  ground?: { readonly heights: Float32Array; readonly shade: Float32Array }
): ChunkGeometry {
  const heights = ground?.heights ?? map.heights
  const columns = sampleSteps(bounds.firstColumn, bounds.lastColumn, step)
  const rows = sampleSteps(bounds.firstRow, bounds.lastRow, step)

  const positions: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  const colors: number[] = []
  const splat = new Float32Array(columns.length * rows.length * 4)
  const wetness = new Float32Array(columns.length * rows.length)
  const palette = [Surface.Grass, Surface.Mud, Surface.Chalk, Surface.Churned].map((surface) => surfaceColors[surface])
  for (const row of rows) {
    for (const column of columns) {
      const x = column * map.cellSize
      const z = row * map.cellSize
      const index = sampleIndex(map, column, row)
      positions.push(x, heights[index], z)
      normals.push(...normalAt(map, heights, column, row, step))
      uvs.push(x / UV_TILE_METERS, z / UV_TILE_METERS)
      const shade = shadeAt(column, row, x, z) * (ground?.shade[index] ?? 1)
      const weights = surfaceWeights(map, column, row)
      let r = 0
      let g = 0
      let b = 0
      weights.forEach((weight, surface) => {
        const color = palette[surface]
        if (color && weight > 0) {
          r += color.r * weight
          g += color.g * weight
          b += color.b * weight
        }
      })
      colors.push(r * shade, g * shade, b * shade, 1)
      const vertex = colors.length - 4
      splat[vertex] = weights[Surface.Grass] ?? 0
      splat[vertex + 1] = weights[Surface.Mud] ?? 0
      splat[vertex + 2] = weights[Surface.Chalk] ?? 0
      splat[vertex + 3] = shade
      const muddy = (weights[Surface.Mud] ?? 0) + (weights[Surface.Churned] ?? 0)
      wetness[vertex / 4] = wetnessAt(map, column, row) * muddy
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
  return { vertexData, splat, wetness }
}
