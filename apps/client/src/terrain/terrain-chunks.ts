import type { Material } from "@babylonjs/core/Materials/material"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Observable } from "@babylonjs/core/Misc/observable"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, TRENCH_PROFILE } from "@verdun/map"
import { buildChunkGeometry, type ChunkBounds, type SurfaceColors } from "./chunk-geometry.ts"
import { createRenderHeights } from "./render-heights.ts"

/** Vertex attribute holding each vertex's ground texture weights, read by the ground splat material plugin. */
export const SPLAT_ATTRIBUTE = "splat"
/** Vertex attribute holding each vertex's wetness, read by the ground splat material plugin. */
export const WETNESS_ATTRIBUTE = "groundWetness"

/** Terrain is split into square chunks this many metres on a side, so local changes rebuild only nearby chunks. */
export const CHUNK_SIZE_METERS = 64

export interface TerrainChunksOptions {
  /** Ground material. Surface colours arrive as vertex colours. */
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
   * middle lies within this many metres of the point given to `refine`. Defaults to 90.
   */
  readonly detailRadius?: number
}

export interface TerrainChunks {
  readonly meshes: readonly Mesh[]
  /**
   * Rebuilds every chunk touching a world-space rectangle, after the map's heights or surfaces changed there (a shell
   * crater, a dug trench). Returns how many chunks were rebuilt.
   */
  rebuildRegion(minX: number, minZ: number, maxX: number, maxZ: number): number
  /**
   * Shapes the ground around trenches to sit under the trench kit, once its pieces line the trenches, and rebuilds
   * every chunk, trench chunks too at the coarser render step. See render-heights.ts.
   */
  shapeForTrenchKit(): void
  /**
   * Draws the chunks around a point, usually the camera's target, at every sample, and those further away at the render
   * step again. Rebuilds at most `budget` chunks a call, nearest first, so panning spreads the work over frames.
   * Returns how many chunks were rebuilt.
   */
  refine(x: number, z: number, budget?: number): number
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
      chunks.push({ mesh, bounds, x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, baseStep: step, step })
    }
  }

  let renderHeights = createRenderHeights(map, false)
  const onRebuilt = new Observable<Mesh>()
  function build(chunk: Chunk): void {
    const { vertexData, splat, wetness } = buildChunkGeometry(
      map,
      chunk.bounds,
      chunk.step,
      surfaceColors,
      renderHeights,
      SKIRT_DEPTH
    )
    vertexData.applyToMesh(chunk.mesh, true)
    chunk.mesh.setVerticesData(SPLAT_ATTRIBUTE, splat, true, 4)
    chunk.mesh.setVerticesData(WETNESS_ATTRIBUTE, wetness, true, 1)
    onRebuilt.notifyObservers(chunk.mesh)
  }
  chunks.forEach(build)

  return {
    meshes: chunks.map((chunk) => chunk.mesh),
    rebuildRegion(minX, minZ, maxX, maxZ) {
      // Normals read neighbouring samples one render step away, so a change just outside a chunk can still affect it.
      const margin = Math.max(renderStep, trenchStep)
      const minColumn = Math.floor(minX / map.cellSize) - margin
      const maxColumn = Math.ceil(maxX / map.cellSize) + margin
      const minRow = Math.floor(minZ / map.cellSize) - margin
      const maxRow = Math.ceil(maxZ / map.cellSize) + margin
      // Render heights near trenches take their neighbours' minimum, so they reach one sample past the change.
      renderHeights.update(minColumn - 1, minRow - 1, maxColumn + 1, maxRow + 1)
      let rebuilt = 0
      for (const chunk of chunks) {
        const { firstColumn, lastColumn, firstRow, lastRow } = chunk.bounds
        if (lastColumn >= minColumn && firstColumn <= maxColumn && lastRow >= minRow && firstRow <= maxRow) {
          build(chunk)
          rebuilt += 1
        }
      }
      return rebuilt
    },
    shapeForTrenchKit() {
      renderHeights = createRenderHeights(map, true)
      // The kit stands in for the trench's own shape, so trench chunks no longer need every sample.
      for (const chunk of chunks) {
        chunk.baseStep = renderStep
        chunk.step = renderStep
        build(chunk)
      }
    },
    refine(x, z, budget = 1) {
      const distanceTo = (chunk: Chunk) => Math.hypot(chunk.x - x, chunk.z - z)
      const wanted = (chunk: Chunk) => {
        const distance = distanceTo(chunk)
        if (distance < detailRadius) {
          return 1
        }
        return distance > detailRadius + DETAIL_HYSTERESIS ? chunk.baseStep : chunk.step
      }
      const stale = chunks
        .filter((chunk) => wanted(chunk) !== chunk.step)
        .sort((a, b) => distanceTo(a) - distanceTo(b))
        .slice(0, budget)
      for (const chunk of stale) {
        chunk.step = wanted(chunk)
        build(chunk)
      }
      return stale.length
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
