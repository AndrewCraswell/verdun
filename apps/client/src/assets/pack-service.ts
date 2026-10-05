import { arrivingPack, type AssetPack, openAssetPack, type PackBytes } from "./asset-pack.ts"
import { isPackRequest, type PackPort } from "./pack-protocol.ts"

/**
 * Starts fetching the pack: its bytes as they arrive, and how many there were once they all have. The pack script puts
 * the sounds last, so the level can be built from the files ahead of them while they're still coming.
 */
async function fetchPack(url: string): Promise<{ bytes: ArrayBuffer | PackBytes; done: Promise<number> }> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`asset pack: ${url}: ${response.status} ${response.statusText}`)
  }
  if (!response.body) {
    const whole = await response.arrayBuffer()
    return { bytes: whole, done: Promise.resolve(whole.byteLength) }
  }
  const arriving = arrivingPack(response.body)
  return { bytes: arriving, done: arriving.done }
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
      pack = fetchPack(url).then(async ({ bytes, done }) => {
        const opened = await openAssetPack(bytes, key)
        // Said once the whole pack is in; a pack that doesn't all arrive fails the reads it cut short instead.
        done.then(
          (length) => port.postMessage({ kind: "opened", files: opened.paths.length, bytes: length }),
          () => undefined
        )
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
