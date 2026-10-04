import type { KitFiles } from "../level/kit-files.ts"
import { isPackReply, type PackPort, type PackSource } from "./pack-protocol.ts"

interface Pending {
  resolve(data: ArrayBuffer): void
  reject(error: Error): void
}

/**
 * Kit files read from an encrypted asset pack by the pack worker on `port`. The source may still be on its way, as in
 * dev builds, which fetch it from the dev server; reads wait for it, and fail if it can't be had.
 */
export function packKitFiles(port: PackPort, source: PackSource | Promise<PackSource>): KitFiles {
  const pending = new Map<number, Pending>()
  let nextId = 0

  port.addEventListener("message", ({ data: reply }) => {
    if (!isPackReply(reply)) {
      return
    }
    if (reply.kind === "opened") {
      // oxlint-disable-next-line no-console -- confirms in the console that the art came from the pack
      console.info(`Level kit: opened the asset pack, ${reply.files} files, ${(reply.bytes / 2 ** 20).toFixed(1)} MiB`)
      return
    }
    const request = pending.get(reply.id)
    pending.delete(reply.id)
    if (reply.kind === "file") {
      request?.resolve(reply.data)
    } else {
      request?.reject(new Error(reply.error))
    }
  })

  const opened = Promise.resolve(source).then(({ url, key }) => port.postMessage({ kind: "open", url, key }))

  return {
    async read(path) {
      await opened
      const id = nextId++
      return new Promise<ArrayBuffer>((resolve, reject) => {
        pending.set(id, { resolve, reject })
        port.postMessage({ kind: "read", id, path })
      })
    }
  }
}
