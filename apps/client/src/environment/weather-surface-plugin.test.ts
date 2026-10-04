import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CLOUD_SCALE, createCloudTexture, type WeatherSurface, WeatherSurfacePlugin } from "./weather-surface-plugin.ts"

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

const surface: WeatherSurface = {
  cloudOffsetX: 350,
  cloudOffsetZ: -70,
  shadowedShare: 0.4,
  shadowDepth: 0.3,
  snow: 0.5,
  snowBrightness: 0.8
}

describe("the cloud texture", () => {
  it("is a tiling pattern with both clear sky and cloud in it", () => {
    const texture = createCloudTexture(scene(), 32)
    expect(texture.wrapU).toBe(1)
    expect(texture.name).toBe("cloud-shadows")
  })
})

describe("WeatherSurfacePlugin", () => {
  it("draws cloud shadows and lying snow in both shader languages, before the fog", () => {
    const world = scene()
    const texture = createCloudTexture(world, 16)
    const plugin = new WeatherSurfacePlugin(new StandardMaterial("ground", world), texture, surface)
    const samplers: string[] = []
    const textures: unknown[] = []
    plugin.getSamplers(samplers)
    plugin.getActiveTextures(textures as never[])

    expect(plugin.getClassName()).toBe("WeatherSurfacePlugin")
    expect(plugin.isCompatible(ShaderLanguage.WGSL)).toBe(true)
    expect(plugin.isCompatible(ShaderLanguage.GLSL)).toBe(true)
    expect(samplers).toEqual(["weatherCloudMap"])
    expect(textures).toEqual([texture])
    expect(plugin.hasTexture(texture)).toBe(true)
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      const code = plugin.getCustomCode("fragment", language)?.CUSTOM_FRAGMENT_BEFORE_FOG
      expect(code).toContain("weatherClouds")
      expect(code).toContain("weatherSnow")
      expect(code).toContain("vNormalW")
    }
    expect(plugin.getCustomCode("vertex")).toBeNull()
    expect(plugin.getUniforms(ShaderLanguage.GLSL).fragment).toContain("uniform vec4 weatherSnow;")
    expect(plugin.getUniforms(ShaderLanguage.WGSL).fragment).toBe("")
  })

  it("binds the weather as uniforms, so it changes without recompiling", () => {
    const world = scene()
    const texture = createCloudTexture(world, 16)
    const plugin = new WeatherSurfacePlugin(new StandardMaterial("ground", world), texture, surface)
    const buffer = {
      updateFloat4: vi.fn<UniformBuffer["updateFloat4"]>(),
      setTexture: vi.fn<UniformBuffer["setTexture"]>()
    }
    plugin.bindForSubMesh(buffer as unknown as UniformBuffer)

    expect(buffer.updateFloat4).toHaveBeenCalledWith("weatherClouds", 0.5, -0.1, 0.4, 0.3)
    expect(buffer.updateFloat4).toHaveBeenCalledWith("weatherSnow", 0.5, 0.8, 1 / CLOUD_SCALE, 0)
    expect(buffer.setTexture).toHaveBeenCalledWith("weatherCloudMap", texture)
  })
})
