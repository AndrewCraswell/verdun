import { makeTile, type TileRequest } from "./tile-mesh.ts"
import type { FromTileWorker } from "./tile-thread.ts"

/**
 * Builds the theatre's ground tiles off the page's thread (tile-thread.ts): each request's heights fetched and its grid
 * built, the buffers handed back rather than copied, so the editor keeps drawing while the ground comes in.
 */
const answer = (message: FromTileWorker, transfer: Transferable[] = []) => self.postMessage(message, transfer)

self.addEventListener("message", (event: MessageEvent<TileRequest>) => {
  const request = event.data
  makeTile(request)
    .then((tile) =>
      answer({ kind: "tile", tile }, [tile.positions.buffer, tile.uvs.buffer, tile.normals.buffer, tile.indices.buffer])
    )
    .catch((error: unknown) =>
      answer({ kind: "failed", id: request.id, message: error instanceof Error ? error.message : String(error) })
    )
})
