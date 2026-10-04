import { Constants } from "@babylonjs/core/Engines/constants"
import type { Material } from "@babylonjs/core/Materials/material"
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import type { Scene } from "@babylonjs/core/scene"
import { Sprite } from "@babylonjs/core/Sprites/sprite"
import { SpriteManager } from "@babylonjs/core/Sprites/spriteManager"
import { type BattlefieldMap, heightAt } from "@verdun/map"
import { GAS_CELL, GAS_DETECTED, type GasField, type Simulation } from "@verdun/sim"
import { lightLevel } from "../environment/daylight.ts"

/** Concentration, in mg/m³, drawn at full strength: around a lethal cloud's heart. */
const FULL_STRENGTH = 2000
/** Greenish-yellow, the colour men remembered from gas clouds; phosgene from shells looked whitish, then faded. */
const GAS_COLOR = new Color3(0.78, 0.8, 0.45)
/** At most this many cloud puffs are drawn, the densest first. */
const MAX_PUFFS = 3000
/** Gas puffs mark gas thick enough to hurt within minutes; the ground tint shows the fainter edges. */
const PUFF_STRENGTH = 0.45
/** Smoke and dust: drab grey-brown, drawn from a faint haze up to a cloud too thick to see through. */
const SMOKE_COLOR = new Color3(0.55, 0.52, 0.47)
const SMOKE_FULL = 400

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

/** How strongly to draw shell smoke, from 0 to 1. */
export function smokeStrength(concentration: number): number {
  return concentration < 2 ? 0 : Math.min(1, Math.log(concentration / 2) / Math.log(SMOKE_FULL / 2))
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

/** A low layer of soft, translucent puffs over the thick parts of a cloud grid. */
export interface CloudPuffs {
  /** The puffs, drawn as sprites: always facing the camera. */
  readonly sprites: SpriteManager
  /** How many puffs are showing. */
  readonly count: number
  /** Redraws the puffs; returns each cell's drawing strength, or null when there was nothing to redraw. */
  update(): Float32Array | null
}

interface CloudLook {
  readonly name: string
  readonly color: Color3
  readonly alpha: number
  /** Drawing strength, 0 to 1, of a concentration. */
  readonly strength: (concentration: number) => number
  /** Cells at or above this strength get a puff. */
  readonly puffFrom: number
  /** Puff height in metres at strength 0 and 1: gas hugs the ground, smoke billows up. */
  readonly height: { readonly min: number; readonly max: number }
}

/** Texels across the puff texture. */
const PUFF_TEXELS = 64
/** The puff's falloff, as the Gaussian's spread in its half-width: soft all the way, no rim. */
const PUFF_SPREAD = 0.38
/** However dark it is, smoke and gas are drawn at least this bright, as the night is (see lightLevel). */
const NIGHT_BRIGHTNESS = 0.22

const puffTextures = new WeakMap<Scene, Texture>()

/** A white, round, soft puff: opacity falling off as a Gaussian from the middle, to nothing at the edge. */
function puffTexture(scene: Scene): Texture {
  const cached = puffTextures.get(scene)
  if (cached) {
    return cached
  }
  const data = new Uint8Array(PUFF_TEXELS * PUFF_TEXELS * 4)
  for (let row = 0; row < PUFF_TEXELS; row++) {
    for (let column = 0; column < PUFF_TEXELS; column++) {
      const x = ((column + 0.5) / PUFF_TEXELS) * 2 - 1
      const y = ((row + 0.5) / PUFF_TEXELS) * 2 - 1
      const r2 = x * x + y * y
      // Gaussian, eased to zero at the edge so the square never shows.
      const opacity = r2 >= 1 ? 0 : Math.exp(-r2 / (2 * PUFF_SPREAD * PUFF_SPREAD)) * (1 - r2)
      const texel = (row * PUFF_TEXELS + column) * 4
      data.fill(255, texel, texel + 3)
      data[texel + 3] = Math.round(opacity * 255)
    }
  }
  const texture = RawTexture.CreateRGBATexture(data, PUFF_TEXELS, PUFF_TEXELS, scene, true, false)
  texture.hasAlpha = true
  puffTextures.set(scene, texture)
  return texture
}

/**
 * Puffs drawn as sprites: soft round billows that always face the camera, so a cloud of them reads as smoke rather than
 * a heap of balls. Every sprite is made at the start and none is ever removed; puffs not showing shrink to nothing.
 * The number drawn so never changes, which keeps a recorded frame valid (snapshot rendering).
 */
function createCloudPuffs(
  scene: Scene,
  map: BattlefieldMap,
  field: GasField,
  look: CloudLook,
  light: () => number
): CloudPuffs {
  const sprites = new SpriteManager(look.name, "", MAX_PUFFS, PUFF_TEXELS, scene)
  sprites.texture = puffTexture(scene)
  sprites.isPickable = false
  // Translucent layers drawn in any order: depth writes would cut holes in the puffs behind.
  sprites.disableDepthWrite = true
  const pool = Array.from({ length: MAX_PUFFS }, (_, index) => {
    const sprite = new Sprite(`${look.name}-${index}`, sprites)
    sprite.width = 0
    sprite.height = 0
    return sprite
  })
  const strengths = new Float32Array(field.columns * field.rows)
  let drawn = false
  let count = 0

  return {
    sprites,
    get count() {
      return count
    },
    update() {
      if (!field.active && !drawn) {
        return null
      }
      const dense: { cell: number; strength: number }[] = []
      field.concentration.forEach((value, cell) => {
        const strength = look.strength(value)
        strengths[cell] = strength
        if (strength > 0 && strength >= look.puffFrom) {
          dense.push({ cell, strength })
        }
      })
      dense.sort((a, b) => b.strength - a.strength || a.cell - b.cell)
      const shown = dense.slice(0, MAX_PUFFS)
      const brightness = NIGHT_BRIGHTNESS + (1 - NIGHT_BRIGHTNESS) * light()
      shown.forEach(({ cell, strength }, index) => {
        const sprite = pool[index]
        if (!sprite) {
          return
        }
        const x = ((cell % field.columns) + 0.5 + jitter(cell, 0x51) * 0.8) * GAS_CELL
        const z = (Math.floor(cell / field.columns) + 0.5 + jitter(cell, 0xa3) * 0.8) * GAS_CELL
        const radius = GAS_CELL * (0.55 + 0.35 * strength + jitter(cell, 0x7d) * 0.3)
        const height = look.height.min + (look.height.max - look.height.min) * strength
        // The texture's soft edge takes up much of the sprite, so it's drawn a good deal bigger than the puff's body.
        sprite.width = radius * 3
        sprite.height = Math.max(radius * 2.4, height * 1.3)
        sprite.position.set(x, heightAt(map, x, z) + sprite.height * 0.3, z)
        sprite.angle = jitter(cell, 0x3c) * Math.PI
        sprite.color.set(
          look.color.r * brightness,
          look.color.g * brightness,
          look.color.b * brightness,
          look.alpha * (0.6 + 0.4 * strength)
        )
      })
      for (let index = shown.length; index < count; index++) {
        const sprite = pool[index]
        if (sprite) {
          sprite.width = 0
          sprite.height = 0
        }
      }
      count = shown.length
      drawn = field.active
      return strengths
    }
  }
}

export interface GasCloud {
  readonly plugin: GasTintPlugin
  /** Low, translucent puffs over the densest gas. */
  readonly puffs: CloudPuffs
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
  // Wide and flat: heavy gas lies in a layer a metre or two deep.
  const puffs = createCloudPuffs(
    scene,
    sim.map,
    field,
    {
      name: "gas-puffs",
      color: GAS_COLOR,
      alpha: 0.18,
      strength: gasStrength,
      puffFrom: PUFF_STRENGTH,
      height: { min: 0.8, max: 2.4 }
    },
    () => lightLevel(sim.environment.illuminance)
  )

  return {
    plugin,
    puffs,
    update() {
      const strengths = puffs.update()
      if (strengths) {
        strengths.forEach((strength, cell) => {
          pixels[cell] = Math.round(strength * 255)
        })
        texture.update(pixels)
      }
    }
  }
}

/**
 * Draws the smoke and dust of shell bursts as it drifts and thins: a barrage becomes a moving curtain, which is what
 * hid the infantry following it.
 */
export function createSmokeCloud(scene: Scene, sim: Simulation): CloudPuffs {
  return createCloudPuffs(
    scene,
    sim.map,
    sim.smoke,
    {
      name: "smoke-puffs",
      color: SMOKE_COLOR,
      alpha: 0.14,
      strength: smokeStrength,
      puffFrom: 0.2,
      height: { min: 2, max: 9 }
    },
    () => lightLevel(sim.environment.illuminance)
  )
}
