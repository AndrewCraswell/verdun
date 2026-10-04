import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Scene } from "@babylonjs/core/scene"
import type { ShotEvent } from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
import { createTracers } from "./tracers.ts"

const engines: NullEngine[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function scene(): Scene {
  const engine = new NullEngine()
  engines.push(engine)
  return new Scene(engine)
}

const shot = (fromZ: number, toZ: number, y = 1.5): ShotEvent => ({
  shooter: 1,
  target: 2,
  hit: false,
  from: { x: 10, y, z: fromZ },
  to: { x: 10, y: y + (toZ - fromZ === 0 ? 5 : 0), z: toZ }
})

describe("createTracers", () => {
  it("draws a streak from the muzzle to the target, then fades it out", () => {
    const tracers = createTracers(scene())
    tracers.add([shot(0, 100)])
    tracers.update(0.01)

    expect(tracers.mesh.thinInstanceCount).toBe(1)
    const [matrix] = tracers.mesh.thinInstanceGetWorldMatrices()
    expect(matrix?.getTranslation().z).toBeCloseTo(50)
    expect(matrix?.getTranslation().y).toBeCloseTo(1.5)

    tracers.update(0.2)
    expect(tracers.mesh.thinInstanceCount).toBe(0)
  })

  it("copes with shots straight up or down, and caps how many are alive", () => {
    const tracers = createTracers(scene())
    tracers.add([shot(5, 5)])
    tracers.add(Array.from({ length: 600 }, (_, index) => shot(0, index + 1)))
    tracers.update(0.01)

    expect(tracers.mesh.thinInstanceCount).toBe(512)
    expect(tracers.mesh.thinInstanceGetWorldMatrices().every((matrix) => Number.isFinite(matrix.m[0]))).toBe(true)
  })
})
