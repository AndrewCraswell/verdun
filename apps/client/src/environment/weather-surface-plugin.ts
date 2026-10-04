import { Constants } from "@babylonjs/core/Engines/constants"
import type { Material } from "@babylonjs/core/Materials/material"
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import type { Scene } from "@babylonjs/core/scene"

/** How the weather marks the ground this frame. Every value is a uniform, so changing them never recompiles a shader. */
export interface WeatherSurface {
  /** Where the cloud pattern lies over the ground, in metres: it drifts with the wind aloft. */
  cloudOffsetX: number
  cloudOffsetZ: number
  /** How much of the ground lies in cloud shadow, from 0 (none) to 1 (all of it). */
  shadowedShare: number
  /** How dark cloud shadow is, from 0 (no shadows: a clear or an overcast sky) to about 0.5 (sun between cumulus). */
  shadowDepth: number
  /** How much lying snow covers the level ground, from 0 to 1. */
  snow: number
  /** How bright snow looks by the light there is, from 0 (black night) to 1 (noon). */
  snowBrightness: number
}

/** One cloud cell of the noise is this many metres across: fair-weather cumulus. */
export const CLOUD_SCALE = 700

/**
 * A tileable cloud pattern: value noise summed over four octaves into a red-channel texture. Made once, on the CPU,
 * from a fixed seed, so it needs no asset and looks the same every run.
 */
export function createCloudTexture(scene: Scene, size = 128): RawTexture {
  const lattice = (octave: number, x: number, y: number) => {
    const cells = 4 << octave
    const ix = ((x % cells) + cells) % cells
    const iy = ((y % cells) + cells) % cells
    let h = Math.imul(ix * 374_761_393 + iy * 668_265_263 + octave * 2_147_483_647, 1_274_126_177)
    h = Math.imul(h ^ (h >>> 13), 1_103_515_245)
    return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296
  }
  const pixels = new Uint8Array(size * size)
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      let value = 0
      let weight = 0
      for (let octave = 0; octave < 4; octave++) {
        const cells = 4 << octave
        const x = (column / size) * cells
        const y = (row / size) * cells
        const x0 = Math.floor(x)
        const y0 = Math.floor(y)
        const sx = (x - x0) * (x - x0) * (3 - 2 * (x - x0))
        const sy = (y - y0) * (y - y0) * (3 - 2 * (y - y0))
        const top = lattice(octave, x0, y0) * (1 - sx) + lattice(octave, x0 + 1, y0) * sx
        const bottom = lattice(octave, x0, y0 + 1) * (1 - sx) + lattice(octave, x0 + 1, y0 + 1) * sx
        const amplitude = 1 / (1 << octave)
        value += (top * (1 - sy) + bottom * sy) * amplitude
        weight += amplitude
      }
      pixels[row * size + column] = Math.round((value / weight) * 255)
    }
  }
  const texture = new RawTexture(
    pixels,
    size,
    size,
    Constants.TEXTUREFORMAT_R,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE,
    Constants.TEXTURETYPE_UNSIGNED_BYTE
  )
  texture.name = "cloud-shadows"
  texture.wrapU = Texture.WRAP_ADDRESSMODE
  texture.wrapV = Texture.WRAP_ADDRESSMODE
  return texture
}

/**
 * Marks the ground and everything on it with the weather, in both GLSL (WebGL2) and WGSL (WebGPU): cloud shadows
 * drifting across the field on a broken-cloud day, and snow lying on level ground and the tops of things. Before the
 * fog of war and the scene's distance fog, so unseen and far ground still darken and fade over it.
 */
export class WeatherSurfacePlugin extends MaterialPluginBase {
  private readonly clouds: BaseTexture
  private readonly surface: Readonly<WeatherSurface>

  constructor(material: Material, clouds: BaseTexture, surface: Readonly<WeatherSurface>) {
    super(material, "WeatherSurface", 205, undefined, true, true)
    this.clouds = clouds
    this.surface = surface
  }

  override getClassName(): string {
    return "WeatherSurfacePlugin"
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("weatherCloudMap")
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    activeTextures.push(this.clouds)
  }

  override hasTexture(texture: BaseTexture): boolean {
    return texture === this.clouds
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[]
    fragment: string
  } {
    return {
      ubo: [
        { name: "weatherClouds", size: 4, type: "vec4" },
        { name: "weatherSnow", size: 4, type: "vec4" }
      ],
      fragment: shaderLanguage === ShaderLanguage.GLSL ? "uniform vec4 weatherClouds;\nuniform vec4 weatherSnow;" : ""
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const { cloudOffsetX, cloudOffsetZ, shadowedShare, shadowDepth, snow, snowBrightness } = this.surface
    uniformBuffer.updateFloat4(
      "weatherClouds",
      cloudOffsetX / CLOUD_SCALE,
      cloudOffsetZ / CLOUD_SCALE,
      shadowedShare,
      shadowDepth
    )
    uniformBuffer.updateFloat4("weatherSnow", snow, snowBrightness, 1 / CLOUD_SCALE, 0)
    uniformBuffer.setTexture("weatherCloudMap", this.clouds)
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
        CUSTOM_FRAGMENT_DEFINITIONS: "var weatherCloudMap: texture_2d<f32>;\nvar weatherCloudMapSampler: sampler;",
        CUSTOM_FRAGMENT_BEFORE_FOG: `
          let weatherGround: vec2f = fragmentInputs.vPositionW.xz * uniforms.weatherSnow.z;
          let weatherCloud: f32 = textureSample(weatherCloudMap, weatherCloudMapSampler, weatherGround + uniforms.weatherClouds.xy).r;
          let weatherShade: f32 = smoothstep(1.0 - uniforms.weatherClouds.z - 0.06, 1.0 - uniforms.weatherClouds.z + 0.06, weatherCloud);
          var weatherLevel: f32 = 1.0;
          #ifdef NORMAL
          weatherLevel = smoothstep(0.55, 0.85, normalize(fragmentInputs.vNormalW).y);
          #endif
          let weatherDrift: f32 = textureSample(weatherCloudMap, weatherCloudMapSampler, weatherGround * 6.7).r;
          let weatherSnowHere: f32 = clamp(uniforms.weatherSnow.x * 1.3 - weatherDrift * 0.8, 0.0, 0.8) * weatherLevel;
          var weatherColor: vec3f = color.rgb * (1.0 - uniforms.weatherClouds.w * weatherShade);
          weatherColor = mix(weatherColor, vec3f(0.72, 0.74, 0.78) * uniforms.weatherSnow.y, weatherSnowHere);
          color = vec4f(weatherColor, color.a);
        `
      }
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "uniform sampler2D weatherCloudMap;",
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        vec2 weatherGround = vPositionW.xz * weatherSnow.z;
        float weatherCloud = texture2D(weatherCloudMap, weatherGround + weatherClouds.xy).r;
        float weatherShade = smoothstep(1.0 - weatherClouds.z - 0.06, 1.0 - weatherClouds.z + 0.06, weatherCloud);
        float weatherLevel = 1.0;
        #ifdef NORMAL
        weatherLevel = smoothstep(0.55, 0.85, normalize(vNormalW).y);
        #endif
        float weatherDrift = texture2D(weatherCloudMap, weatherGround * 6.7).r;
        float weatherSnowHere = clamp(weatherSnow.x * 1.3 - weatherDrift * 0.8, 0.0, 0.8) * weatherLevel;
        color.rgb *= 1.0 - weatherClouds.w * weatherShade;
        color.rgb = mix(color.rgb, vec3(0.72, 0.74, 0.78) * weatherSnow.y, weatherSnowHere);
      `
    }
  }
}
