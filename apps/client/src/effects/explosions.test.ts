import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Scene } from "@babylonjs/core/scene"
import { type BurstEvent, Shell } from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
import { createExplosions } from "./explosions.ts"

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

const burst = (shell: Shell, y = 2): BurstEvent => ({ type: "burst", shell, at: { x: 50, y, z: 60 }, crater: null })

describe("createExplosions", () => {
  it("flashes briefly, then leaves a column of smoke and dirt that rises and thins away", () => {
    const explosions = createExplosions(scene())
    explosions.add([burst(Shell.FieldHighExplosive), burst(Shell.HeavyHighExplosive)])
    explosions.update(0.05)

    expect(explosions.flashes.thinInstanceCount).toBe(2)
    expect(explosions.smoke.thinInstanceCount).toBe(8)
    const [low] = explosions.smoke.thinInstanceGetWorldMatrices()
    const startY = low?.getTranslation().y ?? 0

    explosions.update(1)
    expect(explosions.flashes.thinInstanceCount).toBe(0)
    // A heavy shell's column reaches well above a field gun's.
    const tops = explosions.smoke.thinInstanceGetWorldMatrices().map((matrix) => matrix.getTranslation().y)
    expect(Math.max(...tops)).toBeGreaterThan(15)
    expect(explosions.smoke.thinInstanceGetWorldMatrices()[0]?.getTranslation().y).toBeGreaterThan(startY)

    explosions.update(10)
    expect(explosions.smoke.thinInstanceCount).toBe(0)
  })

  it("leaves a single white puff hanging in the air for shrapnel", () => {
    const explosions = createExplosions(scene())
    explosions.add([burst(Shell.FieldShrapnel, 12)])
    explosions.update(0.05)

    expect(explosions.smoke.thinInstanceCount).toBe(0)
    expect(explosions.airbursts.thinInstanceCount).toBe(1)
    expect(explosions.airbursts.thinInstanceGetWorldMatrices()[0]?.getTranslation().y).toBeGreaterThan(11)
  })
})
