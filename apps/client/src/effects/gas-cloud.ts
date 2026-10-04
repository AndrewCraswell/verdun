import { Constants } from "@babylonjs/core/Engines/constants"
import type { Material } from "@babylonjs/core/Materials/material"
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import { GAS_CELL, GAS_DETECTED, type GasField, type Simulation } from "@verdun/sim"

/** Concentration, in mg/m³, drawn at full strength: around a lethal cloud's heart. */
const FULL_STRENGTH = 2000
/** Greenish-yellow, the colour men remembered from gas clouds; phosgene from shells looked whitish, then faded. */
const GAS_COLOR = new Color3(0.78, 0.8, 0.45)
/** At most this many cloud puffs are drawn, the densest first. */
const MAX_PUFFS = 3000
/** Puffs mark gas thick enough to hurt within minutes; the ground tint shows the fainter edges. */
const PUFF_STRENGTH = 0.45

/** A fixed jitter in [-0.5, 0.5) per cell, so the cloud doesn't sit on a visible grid. */
function jitter(cell: number, salt: number): number {
  return (Math.imul(cell ^ salt, 2654435761) >>> 0) / 2 ** 32 - 0.5
}

/** How strongly to draw a concentration, from 0 to 1: on a log scale, since men feared the faint edges too. */
export function gasStrength(concentration: number): number {
  if (concentration < GAS_DETECTED / 2) {
    return 0
  }
  return Math.min(1, Math.log(concentration / (GAS_DETECTED / 2)) / Math.log(FULL_STRENGTH / (GAS_DETECTED / 2)))
}

/** Tints the ground under gas toward the cloud's colour, in both GLSL (WebGL2) and WGSL (WebGPU). */
export class GasTintPlugin extends MaterialPluginBase {
  private readonly texture: BaseTexture
  /** Metres covered by the gas grid, east and north. */
  private readonly extent: { readonly x: number; readonly z: number }

  constructor(material: Material, texture: BaseTexture, extent: { readonly x: number; readonly z: number }) {
    super(material, "GasTint", 205, undefined, true, true)
    this.texture = texture
    this.extent = extent
  }

  override getClassName(): string {
    return "GasTintPlugin"
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("gasTint")
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    activeTextures.push(this.texture)
  }

  override hasTexture(texture: BaseTexture): boolean {
    return texture === this.texture
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[]
    fragment: string
  } {
    return {
      ubo: [
        { name: "gasTintScale", size: 2, type: "vec2" },
        { name: "gasTintColor", size: 3, type: "vec3" }
      ],
      fragment: shaderLanguage === ShaderLanguage.GLSL ? "uniform vec2 gasTintScale;\nuniform vec3 gasTintColor;" : ""
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat2("gasTintScale", 1 / this.extent.x, 1 / this.extent.z)
    uniformBuffer.updateColor3("gasTintColor", GAS_COLOR)
    uniformBuffer.setTexture("gasTint", this.texture)
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL
  ): Record<string, string> | null {
    if (shaderType !== "fragment") {
      return null
    }
    if (shaderLanguage === ShaderLanguage.WGSL) {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: "var gasTint: texture_2d<f32>;\nvar gasTintSampler: sampler;",
        CUSTOM_FRAGMENT_BEFORE_FOG: `
          let gasAmount: f32 = textureSample(gasTint, gasTintSampler, fragmentInputs.vPositionW.xz * uniforms.gasTintScale).r;
          color = vec4f(mix(color.rgb, uniforms.gasTintColor, gasAmount * 0.6), color.a);
        `
      }
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "uniform sampler2D gasTint;",
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        float gasAmount = texture2D(gasTint, vPositionW.xz * gasTintScale).r;
        color.rgb = mix(color.rgb, gasTintColor, gasAmount * 0.6);
      `
    }
  }
}

export interface GasCloud {
  readonly plugin: GasTintPlugin
  /** Low, translucent puffs over the densest gas. */
  readonly puffs: Mesh
  /** Redraws the cloud from the simulation's gas grid. */
  update(): void
}

/**
 * Draws gas: the ground under it tinted, and a low translucent layer of puffs hugging the ground where it's thick,
 * sinking into trenches and shell holes with it.
 */
export function createGasCloud(scene: Scene, sim: Simulation, groundMaterial: Material): GasCloud {
  const field: GasField = sim.gas
  const pixels = new Uint8Array(field.columns * field.rows)
  const texture = new RawTexture(
    pixels,
    field.columns,
    field.rows,
    Constants.TEXTUREFORMAT_R,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
    Constants.TEXTURETYPE_UNSIGNED_BYTE
  )
  texture.wrapU = Texture.CLAMP_ADDRESSMODE
  texture.wrapV = Texture.CLAMP_ADDRESSMODE
  const plugin = new GasTintPlugin(groundMaterial, texture, {
    x: field.columns * GAS_CELL,
    z: field.rows * GAS_CELL
  })

  const puffs = CreateSphere("gas-puffs", { diameter: 2, segments: 6 }, scene)
  const material = new StandardMaterial("gas-puffs", scene)
  material.diffuseColor = GAS_COLOR
  material.emissiveColor = GAS_COLOR.scale(0.5)
  material.specularColor = Color3.Black()
  material.alpha = 0.18
  // Translucent layers drawn in any order: depth writes would cut holes in the puffs behind.
  material.disableDepthWrite = true
  puffs.material = material
  puffs.isPickable = false
  puffs.alwaysSelectAsActiveMesh = true
  puffs.thinInstanceCount = 0
  const matrices = new Float32Array(MAX_PUFFS * 16)
  let drawn = false

  return {
    plugin,
    puffs,
    update() {
      if (!field.active && !drawn) {
        return
      }
      const dense: { cell: number; strength: number }[] = []
      field.concentration.forEach((value, cell) => {
        const strength = gasStrength(value)
        pixels[cell] = Math.round(strength * 255)
        if (strength > PUFF_STRENGTH) {
          dense.push({ cell, strength })
        }
      })
      texture.update(pixels)
      dense.sort((a, b) => b.strength - a.strength || a.cell - b.cell)
      const shown = dense.slice(0, MAX_PUFFS)
      shown.forEach(({ cell, strength }, index) => {
        const x = ((cell % field.columns) + 0.5 + jitter(cell, 0x51) * 0.8) * GAS_CELL
        const z = (Math.floor(cell / field.columns) + 0.5 + jitter(cell, 0xa3) * 0.8) * GAS_CELL
        // Wide and flat: heavy gas lies in a layer a metre or two deep.
        const radius = GAS_CELL * (0.55 + 0.35 * strength + jitter(cell, 0x7d) * 0.3)
        const offset = index * 16
        matrices.fill(0, offset, offset + 16)
        matrices[offset] = radius
        matrices[offset + 5] = 0.4 + 0.8 * strength
        matrices[offset + 10] = radius
        matrices[offset + 12] = x
        matrices[offset + 13] = heightAt(sim.map, x, z) + 0.3
        matrices[offset + 14] = z
        matrices[offset + 15] = 1
      })
      puffs.thinInstanceSetBuffer("matrix", matrices, 16, false)
      puffs.thinInstanceCount = shown.length
      drawn = field.active
    }
  }
}
