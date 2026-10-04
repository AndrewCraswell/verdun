import { type AssetPack, openAssetPack } from "./asset-pack.ts"
import { isPackRequest, type PackPort } from "./pack-protocol.ts"

async function fetchPack(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`asset pack: ${url}: ${response.status} ${response.statusText}`)
  }
  return response.arrayBuffer()
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The asset pack worker's work: fetches and opens the pack it is asked to, then answers reads from it, handing each
 * decrypted file over without a copy. Decryption stays off the page's thread, and the key and plaintext index stay in
 * the worker. Reads sent before the pack opens wait for it; if it fails to open, they fail with its error.
 */
export function servePack(port: PackPort): void {
  let pack: Promise<AssetPack> | null = null
  port.addEventListener("message", ({ data: request }) => {
    if (!isPackRequest(request)) {
      return
    }
    if (request.kind === "open") {
      const { url, key } = request
      pack = fetchPack(url).then(async (bytes) => {
        const opened = await openAssetPack(bytes, key)
        port.postMessage({ kind: "opened", files: opened.paths.length, bytes: bytes.byteLength })
        return opened
      })
      // Each read reports the failure; this only keeps it from being an unhandled rejection.
      pack.catch(() => undefined)
      return
    }
    const { id, path } = request
    const opening = pack ?? Promise.reject(new Error("asset pack: read before open"))
    opening
      .then((opened) => opened.read(path))
      .then(
        (data) => port.postMessage({ kind: "file", id, data }, { transfer: [data] }),
        (error: unknown) => port.postMessage({ kind: "error", id, error: describe(error) })
      )
  })
}
