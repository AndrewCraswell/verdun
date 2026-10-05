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
function writeNormal(
  map: BattlefieldMap,
  heights: Float32Array,
  column: number,
  row: number,
  step: number,
  out: Float32Array,
  offset: number
): void {
  const left = Math.max(0, column - step)
  const right = Math.min(map.columns, column + step)
  const near = Math.max(0, row - step)
  const far = Math.min(map.rows, row + step)
  const slopeX =
    (heightOf(map, heights, right, row) - heightOf(map, heights, left, row)) / ((right - left) * map.cellSize)
  const slopeZ =
    (heightOf(map, heights, column, far) - heightOf(map, heights, column, near)) / ((far - near) * map.cellSize)
  const length = Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ)
  out[offset] = -slopeX / length
  out[offset + 1] = 1 / length
  out[offset + 2] = -slopeZ / length
}

/** Samples the blend reads along each axis: every `BLEND_STRIDE` within `BLEND_RADIUS`. */
const BLEND_SAMPLES = (2 * BLEND_RADIUS) / BLEND_STRIDE + 1

/**
 * Share of each surface around every vertex of a chunk, four floats per vertex in `Surface` order. Reads the map by
 * global sample position, never by chunk, so neighbouring chunks agree along their shared edge. Counts along rows
 * first, then sums the rows, which reads each sample once per row instead of once per vertex around it.
 */
function surfaceShares(map: BattlefieldMap, columns: readonly number[], rows: readonly number[]): Float32Array {
  const width = columns.length * SURFACE_COUNT
  const share = 1 / (BLEND_SAMPLES * BLEND_SAMPLES)
  // Every map row the blend reads, from the first vertex row's reach to the last's, counted once.
  const firstRow = Math.max(0, (rows[0] ?? 0) - BLEND_RADIUS)
  const lastRow = Math.min(map.rows, (rows.at(-1) ?? 0) + BLEND_RADIUS)
  const counts = new Float32Array((lastRow - firstRow + 1) * width)
  for (let row = firstRow; row <= lastRow; row++) {
    const rowStart = (row - firstRow) * width
    for (let index = 0; index < columns.length; index++) {
      const column = columns[index] ?? 0
      for (let dx = -BLEND_RADIUS; dx <= BLEND_RADIUS; dx += BLEND_STRIDE) {
        const stored = map.surfaces[sampleIndex(map, Math.min(map.columns, Math.max(0, column + dx)), row)]
        counts[rowStart + index * SURFACE_COUNT + (isSurface(stored) ? stored : Surface.Mud)] += share
      }
    }
  }
  const shares = new Float32Array(rows.length * width)
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex] ?? 0
    const out = rowIndex * width
    for (let dz = -BLEND_RADIUS; dz <= BLEND_RADIUS; dz += BLEND_STRIDE) {
      const from = (Math.min(map.rows, Math.max(0, row + dz)) - firstRow) * width
      for (let index = 0; index < width; index++) {
        shares[out + index] += counts[from + index] ?? 0
      }
    }
  }
  return shares
}

/** Brightness multiplier: broad 40 m patches of lighter and darker ground, plus slight per-vertex jitter. */
function shadeAt(column: number, row: number, x: number, z: number): number {
  const patch = valueNoise(PATCH_SEED, x, z, PATCH_SCALE_METERS)
  const jitter = latticeValue(SHADE_SEED, column, row)
  return 0.9 + patch * 0.16 + jitter * 0.04
}

/**
 * Cavity occlusion: ground lying below the ground a metre or two round it (crater bowls, the foot of a bank) sees less
 * sky and darkens, by up to `CAVITY_DARKEN`; crests and lips catch a little more light. Samples are compared with the
 * ground `CAVITY_REACH` samples away, near and far.
 */
const CAVITY_REACH = [3, 6] as const
const CAVITY_DARKEN = 0.26
const CREST_LIGHTEN = 0.1

function cavityAt(map: BattlefieldMap, heights: Float32Array, column: number, row: number): number {
  const here = heightOf(map, heights, column, row)
  let around = 0
  for (const reach of CAVITY_REACH) {
    around +=
      heightOf(map, heights, column - reach, row) +
      heightOf(map, heights, column + reach, row) +
      heightOf(map, heights, column, row - reach) +
      heightOf(map, heights, column, row + reach)
  }
  const depth = around / (4 * CAVITY_REACH.length) - here
  const hollow = Math.min(1, Math.max(0, depth / 0.9))
  const crest = Math.min(1, Math.max(0, -depth / 0.5))
  return 1 - CAVITY_DARKEN * hollow * (2 - hollow) + CREST_LIGHTEN * crest
}

/** How far around a sample the ground is compared with it to find hollows, in samples. */
const HOLLOW_REACH = 20

/**
 * How far from a vertex building it reads the map, in samples, besides its normal, which looks one step away: its
 * wetness compares the ground `HOLLOW_REACH` away, further than its cavity or its surface blend look. A change to the
 * map reaches the drawing of every vertex this close to it.
 */
export const GROUND_READ_REACH = Math.max(HOLLOW_REACH, ...CAVITY_REACH, BLEND_RADIUS)

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
 * The grid's vertices along each of the chunk's four edges, in order. Skirts hang from these: between chunks, and along
 * the map's own edge, where the backdrop beyond meets it.
 */
function chunkEdges(columnCount: number, rowCount: number): number[][] {
  const along = (count: number, vertex: (index: number) => number) => Array.from({ length: count }, (_, i) => vertex(i))
  return [
    along(columnCount, (i) => i),
    along(columnCount, (i) => (rowCount - 1) * columnCount + i),
    along(rowCount, (i) => i * columnCount),
    along(rowCount, (i) => i * columnCount + columnCount - 1)
  ]
}

/**
 * Builds one terrain chunk: positions, height-field normals, and texture weights that blend the surfaces across patch
 * edges, with a gentle brightness variation. Given `surfaceColors`, it also colours each vertex with the same blend of
 * the palette, for a plain material; null leaves the colours out, for a material that textures the ground from the
 * weights (see ground-splat-plugin.ts), saving four floats a vertex to build and upload. There are no texture
 * coordinates: the ground's textures are laid on by world position. `step` thins the 0.5 m simulation grid for
 * rendering. `ground` replaces the map's heights for drawing and darkens some samples; see render-heights.ts.
 *
 * `skirtDepth` hangs a curtain of ground that deep below every edge of the chunk. A neighbour drawn at a coarser step
 * cuts its edge straight across where this one follows every sample, leaving slivers of sky between them, and the
 * backdrop beyond the map meets its edge only every 10 m; the skirt fills both.
 */
export function buildChunkGeometry(
  map: BattlefieldMap,
  bounds: ChunkBounds,
  step: number,
  surfaceColors: SurfaceColors | null,
  ground?: { readonly heights: Float32Array; readonly shade: Float32Array },
  skirtDepth = 0
): ChunkGeometry {
  const heights = ground?.heights ?? map.heights
  const columns = sampleSteps(bounds.firstColumn, bounds.lastColumn, step)
  const rows = sampleSteps(bounds.firstRow, bounds.lastRow, step)
  const edges = skirtDepth > 0 ? chunkEdges(columns.length, rows.length) : []
  const vertexCount = columns.length * rows.length + edges.reduce((total, edge) => total + edge.length, 0)

  // Typed arrays filled in place: a detailed chunk is 17,000 vertices, rebuilt while the camera pans.
  const positions = new Float32Array(vertexCount * 3)
  const normals = new Float32Array(vertexCount * 3)
  const splat = new Float32Array(vertexCount * 4)
  const wetness = new Float32Array(vertexCount)
  const palette = surfaceColors
    ? [Surface.Grass, Surface.Mud, Surface.Chalk, Surface.Churned].map((surface) => surfaceColors[surface])
    : null
  const colors = palette ? new Float32Array(vertexCount * 4) : null
  const shares = surfaceShares(map, columns, rows)
  let vertex = 0
  for (const row of rows) {
    for (const column of columns) {
      const x = column * map.cellSize
      const z = row * map.cellSize
      const index = sampleIndex(map, column, row)
      positions[vertex * 3] = x
      positions[vertex * 3 + 1] = heights[index] ?? 0
      positions[vertex * 3 + 2] = z
      writeNormal(map, heights, column, row, step, normals, vertex * 3)
      const shade = shadeAt(column, row, x, z) * (ground?.shade[index] ?? 1) * cavityAt(map, heights, column, row)
      const shared = vertex * SURFACE_COUNT
      if (colors && palette) {
        let r = 0
        let g = 0
        let b = 0
        for (let surface = 0; surface < SURFACE_COUNT; surface++) {
          const color = palette[surface]
          const weight = shares[shared + surface] ?? 0
          if (color && weight > 0) {
            r += color.r * weight
            g += color.g * weight
            b += color.b * weight
          }
        }
        colors[vertex * 4] = r * shade
        colors[vertex * 4 + 1] = g * shade
        colors[vertex * 4 + 2] = b * shade
        colors[vertex * 4 + 3] = 1
      }
      splat[vertex * 4] = shares[shared + Surface.Grass] ?? 0
      splat[vertex * 4 + 1] = shares[shared + Surface.Mud] ?? 0
      splat[vertex * 4 + 2] = shares[shared + Surface.Chalk] ?? 0
      splat[vertex * 4 + 3] = shade
      const muddy = (shares[shared + Surface.Mud] ?? 0) + (shares[shared + Surface.Churned] ?? 0)
      wetness[vertex] = wetnessAt(map, column, row) * muddy
      vertex += 1
    }
  }

  // Rows run toward +z, so triangles wind to face up in Babylon's left-handed system. Each quad splits along the
  // diagonal whose ends are nearer in height, which follows ridges and crater walls instead of cutting across them in
  // a staircase.
  const rowLength = columns.length
  const gridQuads = (rowLength - 1) * (rows.length - 1)
  const skirtQuads = edges.reduce((total, edge) => total + edge.length - 1, 0)
  const indices = new Uint32Array(gridQuads * 6 + skirtQuads * 12)
  let corner = 0
  for (let row = 0; row < rows.length - 1; row++) {
    for (let column = 0; column < rowLength - 1; column++) {
      const nearLeft = row * rowLength + column
      const nearRight = nearLeft + 1
      const farLeft = nearLeft + rowLength
      const farRight = farLeft + 1
      const heightOfVertex = (vertexIndex: number) => positions[vertexIndex * 3 + 1] ?? 0
      const across = Math.abs(heightOfVertex(nearRight) - heightOfVertex(farLeft))
      const along = Math.abs(heightOfVertex(nearLeft) - heightOfVertex(farRight))
      if (across <= along) {
        indices[corner++] = nearRight
        indices[corner++] = farRight
        indices[corner++] = farLeft
        indices[corner++] = nearLeft
        indices[corner++] = nearRight
        indices[corner++] = farLeft
      } else {
        indices[corner++] = nearLeft
        indices[corner++] = farRight
        indices[corner++] = farLeft
        indices[corner++] = nearLeft
        indices[corner++] = nearRight
        indices[corner++] = farRight
      }
    }
  }

  // Skirt vertices copy their edge vertex, lowered. Both windings, so the skirt shows from either side.
  for (const edge of edges) {
    const first = vertex
    for (const top of edge) {
      positions.set(positions.subarray(top * 3, top * 3 + 3), vertex * 3)
      positions[vertex * 3 + 1] = (positions[vertex * 3 + 1] ?? 0) - skirtDepth
      normals.set(normals.subarray(top * 3, top * 3 + 3), vertex * 3)
      colors?.set(colors.subarray(top * 4, top * 4 + 4), vertex * 4)
      splat.set(splat.subarray(top * 4, top * 4 + 4), vertex * 4)
      wetness[vertex] = wetness[top] ?? 0
      vertex += 1
    }
    for (let index = 0; index < edge.length - 1; index++) {
      const top = edge[index] ?? 0
      const nextTop = edge[index + 1] ?? 0
      const bottom = first + index
      const nextBottom = bottom + 1
      indices.set(
        [top, nextTop, nextBottom, top, nextBottom, bottom, top, nextBottom, nextTop, top, bottom, nextBottom],
        corner
      )
      corner += 12
    }
  }

  const vertexData = new VertexData()
  vertexData.positions = positions
  vertexData.normals = normals
  vertexData.colors = colors
  vertexData.indices = indices
  return { vertexData, splat, wetness }
}
