import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { GroundSplatPlugin } from "./ground-splat-plugin.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function setup() {
  const engine = new NullEngine()
  engines.push(engine)
  const material = new StandardMaterial("ground", new Scene(engine))
  const layer = () => ({ albedo: new Texture(null, null), normal: new Texture(null, null) })
  const layers = { grass: layer(), mud: layer(), chalk: layer(), churned: layer() }
  const scorch = { texture: new Texture(null, null), width: 600, depth: 400 }
  return { layers, plugin: new GroundSplatPlugin(material, layers, scorch) }
}

describe("GroundSplatPlugin", () => {
  it("blends four ground textures by the splat attribute in both shader languages", () => {
    const { plugin } = setup()
    const attributes: string[] = []
    const samplers: string[] = []
    plugin.getAttributes(attributes)
    plugin.getSamplers(samplers)

    expect(plugin.getClassName()).toBe("GroundSplatPlugin")
    expect(plugin.isCompatible(ShaderLanguage.GLSL)).toBe(true)
    expect(plugin.isCompatible(ShaderLanguage.WGSL)).toBe(true)
    expect(attributes).toEqual(["splat", "groundWetness"])
    expect(samplers).toEqual([
      "groundGrass",
      "groundMud",
      "groundChalk",
      "groundChurned",
      "groundGrassNormal",
      "groundMudNormal",
      "groundChalkNormal",
      "groundChurnedNormal",
      "groundScorch"
    ])
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      expect(plugin.getCustomCode("vertex", language)?.CUSTOM_VERTEX_MAIN_END).toContain("vGroundSplat")
      const fragment = plugin.getCustomCode("fragment", language)
      expect(fragment?.CUSTOM_FRAGMENT_UPDATE_DIFFUSE).toContain("groundChurned")
      expect(fragment?.CUSTOM_FRAGMENT_UPDATE_DIFFUSE).toContain("normalW = normalize(")
      expect(fragment?.CUSTOM_FRAGMENT_UPDATE_DIFFUSE).toContain("vGroundWetness")
      // Steep ground takes a sideways lookup.
      expect(fragment?.CUSTOM_FRAGMENT_UPDATE_DIFFUSE).toMatch(/groundSideUv.*(select\(|\?)/)
      // Layers absent from a pixel, and the sideways lookup on flat ground, cost no texture fetches.
      expect(fragment?.CUSTOM_FRAGMENT_UPDATE_DIFFUSE).toContain("if (groundWeights.w >= 0.0001) {")
      expect(fragment?.CUSTOM_FRAGMENT_UPDATE_DIFFUSE).toContain("if (groundSteep > 0.0) {")
      expect(fragment?.CUSTOM_FRAGMENT_UPDATE_DIFFUSE).not.toMatch(/textureSample\(groundGrass|texture2D\(groundGrass/)
      expect(fragment?.CUSTOM_FRAGMENT_DEFINITIONS).toContain("groundGrass")
    }
    expect(plugin.getCustomCode("compute")).toBeNull()
    expect(plugin.getUniforms(ShaderLanguage.GLSL).fragment).toContain("uniform vec4 groundSplatParams;")
    expect(plugin.getUniforms(ShaderLanguage.WGSL).fragment).toBe("")
  })

  it("binds its textures and waits for them to load", () => {
    const { layers, plugin } = setup()
    const textures: unknown[] = []
    plugin.getActiveTextures(textures as never[])
    const uniforms = {
      updateFloat4: vi.fn<(name: string, x: number, y: number, z: number, w: number) => void>(),
      updateFloat2: vi.fn<(name: string, x: number, y: number) => void>(),
      setTexture: vi.fn<(name: string, texture: unknown) => void>()
    }
    plugin.bindForSubMesh(uniforms as unknown as UniformBuffer)

    // Four layers' colour and normal maps, and the scorch.
    expect(textures).toHaveLength(9)
    expect(plugin.hasTexture(layers.chalk.normal)).toBe(true)
    expect(plugin.hasTexture(new Texture(null, null))).toBe(false)
    expect(uniforms.setTexture).toHaveBeenCalledTimes(9)
    expect(uniforms.updateFloat2).toHaveBeenCalledWith("groundScorchParams", 1 / 600, 1 / 400)
    expect(uniforms.updateFloat4).toHaveBeenCalledWith(
      "groundSplatParams",
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    )
    expect(plugin.isReadyForSubMesh()).toBe(
      Object.values(layers).every((layer) => layer.albedo.isReady() && layer.normal.isReady())
    )
  })
})
