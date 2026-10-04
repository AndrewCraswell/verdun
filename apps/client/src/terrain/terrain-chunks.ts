import type { Material } from "@babylonjs/core/Materials/material"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
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
  dispose(): void
}

interface Chunk {
  readonly mesh: Mesh
  readonly bounds: ChunkBounds
  step: number
}

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
  { material, surfaceColors, renderStep = 2, trenchStep = 1 }: TerrainChunksOptions
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
      chunks.push({ mesh, bounds, step: hasTrench ? trenchStep : renderStep })
    }
  }

  let renderHeights = createRenderHeights(map, false)
  function build(chunk: Chunk): void {
    const { vertexData, splat, wetness } = buildChunkGeometry(
      map,
      chunk.bounds,
      chunk.step,
      surfaceColors,
      renderHeights
    )
    vertexData.applyToMesh(chunk.mesh, true)
    chunk.mesh.setVerticesData(SPLAT_ATTRIBUTE, splat, true, 4)
    chunk.mesh.setVerticesData(WETNESS_ATTRIBUTE, wetness, true, 1)
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
        chunk.step = renderStep
        build(chunk)
      }
    },
    dispose() {
      for (const chunk of chunks) {
        chunk.mesh.dispose()
      }
    }
  }
}
