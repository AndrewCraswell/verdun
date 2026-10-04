import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createScorchMap, paintBlot } from "./scorch-map.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

/** A random source that walks through a fixed cycle, so blots come out the same every run. */
function steady(): () => number {
  let step = 0
  return () => {
    step += 1
    return (step * 0.37) % 1
  }
}

describe("paintBlot", () => {
  it("blackens a faceted blot, darkest in the middle, and leaves the ground beyond it alone", () => {
    const texels = new Uint8Array(20 * 20)
    paintBlot(texels, 20, 20, 10, 10, 4, 1, steady())

    const at = (x: number, z: number) => texels[z * 20 + x] ?? 0
    expect(at(10, 10)).toBe(255)
    // The browner ring outside the core.
    expect(at(12, 10)).toBeGreaterThan(100)
    expect(at(12, 10)).toBeLessThan(255)
    expect(at(1, 1)).toBe(0)
    expect(at(18, 10)).toBe(0)
  })

  it("never lightens ground already burnt, and keeps to the grid at its edges", () => {
    const texels = new Uint8Array(10 * 10).fill(250)
    paintBlot(texels, 10, 10, 0, 0, 3, 0.4, steady())

    expect(Math.min(...texels)).toBe(250)
  })
})

describe("createScorchMap", () => {
  it("covers the map and sends new scorch to the GPU once a frame", () => {
    const engine = new NullEngine()
    engines.push(engine)
    const scorch = createScorchMap(new Scene(engine), 600, 400)
    const upload = vi.spyOn(scorch.texture, "update")

    expect([scorch.width, scorch.depth]).toEqual([600, 400])
    expect(scorch.texture.getSize()).toEqual({ width: 600, height: 400 })
    scorch.update()
    expect(upload).not.toHaveBeenCalled()

    scorch.scorch(100, 100, 3, steady())
    scorch.scorch(110, 100, 3)
    scorch.update()
    scorch.update()
    expect(upload).toHaveBeenCalledOnce()
    scorch.dispose()
  })

  it("fades the scorch as rain washes it into the mud, the faintest marks to nothing", () => {
    const engine = new NullEngine()
    engines.push(engine)
    const scorch = createScorchMap(new Scene(engine), 40, 40)
    const upload = vi.spyOn(scorch.texture, "update")
    scorch.scorch(20, 20, 4, steady())
    scorch.update()
    const texels = upload.mock.calls.at(-1)?.[0]
    if (!(texels instanceof Uint8Array)) {
      throw new Error("expected the scorch's texels")
    }
    const middle = texels[20 * 40 + 20] ?? 0

    scorch.wash(0.5)
    scorch.update()
    expect(texels[20 * 40 + 20]).toBe(Math.floor(middle * 0.5))
    expect(upload).toHaveBeenCalledTimes(2)
    for (let shower = 0; shower < 12; shower++) {
      scorch.wash(0.5)
    }
    expect(texels.every((value) => value === 0)).toBe(true)
  })
})
