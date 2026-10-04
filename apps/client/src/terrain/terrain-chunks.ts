import type { Material } from "@babylonjs/core/Materials/material"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import type { Scene } from "@babylonjs/core/scene"
import type { BattlefieldMap } from "@verdun/map"
import { buildChunkGeometry, type ChunkBounds } from "./chunk-geometry.ts"
import { SPLAT_KIND } from "./terrain-splat-plugin.ts"

/** Terrain is split into square chunks this many metres on a side, so local changes rebuild only nearby chunks. */
export const CHUNK_SIZE_METERS = 64

export interface TerrainChunksOptions {
  /** Ground material; expected to read the per-vertex splat weights (see TerrainSplatPlugin). */
  readonly material: Material
  /** Render one vertex every `renderStep` map samples: 2 gives 1 m vertices on the 0.5 m simulation grid. */
  readonly renderStep?: number
}

export interface TerrainChunks {
  readonly meshes: readonly Mesh[]
  /**
   * Rebuilds every chunk touching a world-space rectangle, after the map's heights or surfaces changed there (a shell
   * crater, a dug trench). Returns how many chunks were rebuilt.
   */
  rebuildRegion(minX: number, minZ: number, maxX: number, maxZ: number): number
  dispose(): void
}

interface Chunk {
  readonly mesh: Mesh
  readonly bounds: ChunkBounds
}

export function createTerrainChunks(
  scene: Scene,
  map: BattlefieldMap,
  { material, renderStep = 2 }: TerrainChunksOptions
): TerrainChunks {
  const chunkCells = Math.round(CHUNK_SIZE_METERS / map.cellSize)
  if (!Number.isInteger(renderStep) || renderStep < 1 || chunkCells % renderStep !== 0) {
    throw new RangeError(`Render step must be a positive integer dividing ${chunkCells} cells, got ${renderStep}`)
  }
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
      chunks.push({ mesh, bounds })
    }
  }

  function build(chunk: Chunk): void {
    const { vertexData, splat } = buildChunkGeometry(map, chunk.bounds, renderStep)
    vertexData.applyToMesh(chunk.mesh, true)
    chunk.mesh.setVerticesData(SPLAT_KIND, splat, true, 4)
  }
  chunks.forEach(build)

  return {
    meshes: chunks.map((chunk) => chunk.mesh),
    rebuildRegion(minX, minZ, maxX, maxZ) {
      // Normals read neighbouring samples one render step away, so a change just outside a chunk can still affect it.
      const margin = renderStep
      const minColumn = Math.floor(minX / map.cellSize) - margin
      const maxColumn = Math.ceil(maxX / map.cellSize) + margin
      const minRow = Math.floor(minZ / map.cellSize) - margin
      const maxRow = Math.ceil(maxZ / map.cellSize) + margin
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
    dispose() {
      for (const chunk of chunks) {
        chunk.mesh.dispose()
      }
    }
  }
}
