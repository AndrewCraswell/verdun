import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type Held, warmUpShaders, watchBuilding } from "./shader-warm-up.ts"

const engines: NullEngine[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

describe("warming the shaders up", () => {
  it("holds everything on together until a frame has drawn with it, then lets go", async () => {
    const engine = new NullEngine()
    engines.push(engine)
    const scene = new Scene(engine)
    scene.activeCamera = new FreeCamera("camera", new Vector3(0, 10, -10), scene)
    // The null engine's scene never counts as ready: what the warm-up waits for there is Babylon's own doing.
    vi.spyOn(scene, "whenReadyAsync").mockResolvedValue()
    const held: string[][] = [[], []]
    const said = (on: boolean | null) => {
      if (on === null) {
        return "let go"
      }
      return on ? "on" : "off"
    }
    const lights: Held[] = held.map((log) => ({ hold: (on) => log.push(said(on)) }))
    const drawn: string[][] = []
    scene.onBeforeRenderObservable.add(() => drawn.push(held.map((log) => log.at(-1) ?? "")))

    let warmed = false
    void warmUpShaders(scene, [lights[0] ?? null, null, lights[1] ?? null]).then(() => {
      warmed = true
    })
    await vi.waitFor(() => {
      scene.render()
      expect(warmed).toBe(true)
    })

    // Both on together for the frame that builds their shaders, and let go after it.
    expect(drawn[0]).toEqual(["on", "on"])
    expect(held).toEqual([
      ["on", "let go"],
      ["on", "let go"]
    ])
  })

  it("waits for every shader module made meanwhile to be compiled, and stops watching", async () => {
    let compiled: () => void = () => undefined
    const module = {
      getCompilationInfo: () =>
        new Promise((resolve) => {
          compiled = () => resolve({})
        })
    }
    const device = { createShaderModule: vi.fn<(descriptor: unknown) => typeof module>(() => module) }
    const { createShaderModule } = device
    const done = watchBuilding(device)
    expect(device.createShaderModule({ code: "" })).toBe(module)

    let settled = false
    void done().then(() => {
      settled = true
    })
    // No longer watched: the device's own method again.
    expect(Object.hasOwn(device, "createShaderModule")).toBe(false)
    await Promise.resolve()
    expect(settled).toBe(false)
    compiled()
    await vi.waitFor(() => expect(settled).toBe(true))
    expect(createShaderModule).toHaveBeenCalledOnce()
  })

  it("watches nothing on an engine without a WebGPU device", async () => {
    await expect(watchBuilding(undefined)()).resolves.toBeUndefined()
    await expect(watchBuilding({})()).resolves.toBeUndefined()
  })
})
