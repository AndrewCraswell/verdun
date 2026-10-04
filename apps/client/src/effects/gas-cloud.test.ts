import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap } from "@verdun/map"
import { createSimulation, GAS_DETECTED, releaseGas } from "@verdun/sim"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createGasCloud, createSmokeCloud, gasStrength, smokeStrength } from "./gas-cloud.ts"

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

describe("gasStrength", () => {
  it("is nothing below the smell of it, rising on a log scale to full in a lethal cloud", () => {
    expect(gasStrength(0)).toBe(0)
    expect(gasStrength(GAS_DETECTED / 4)).toBe(0)
    expect(gasStrength(GAS_DETECTED)).toBeGreaterThan(0)
    expect(gasStrength(200)).toBeGreaterThan(gasStrength(GAS_DETECTED))
    expect(gasStrength(1e6)).toBe(1)
  })
})

describe("createSmokeCloud", () => {
  it("draws shell smoke as a tall, drab cloud that goes once the smoke has cleared", () => {
    const sim = createSimulation({ map: createFlatMap({ name: "m", cellSize: 1, columns: 100, rows: 100 }), seed: 1 })
    const smoke = createSmokeCloud(scene(), sim)
    expect(smoke.update()).toBeNull()

    releaseGas(sim.smoke, 50, 50, 25_000)
    expect(smoke.update()?.some((strength) => strength > 0)).toBe(true)
    expect(smoke.count).toBe(1)
    expect(smokeStrength(1)).toBe(0)
    expect(smokeStrength(1e6)).toBe(1)
  })

  it("draws soft puffs that face the camera, dimmed at night, from a pool that never changes size", () => {
    const sim = createSimulation({ map: createFlatMap({ name: "m", cellSize: 1, columns: 100, rows: 100 }), seed: 1 })
    const smoke = createSmokeCloud(scene(), sim)
    const pool = smoke.sprites.sprites.length
    releaseGas(sim.smoke, 50, 50, 25_000)
    sim.environment.illuminance = 50_000
    smoke.update()
    const [puff] = smoke.sprites.sprites
    const byDay = puff?.color.r ?? 0
    expect(puff?.width).toBeGreaterThan(0)
    expect(smoke.sprites.texture?.hasAlpha).toBe(true)

    sim.environment.illuminance = 0.001
    smoke.update()
    expect(puff?.color.r).toBeLessThan(byDay / 2)
    expect(smoke.sprites.sprites).toHaveLength(pool)
  })
})

describe("createGasCloud", () => {
  it("draws puffs over thick gas, and clears them once the cloud is gone", () => {
    const sim = createSimulation({ map: createFlatMap({ name: "m", cellSize: 1, columns: 100, rows: 100 }), seed: 1 })
    const view = scene()
    const ground = new StandardMaterial("ground", view)
    const cloud = createGasCloud(view, sim, ground)
    cloud.update()
    expect(cloud.puffs.count).toBe(0)

    releaseGas(sim.gas, 50, 50, 600_000)
    cloud.update()
    expect(cloud.puffs.count).toBe(1)
    const [puff] = cloud.puffs.sprites.sprites
    expect(Math.abs((puff?.position.x ?? 0) - 50)).toBeLessThan(2)

    sim.gas.concentration.fill(0)
    sim.gas.active = false
    cloud.update()
    expect(cloud.puffs.count).toBe(0)
    // Hidden, so nothing is drawn for it, not removed.
    expect(puff?.isVisible).toBe(false)
    expect(cloud.puffs.sprites.sprites.every((sprite) => !sprite.isVisible)).toBe(true)
    cloud.update()
    expect(cloud.puffs.count).toBe(0)
  })

  it("tints the ground under gas in both shader languages", () => {
    const sim = createSimulation({ map: createFlatMap({ name: "m", cellSize: 1, columns: 100, rows: 100 }), seed: 1 })
    const view = scene()
    const { plugin } = createGasCloud(view, sim, new StandardMaterial("ground", view))
    const buffer = {
      updateFloat2: vi.fn<UniformBuffer["updateFloat2"]>(),
      updateColor3: vi.fn<UniformBuffer["updateColor3"]>(),
      setTexture: vi.fn<UniformBuffer["setTexture"]>()
    }
    plugin.bindForSubMesh(buffer as unknown as UniformBuffer)

    expect(plugin.getClassName()).toBe("GasTintPlugin")
    expect(plugin.isCompatible(ShaderLanguage.WGSL)).toBe(true)
    expect(buffer.updateFloat2).toHaveBeenCalledWith("gasTintScale", 0.01, 0.01)
    expect(plugin.getCustomCode("vertex")).toBeNull()
    expect(plugin.getCustomCode("fragment", ShaderLanguage.WGSL)?.["CUSTOM_FRAGMENT_BEFORE_FOG"]).toContain("gasTint")
    expect(plugin.getCustomCode("fragment")?.["CUSTOM_FRAGMENT_BEFORE_FOG"]).toContain("gasTint")
    expect(plugin.getUniforms().fragment).toContain("uniform vec2 gasTintScale;")
    expect(plugin.getUniforms(ShaderLanguage.WGSL).fragment).toBe("")
    const samplers: string[] = []
    plugin.getSamplers(samplers)
    expect(samplers).toEqual(["gasTint"])
    const textures: BaseTexture[] = []
    plugin.getActiveTextures(textures)
    expect(textures).toHaveLength(1)
    expect(plugin.hasTexture(textures[0] ?? new Texture(null, null))).toBe(true)
    expect(plugin.hasTexture(new Texture(null, null))).toBe(false)
    expect(plugin.isCompatible(ShaderLanguage.GLSL)).toBe(true)
  })
})
