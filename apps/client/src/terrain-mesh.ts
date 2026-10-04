import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import { type BattlefieldMap, sampleIndex } from "@verdun/map"

/**
 * Builds terrain geometry from the map's height grid, taking every `step`-th sample. The simulation grid is far finer
 * than the eye needs at this camera distance; chunked meshes with detail levels replace this in milestone M1.
 */
export function buildTerrainVertexData(map: BattlefieldMap, step: number): VertexData {
  if (!Number.isInteger(step) || step < 1) {
    throw new RangeError(`Terrain step must be a positive integer, got ${step}`)
  }
  const columns = Math.floor(map.columns / step)
  const rows = Math.floor(map.rows / step)
  const rowLength = columns + 1

  const positions: number[] = []
  const uvs: number[] = []
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      const height = map.heights[sampleIndex(map, column * step, row * step)]
      positions.push(column * step * map.cellSize, height, row * step * map.cellSize)
      uvs.push(column / columns, row / rows)
    }
  }

  // Rows run toward +z, so triangles wind to face up in Babylon's left-handed system.
  const indices: number[] = []
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const nearLeft = row * rowLength + column
      const nearRight = nearLeft + 1
      const farLeft = nearLeft + rowLength
      const farRight = farLeft + 1
      indices.push(nearRight, farRight, farLeft, nearLeft, nearRight, farLeft)
    }
  }

  const normals: number[] = []
  VertexData.ComputeNormals(positions, indices, normals)

  const vertexData = new VertexData()
  vertexData.positions = positions
  vertexData.indices = indices
  vertexData.normals = normals
  vertexData.uvs = uvs
  return vertexData
}
