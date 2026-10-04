import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { packKitFiles } from "./pack-kit-files.ts"
import type { PackPort, PackReply } from "./pack-protocol.ts"
import { servePack } from "./pack-service.ts"
import { buildTestPack, TEST_KIT, type TestPack } from "./test-pack.ts"

let built: TestPack
const ports: MessagePort[] = []

beforeAll(() => {
  built = buildTestPack()
})

afterEach(() => {
  for (const port of ports.splice(0)) {
    port.close()
  }
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A connected pair of ports, as between the page and the pack worker. */
function channel(): [MessagePort, MessagePort] {
  const { port1, port2 } = new MessageChannel()
  port1.start()
  port2.start()
  ports.push(port1, port2)
  return [port1, port2]
}

/** Serves the built pack at /pack.bin and nothing else. */
function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === "/pack.bin" ? new Response(built.pack.slice(0)) : new Response(null, { status: 404, statusText: "Nope" })
    )
  )
}

/** The next reply the worker side posts on `port`. */
function nextReply(port: PackPort): Promise<unknown> {
  return new Promise((resolve) => port.addEventListener("message", ({ data }) => resolve(data)))
}

describe("pack kit files", () => {
  it("reads every file through the pack worker, and says it opened the pack", async () => {
    stubFetch()
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined)
    const [worker, page] = channel()
    servePack(worker)
    const files = packKitFiles(page, { url: "/pack.bin", key: built.key })
    for (const [path, bytes] of TEST_KIT) {
      expect(new Uint8Array(await files.read(path))).toEqual(bytes)
    }
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(info).toHaveBeenCalledWith(expect.stringContaining("opened the asset pack, 4 files"))
  })

  it("rejects paths the pack doesn't hold", async () => {
    stubFetch()
    vi.spyOn(console, "info").mockImplementation(() => undefined)
    const [worker, page] = channel()
    servePack(worker)
    const files = packKitFiles(page, Promise.resolve({ url: "/pack.bin", key: built.key }))
    await expect(files.read("audio/shell.ogg")).rejects.toThrow("no file audio/shell.ogg")
  })

  it("rejects reads when the pack can't be fetched or opened", async () => {
    stubFetch()
    const [worker, page] = channel()
    servePack(worker)
    await expect(packKitFiles(page, { url: "/elsewhere.bin", key: built.key }).read("kit.glb")).rejects.toThrow(
      "/elsewhere.bin: 404 Nope"
    )
    const [worker2, page2] = channel()
    servePack(worker2)
    await expect(packKitFiles(page2, { url: "/pack.bin", key: btoa("x") }).read("kit.glb")).rejects.toThrow(
      "not 256 bits"
    )
  })

  it("passes on failures that aren't errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("offline"))
    const [worker, page] = channel()
    servePack(worker)
    await expect(packKitFiles(page, { url: "/pack.bin", key: built.key }).read("kit.glb")).rejects.toThrow("offline")
  })

  it("rejects reads when the source can't be had", async () => {
    const [, page] = channel()
    const files = packKitFiles(page, Promise.reject(new Error("no source")))
    await expect(files.read("kit.glb")).rejects.toThrow("no source")
  })

  it("answers a read sent before any open with an error, and ignores stray messages", async () => {
    const [worker, page] = channel()
    servePack(worker)
    const reply = nextReply(page)
    page.postMessage("hello")
    page.postMessage({ kind: "close" })
    page.postMessage({ kind: "read", id: "1", path: "kit.glb" })
    page.postMessage({ kind: "read", id: 4, path: "kit.glb" })
    await expect(reply).resolves.toEqual({ kind: "error", id: 4, error: "asset pack: read before open" })
  })

  it("ignores stray replies and replies to reads it didn't send", async () => {
    stubFetch()
    vi.spyOn(console, "info").mockImplementation(() => undefined)
    const [worker, page] = channel()
    const files = packKitFiles(page, { url: "/pack.bin", key: built.key })
    const unknown: PackReply = { kind: "error", id: 99, error: "not yours" }
    worker.postMessage(unknown)
    worker.postMessage({ kind: "file", id: 0, data: "not a buffer" })
    worker.postMessage(null)
    worker.postMessage({ kind: "closed" })
    servePack(worker)
    expect(new Uint8Array(await files.read("kit.glb"))).toEqual(TEST_KIT.get("kit.glb"))
  })
})

describe("pack worker", () => {
  it("serves the pack on its own scope", async () => {
    stubFetch()
    const [worker, page] = channel()
    vi.stubGlobal("self", worker)
    await import("./pack-worker.ts")
    page.postMessage({ kind: "open", url: "/pack.bin", key: built.key })
    const opened = nextReply(page)
    await expect(opened).resolves.toEqual({ kind: "opened", files: 4, bytes: built.pack.byteLength })
  })
})
