import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import type { PackPort } from "../assets/pack-protocol.ts"
import { servePack } from "../assets/pack-service.ts"
import { buildTestPack, TEST_KIT, type TestPack } from "../assets/test-pack.ts"
import { openKitFiles } from "./kit-files.ts"

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
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** Stands in for the browser's module worker: runs the pack worker's code on the other end of a channel. */
class FakeWorker implements PackPort {
  static readonly urls: string[] = []
  private readonly port: MessagePort

  constructor(url: URL) {
    FakeWorker.urls.push(url.pathname)
    const { port1, port2 } = new MessageChannel()
    port1.start()
    port2.start()
    ports.push(port1, port2)
    servePack(port1)
    this.port = port2
  }

  postMessage(message: unknown, options?: StructuredSerializeOptions): void {
    this.port.postMessage(message, options)
  }

  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void {
    this.port.addEventListener(type, listener)
  }
}

/** A browser page at `search`, with fetch serving `routes`. */
function stubBrowser(search: string, routes: Record<string, () => Response>): void {
  vi.stubGlobal("location", { search })
  vi.stubGlobal("document", { baseURI: "http://localhost:5173/" })
  vi.stubGlobal("Worker", FakeWorker)
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => routes[url]?.() ?? new Response(null, { status: 404, statusText: "Not Found" }))
  )
  vi.spyOn(console, "info").mockImplementation(() => undefined)
}

const packRoute = (): Response => new Response(built.pack.slice(0))

describe("openKitFiles", () => {
  it("reads the raw kit from the dev server", async () => {
    stubBrowser("", { "/level-kit/ground/mud.png": () => new Response(TEST_KIT.get("ground/mud.png")) })
    const files = openKitFiles()!
    expect(new Uint8Array(await files.read("ground/mud.png"))).toEqual(TEST_KIT.get("ground/mud.png"))
    await expect(files.read("kit.glb")).rejects.toThrow("/level-kit/kit.glb: 404 Not Found")
  })

  it("reads the raw kit when there is no page location, as under Node", () => {
    expect(openKitFiles()).not.toBeNull()
  })

  it("reads the dev server's asset pack with ?pack", async () => {
    stubBrowser("?pack", {
      "/level-pack/source.json": () => Response.json({ url: "/level-pack/level.pack", key: built.key }),
      "http://localhost:5173/level-pack/level.pack": packRoute
    })
    const files = openKitFiles()!
    expect(new Uint8Array(await files.read("fx/smoke.png"))).toEqual(TEST_KIT.get("fx/smoke.png"))
    expect(FakeWorker.urls.at(-1)).toMatch(/pack-worker\.ts$/)
  })

  it("rejects reads when the dev server offers no usable pack", async () => {
    stubBrowser("?pack", { "/level-pack/source.json": () => Response.json({ url: 3 }) })
    await expect(openKitFiles()!.read("kit.glb")).rejects.toThrow("not a pack source")
    stubBrowser("?pack", {})
    await expect(openKitFiles()!.read("kit.glb")).rejects.toThrow("source.json: 404")
  })

  it("reads the pack built into a production bundle", async () => {
    stubBrowser("", { "http://localhost:5173/assets/0123.bin": packRoute })
    vi.stubEnv("DEV", false)
    vi.stubEnv("VERDUN_LEVEL_PACK_URL", "/assets/0123.bin")
    vi.stubEnv("VERDUN_LEVEL_PACK_KEY", built.key)
    const files = openKitFiles()!
    expect(new Uint8Array(await files.read("kit.glb"))).toEqual(TEST_KIT.get("kit.glb"))
  })

  it("has no kit in a production bundle built without a pack", () => {
    vi.stubEnv("DEV", false)
    expect(openKitFiles()).toBeNull()
  })
})
