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
    const [low] = explosions.instances.smoke.matrices()
    const startY = low?.getTranslation().y ?? 0

    explosions.update(1)
    expect(explosions.flashes.thinInstanceCount).toBe(0)
    // A heavy shell's column reaches well above a field gun's.
    const tops = explosions.instances.smoke.matrices().map((matrix) => matrix.getTranslation().y)
    expect(Math.max(...tops)).toBeGreaterThan(15)
    expect(explosions.instances.smoke.matrices()[0]?.getTranslation().y).toBeGreaterThan(startY)

    explosions.update(10)
    expect(explosions.smoke.thinInstanceCount).toBe(0)
  })

  it("draws a grenade's burst much smaller than a shell's", () => {
    const explosions = createExplosions(scene())
    explosions.add([burst(Shell.Grenade), burst(Shell.FieldHighExplosive)])
    explosions.update(0.5)
    const matrices = explosions.instances.smoke.matrices()
    // Four puffs to a column: the grenade's first, then the shell's.
    const grenade = matrices[0]?.m[0] ?? 0
    const shell = matrices[4]?.m[0] ?? 0

    expect(grenade).toBeGreaterThan(0)
    expect(grenade).toBeLessThan(shell / 2)
  })

  it("leaves a single white puff hanging in the air for shrapnel", () => {
    const explosions = createExplosions(scene())
    explosions.add([burst(Shell.FieldShrapnel, 12)])
    explosions.update(0.05)

    expect(explosions.smoke.thinInstanceCount).toBe(0)
    expect(explosions.airbursts.thinInstanceCount).toBe(1)
    expect(explosions.instances.airbursts.matrices()[0]?.getTranslation().y).toBeGreaterThan(11)
  })
})
