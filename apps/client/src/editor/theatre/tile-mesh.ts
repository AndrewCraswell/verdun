import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"

/**
 * The theatre's ground tiles as buffers, built off the page's thread (tile-worker.ts): the heights fetched from IGN's
 * elevation service through the dev server, LiDAR HD with RGE ALTI filling its gaps, and the grid of the tile made from
 * them, skirts, map coordinates and lighting normals and all.
 */

/** A box of the theatre, in its own metres. */
export interface TileBox {
  readonly x0: number
  readonly z0: number
  readonly x1: number
  readonly z1: number
}

/** What a tile is built from: its box, the elevation requests for it, its grid's size and the theatre's base height. */
export interface TileRequest {
  readonly id: number
  readonly box: TileBox
  readonly samples: number
  /** The LiDAR HD request, and the RGE ALTI one that fills its gaps, each `samples` by `samples`, north row first. */
  readonly lidarUrl: string
  readonly fallbackUrl: string
  readonly base: number
  readonly skirt: number
}

export interface TileBuffers {
  readonly id: number
  readonly positions: Float32Array
  readonly uvs: Float32Array
  readonly normals: Float32Array
  readonly indices: Uint32Array
}

const missing = (height: number | undefined) => height === undefined || !Number.isFinite(height) || height < -100

/** Fetches a grid of heights, north row first as IGN sends them, LiDAR HD's with RGE ALTI's in its gaps. */
async function fetchHeights(request: TileRequest): Promise<Float32Array> {
  const count = request.samples * request.samples
  const grid = async (url: string) => {
    const answer = await fetch(url)
    if (!answer.ok) {
      throw new Error(`Elevation ${answer.status}`)
    }
    return new Float32Array(await answer.arrayBuffer())
  }
  const lidar = await grid(request.lidarUrl)
  if (lidar.length === count && !lidar.some(missing)) {
    return lidar
  }
  const fallback = await grid(request.fallbackUrl)
  return lidar.length === count
    ? lidar.map((height, index) => (missing(height) ? (fallback[index] ?? 0) : height))
    : fallback
}

/**
 * A tile's grid from its heights (north row first): positions over its box with heights above the theatre's base, map
 * coordinates spanning the box, skirts hanging `skirt` metres below its edges so no crack shows against a coarser
 * neighbour, and normals for its lighting.
 */
export function buildTile(request: TileRequest, raw: Float32Array): TileBuffers {
  const { box, samples, base, skirt } = request
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const vertex = (column: number, row: number, drop: number) => {
    const x = box.x0 + ((box.x1 - box.x0) * column) / (samples - 1)
    const z = box.z0 + ((box.z1 - box.z0) * row) / (samples - 1)
    const height = (raw[(samples - 1 - row) * samples + column] ?? base) - base
    positions.push(x, height - drop, z)
    uvs.push(column / (samples - 1), row / (samples - 1))
    return positions.length / 3 - 1
  }
  for (let row = 0; row < samples; row++) {
    for (let column = 0; column < samples; column++) {
      vertex(column, row, 0)
    }
  }
  for (let row = 0; row < samples - 1; row++) {
    for (let column = 0; column < samples - 1; column++) {
      const a = row * samples + column
      indices.push(a, a + 1, a + samples, a + 1, a + samples + 1, a + samples)
    }
  }
  // Skirts along the four edges, both faces drawn, hanging below them.
  const edge = (points: (readonly [number, number])[]) => {
    for (let index = 1; index < points.length; index++) {
      const [ac, ar] = points[index - 1] ?? [0, 0]
      const [bc, br] = points[index] ?? [0, 0]
      const topA = ar * samples + ac
      const topB = br * samples + bc
      const lowA = vertex(ac, ar, skirt)
      const lowB = vertex(bc, br, skirt)
      indices.push(topA, lowA, topB, topB, lowA, lowB, topA, topB, lowA, topB, lowB, lowA)
    }
  }
  const line = (at: (index: number) => readonly [number, number]) => Array.from({ length: samples }, (_, i) => at(i))
  edge(line((column) => [column, 0]))
  edge(line((column) => [column, samples - 1]))
  edge(line((row) => [0, row]))
  edge(line((row) => [samples - 1, row]))
  const normals: number[] = []
  VertexData.ComputeNormals(positions, indices, normals)
  return {
    id: request.id,
    positions: Float32Array.from(positions),
    uvs: Float32Array.from(uvs),
    normals: Float32Array.from(normals),
    indices: Uint32Array.from(indices)
  }
}

/** Fetches a tile's heights and builds it: what the worker runs for each request. */
export async function makeTile(request: TileRequest): Promise<TileBuffers> {
  return buildTile(request, await fetchHeights(request))
}
