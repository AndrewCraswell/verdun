import { VertexBuffer } from "@babylonjs/core/Buffers/buffer"
import type { Material } from "@babylonjs/core/Materials/material"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Observable } from "@babylonjs/core/Misc/observable"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, type ChangedArea, TRENCH_PROFILE } from "@verdun/map"
import { buildChunkGeometry, type ChunkBounds, GROUND_READ_REACH, type SurfaceColors } from "./chunk-geometry.ts"
import { createRenderHeights } from "./render-heights.ts"

/** Vertex attribute holding each vertex's ground texture weights, read by the ground splat material plugin. */
export const SPLAT_ATTRIBUTE = "splat"
/** Vertex attribute holding each vertex's wetness, read by the ground splat material plugin. */
export const WETNESS_ATTRIBUTE = "groundWetness"

/** Terrain is split into square chunks this many metres on a side, so local changes rebuild only nearby chunks. */
export const CHUNK_SIZE_METERS = 64

export interface TerrainChunksOptions {
  /** Ground material. Surface colours arrive as vertex colours, until the level's textures cover the ground. */
  readonly material: Material
  readonly surfaceColors: SurfaceColors
  /** Render one vertex every `renderStep` map samples: 2 gives 1 m vertices on the 0.5 m simulation grid. */
  readonly renderStep?: number
  /**
   * Chunks containing trenches render every sample instead, so the 1.2 m trench floor and 0.5 m fire step keep their
   * shape. Defaults to 1.
   */
  readonly trenchStep?: number
  /**
   * Chunks near the camera's target render every sample too, so the survey's 0.5 m detail shows up close: those whose
   * middle lies within this many metres of the point given to `flush`. Defaults to 90.
   */
  readonly detailRadius?: number
}

export interface TerrainChunks {
  readonly meshes: readonly Mesh[]
  /**
   * Notes that the map's heights or surfaces changed in a world-space rectangle (a shell crater, a dug trench), so that
   * every chunk drawn from the ground there is rebuilt by `flush`. A chunk changed again before then is rebuilt once.
   */
  markChanged(area: ChangedArea): void
  /**
   * Shapes the ground around trenches to sit under the trench kit, once its pieces line the trenches, and rebuilds
   * every chunk, trench chunks too at the coarser render step. See render-heights.ts. The kit comes with the level's
   * ground textures, on the material by then, so from now on the chunks carry no vertex colours.
   */
  shapeForTrenchKit(): void
  /**
   * Rebuilds the chunks that are due, nearest a point (usually the camera's target) first and at most `budget` a call
   * (one by default), so neither a barrage nor panning builds many in a frame: those the map changed under (see
   * `markChanged`), and those whose detail the point's distance changes. Chunks around the point are drawn at every
   * sample, and those further away at the render step again. A chunk both changed and changing detail is built once.
   * Returns how many chunks were rebuilt.
   */
  flush(x: number, z: number, budget?: number): number
  /**
   * Fires with each chunk's mesh as it's rebuilt, by any of the above: for what's drawn from the ground's shape alone,
   * such as the depth map (see post-process.ts), which is drawn again only when something in it changes.
   */
  readonly onRebuilt: Observable<Mesh>
  dispose(): void
}

interface Chunk {
  readonly mesh: Mesh
  readonly bounds: ChunkBounds
  /** Middle of the chunk, in metres. */
  readonly x: number
  readonly z: number
  /** Its step away from the camera: the render step, or every sample for trench chunks drawn without the kit. */
  baseStep: number
  /** The step it's built at now. */
  step: number
  /** The map has changed under it since it was built. */
  changed: boolean
}

/** Deep enough to close the gap between a chunk's every-sample edge and its coarser neighbour's, in metres. */
const SKIRT_DEPTH = 1.5
/** A detailed chunk goes back to the render step only this far beyond the detail radius, so it doesn't flicker. */
const DETAIL_HYSTERESIS = 16

/** World-space boxes around each trench segment, wide enough to include its parapet. */
function trenchBoxes(map: BattlefieldMap): { minX: number; minZ: number; maxX: number; maxZ: number }[] {
  const reach = TRENCH_PROFILE.parapetOuter
  return map.trenches.flatMap((trench) =>
    trench.points.slice(1).map((b, index) => {
      const a = trench.points[index]
      return {
        minX: Math.min(a[0], b[0]) - reach,
        minZ: Math.min(a[1], b[1]) - reach,
        maxX: Math.max(a[0], b[0]) + reach,
        maxZ: Math.max(a[1], b[1]) + reach
      }
    })
  )
}

export function createTerrainChunks(
  scene: Scene,
  map: BattlefieldMap,
  { material, surfaceColors, renderStep = 2, trenchStep = 1, detailRadius = 90 }: TerrainChunksOptions
): TerrainChunks {
  const chunkCells = Math.round(CHUNK_SIZE_METERS / map.cellSize)
  if (!Number.isInteger(renderStep) || renderStep < 1 || chunkCells % renderStep !== 0) {
    throw new RangeError(`Render step must be a positive integer dividing ${chunkCells} cells, got ${renderStep}`)
  }
  const boxes = trenchBoxes(map)
  const chunkColumns = Math.ceil(map.columns / chunkCells)
  const chunkRows = Math.ceil(map.rows / chunkCells)

  const chunks: Chunk[] = []
  for (let chunkRow = 0; chunkRow < chunkRows; chunkRow++) {
    for (let chunkColumn = 0; chunkColumn < chunkColumns; chunkColumn++) {
      const bounds: ChunkBounds = {
        firstColumn: chunkColumn * chunkCells,
        lastColumn: Math.min((chunkColumn + 1) * chunkCells, map.columns),
        firstRow: chunkRow * chunkCells,
        lastRow: Math.min((chunkRow + 1) * chunkCells, map.rows)
      }
      const mesh = new Mesh(`terrain-${chunkColumn}-${chunkRow}`, scene)
      mesh.material = material
      mesh.isPickable = true
      const minX = bounds.firstColumn * map.cellSize
      const maxX = bounds.lastColumn * map.cellSize
      const minZ = bounds.firstRow * map.cellSize
      const maxZ = bounds.lastRow * map.cellSize
      const hasTrench = boxes.some(
        (box) => box.maxX >= minX && box.minX <= maxX && box.maxZ >= minZ && box.minZ <= maxZ
      )
      const step = hasTrench ? trenchStep : renderStep
      chunks.push({ mesh, bounds, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, baseStep: step, step, changed: false })
    }
  }

  let renderHeights = createRenderHeights(map, false)
  const onRebuilt = new Observable<Mesh>()
  // Vertex colours until the level's textures cover the ground (see shapeForTrenchKit).
  let colors: SurfaceColors | null = surfaceColors
  function build(chunk: Chunk, step: number): void {
    const { vertexData, splat, wetness } = buildChunkGeometry(
      map,
      chunk.bounds,
      step,
      colors,
      renderHeights,
      SKIRT_DEPTH
    )
    const { mesh } = chunk
    const { positions, normals, indices } = vertexData
    chunk.changed = false
    if (step === chunk.step && mesh.geometry && positions && normals && indices) {
      // As many vertices and triangles as before: write into the chunk's GPU buffers rather than make new ones. Its
      // bounds follow the ground, which a crater can lower.
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions, true)
      mesh.updateVerticesData(VertexBuffer.NormalKind, normals)
      if (vertexData.colors) {
        mesh.updateVerticesData(VertexBuffer.ColorKind, vertexData.colors)
      }
      mesh.updateVerticesData(SPLAT_ATTRIBUTE, splat)
      mesh.updateVerticesData(WETNESS_ATTRIBUTE, wetness)
      mesh.updateIndices(indices)
    } else {
      chunk.step = step
      vertexData.applyToMesh(mesh, true)
      mesh.setVerticesData(SPLAT_ATTRIBUTE, splat, true, 4)
      mesh.setVerticesData(WETNESS_ATTRIBUTE, wetness, true, 1)
    }
    onRebuilt.notifyObservers(mesh)
  }
  for (const chunk of chunks) {
    build(chunk, chunk.step)
  }
  // How far a change to the map reaches into the drawing, in samples: a vertex reads the ground up to
  // GROUND_READ_REACH away for its wetness, or a step away for its normal, and render heights reach one sample further
  // than the change itself (see markChanged).
  const reach = Math.max(GROUND_READ_REACH, renderStep, trenchStep) + 1

  return {
    meshes: chunks.map((chunk) => chunk.mesh),
    markChanged(area) {
      const minColumn = Math.floor(area.minX / map.cellSize)
      const maxColumn = Math.ceil(area.maxX / map.cellSize)
      const minRow = Math.floor(area.minZ / map.cellSize)
      const maxRow = Math.ceil(area.maxZ / map.cellSize)
      // Render heights near trenches take their neighbours' minimum, so they reach one sample past the change.
      renderHeights.update(minColumn - 1, minRow - 1, maxColumn + 1, maxRow + 1)
      // The chunks beside a crater too, or their wetness and cavity shade would stay as they were up to the seam.
      for (const chunk of chunks) {
        const { firstColumn, lastColumn, firstRow, lastRow } = chunk.bounds
        if (
          lastColumn >= minColumn - reach &&
          firstColumn <= maxColumn + reach &&
          lastRow >= minRow - reach &&
          firstRow <= maxRow + reach
        ) {
          chunk.changed = true
        }
      }
    },
    shapeForTrenchKit() {
      renderHeights = createRenderHeights(map, true)
      // The splat material colours the ground from the texture weights alone. Babylon keeps a vertex buffer until it's
      // removed, and only notices it's gone through the flag.
      colors = null
      for (const chunk of chunks) {
        chunk.mesh.removeVerticesData(VertexBuffer.ColorKind)
        chunk.mesh.useVertexColors = false
      }
      // The kit stands in for the trench's own shape, so trench chunks no longer need every sample.
      for (const chunk of chunks) {
        chunk.baseStep = renderStep
        build(chunk, renderStep)
      }
    },
    flush(x, z, budget = 1) {
      const distanceTo = (chunk: Chunk) => Math.hypot(chunk.x - x, chunk.z - z)
      const wanted = (chunk: Chunk) => {
        const distance = distanceTo(chunk)
        if (distance < detailRadius) {
          return 1
        }
        return distance > detailRadius + DETAIL_HYSTERESIS ? chunk.baseStep : chunk.step
      }
      const due = chunks
        .filter((chunk) => chunk.changed || wanted(chunk) !== chunk.step)
        .sort((a, b) => distanceTo(a) - distanceTo(b))
        .slice(0, budget)
      for (const chunk of due) {
        build(chunk, wanted(chunk))
      }
      return due.length
    },
    onRebuilt,
    dispose() {
      onRebuilt.clear()
      for (const chunk of chunks) {
        chunk.mesh.dispose()
      }
    }
  }
}
