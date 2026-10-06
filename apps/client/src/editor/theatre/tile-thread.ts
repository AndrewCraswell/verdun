import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import type { Scene } from "@babylonjs/core/scene"
import type { TileBuffers, TileRequest } from "./tile-mesh.ts"

/** What the tile worker (tile-worker.ts) answers each request with. */
export type FromTileWorker =
  | { readonly kind: "tile"; readonly tile: TileBuffers }
  | { readonly kind: "failed"; readonly id: number; readonly message: string }

/** Builds ground tiles in a worker: `build` resolves with the tile's mesh, made from buffers the worker built. */
export interface TileThread {
  build(scene: Scene, name: string, request: Omit<TileRequest, "id">): Promise<Mesh>
}

export function createTileThread(): TileThread {
  const worker = new Worker(new URL("./tile-worker.ts", import.meta.url), { type: "module" })
  const waiting = new Map<number, { resolve: (tile: TileBuffers) => void; reject: (error: Error) => void }>()
  let next = 1
  worker.addEventListener("message", (event: MessageEvent<FromTileWorker>) => {
    const answer = event.data
    const id = answer.kind === "tile" ? answer.tile.id : answer.id
    const asked = waiting.get(id)
    waiting.delete(id)
    if (answer.kind === "tile") {
      asked?.resolve(answer.tile)
    } else {
      asked?.reject(new Error(answer.message))
    }
  })
  return {
    async build(scene, name, request) {
      const id = next++
      const tile = await new Promise<TileBuffers>((resolve, reject) => {
        waiting.set(id, { resolve, reject })
        worker.postMessage({ ...request, id })
      })
      const mesh = new Mesh(name, scene)
      const data = new VertexData()
      data.positions = tile.positions
      data.uvs = tile.uvs
      data.normals = tile.normals
      data.indices = tile.indices
      data.applyToMesh(mesh)
      return mesh
    }
  }
}
