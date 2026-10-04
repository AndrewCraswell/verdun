import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createGroundMaterial } from "./ground-material.ts"
import { SPLAT_KIND, type SplatLayers, TerrainSplatPlugin } from "./terrain-splat-plugin.ts"

const engines: NullEngine[] = []

function setup() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const layers: SplatLayers = {
    grass: new Texture(null, scene),
    mud: new Texture(null, scene),
    chalk: new Texture(null, scene),
    churned: new Texture(null, scene)
  }
  const material = new StandardMaterial("ground", scene)
  return { scene, layers, plugin: new TerrainSplatPlugin(material, layers, { tileMeters: 4, desaturation: 0.5 }) }
}

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

describe("TerrainSplatPlugin", () => {
  it("supports both WebGL2 (GLSL) and WebGPU (WGSL) natively", () => {
    const { plugin } = setup()

    expect(plugin.isCompatible(ShaderLanguage.GLSL)).toBe(true)
    expect(plugin.isCompatible(ShaderLanguage.WGSL)).toBe(true)
    expect(plugin.getClassName()).toBe("TerrainSplatPlugin")
  })

  it("adds the splat attribute, four layer samplers and their textures", () => {
    const { plugin, layers } = setup()
    const attributes: string[] = []
    const samplers: string[] = []
    const textures: unknown[] = []
    plugin.getAttributes(attributes)
    plugin.getSamplers(samplers)
    plugin.getActiveTextures(textures as never[])

    expect(attributes).toEqual([SPLAT_KIND])
    expect(samplers).toEqual(["grassLayer", "mudLayer", "chalkLayer", "churnedLayer"])
    expect(textures).toEqual([layers.grass, layers.mud, layers.chalk, layers.churned])
    expect(plugin.hasTexture(layers.chalk)).toBe(true)
  })

  it("passes the vertex weights through and blends all four layers in each language", () => {
    const { plugin } = setup()
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      const vertex = plugin.getCustomCode("vertex", language)
      const fragment = plugin.getCustomCode("fragment", language)

      expect(vertex?.CUSTOM_VERTEX_DEFINITIONS).toContain("splat")
      expect(vertex?.CUSTOM_VERTEX_MAIN_END).toContain("vSplat")
      for (const layer of ["grassLayer", "mudLayer", "chalkLayer", "churnedLayer"]) {
        expect(fragment?.CUSTOM_FRAGMENT_DEFINITIONS).toContain(layer)
        expect(fragment?.CUSTOM_FRAGMENT_UPDATE_DIFFUSE).toContain(layer)
      }
    }
    // Two rotated samples per layer break up visible tiling.
    expect(plugin.getCustomCode("fragment", ShaderLanguage.WGSL)?.CUSTOM_FRAGMENT_DEFINITIONS).toContain("rotatedUV")
    expect(plugin.getCustomCode("fragment", ShaderLanguage.GLSL)?.CUSTOM_FRAGMENT_DEFINITIONS).toContain("rotatedUV")
    expect(plugin.getCustomCode("compute")).toBeNull()
  })

  it("declares its options uniform in GLSL only, since WGSL reads it from the uniform buffer", () => {
    const { plugin } = setup()

    expect(plugin.getUniforms(ShaderLanguage.GLSL).fragment).toContain("uniform vec4 splatOptions;")
    expect(plugin.getUniforms(ShaderLanguage.GLSL).fragment).toContain("uniform vec4 splatTintChurned;")
    expect(plugin.getUniforms(ShaderLanguage.WGSL).fragment).toBe("")
    expect(plugin.getUniforms().ubo.map((uniform) => uniform.name)).toEqual([
      "splatOptions",
      "splatTintGrass",
      "splatTintMud",
      "splatTintChalk",
      "splatTintChurned"
    ])
  })

  it("binds the tiling, desaturation, layer tints and layer textures", () => {
    const { plugin, layers } = setup()
    const buffer = {
      updateFloat4: vi.fn<UniformBuffer["updateFloat4"]>(),
      setTexture: vi.fn<UniformBuffer["setTexture"]>()
    }
    plugin.bindForSubMesh(buffer as unknown as UniformBuffer)

    expect(buffer.updateFloat4).toHaveBeenCalledWith("splatOptions", 0.25, 0.5, 0, 0)
    expect(buffer.updateFloat4).toHaveBeenCalledWith("splatTintChalk", 1.75, 1.72, 1.62, 1)
    expect(buffer.setTexture).toHaveBeenCalledWith("grassLayer", layers.grass)
    expect(buffer.setTexture).toHaveBeenCalledWith("churnedLayer", layers.churned)
  })
})

describe("createGroundMaterial", () => {
  it("is a matte material with the splat plugin attached", () => {
    const { scene, layers } = setup()
    const { material, splat } = createGroundMaterial(scene, layers)

    expect(material.specularColor.equals(material.specularColor.scale(0))).toBe(true)
    expect(material.pluginManager?.getPlugin("TerrainSplat")).toBe(splat)
  })
})
