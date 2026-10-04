import { Constants } from "@babylonjs/core/Engines/constants"
import type { Material } from "@babylonjs/core/Materials/material"
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines"
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import type { Scene } from "@babylonjs/core/scene"
import { HEIGHT_FOG_GLSL, HEIGHT_FOG_WGSL, type HeightFog } from "./height-fog.ts"

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
  /** How thick fog lies in the low ground, from 0 (none) to 1: drawn in the haze's colour (the `reflect` colour). */
  groundFog: number
  /** How far below the brim of each hollow water stands, in metres: near it when the ground is sodden, deep when dry. */
  waterMargin: number
  /** How much standing water shows, from 0 (none: dry weather) to 1. */
  waterShown: number
  /** How hard rain ripples the water, from 0 to 1. */
  rain: number
  /** Seconds, for the ripples' drift. */
  time: number
  /** What the water reflects: the sky's haze, as bright as the light. */
  reflectR: number
  reflectG: number
  reflectB: number
}

/** The ground's hollows and trails, as textures read by ground position (see `ground-marks.ts`). */
export interface SurfaceMarks {
  readonly basins: BaseTexture
  readonly tracks: BaseTexture
  readonly base: number
  readonly scale: { readonly x: number; readonly y: number }
  readonly offset: { readonly x: number; readonly y: number }
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

/** How a material takes the weather. */
export interface WeatherSurfaceOptions {
  /**
   * The low-lying fog to draw (height-fog.ts), in place of Babylon's distance fog, which the caller turns off on the
   * material; null to leave the fog to Babylon.
   */
  readonly heightFog?: Readonly<HeightFog> | null
  /** Fog only, no puddles, snow or trails: for men, who walk through the weather rather than lie under it. */
  readonly fogOnly?: boolean
  /** The low graphics setting: no puddles, ripples, trails or fog in the hollows, which read the ground-marks textures. */
  readonly low?: boolean
}

/**
 * Marks the ground and everything on it with the weather, in both GLSL (WebGL2) and WGSL (WebGPU): cloud shadows
 * drifting across the field on a broken-cloud day; puddles standing in the hollows after rain, reflecting the sky and
 * rippled by rain; snow lying on level ground and the tops of things, trodden through where men walked; and fog lying
 * in the ravines and big craters, up to a few metres below the lie of the land round them. Before the
 * fog of war and the scene's distance fog, so unseen and far ground still darken and fade over it.
 *
 * Water stands on any level surface below its hollow's water line, so a plank lying in a flooded crater goes under and
 * a crate standing in it doesn't.
 */
export class WeatherSurfacePlugin extends MaterialPluginBase {
  private readonly clouds: BaseTexture
  private readonly marks: SurfaceMarks
  private readonly surface: Readonly<WeatherSurface>
  private readonly options: WeatherSurfaceOptions

  constructor(
    material: Material,
    clouds: BaseTexture,
    marks: SurfaceMarks,
    surface: Readonly<WeatherSurface>,
    options: WeatherSurfaceOptions = {}
  ) {
    super(
      material,
      "WeatherSurface",
      205,
      { WEATHER_HEIGHT_FOG: false, WEATHER_FOG_ONLY: false, WEATHER_LOW: false },
      true,
      true
    )
    this.clouds = clouds
    this.marks = marks
    this.surface = surface
    this.options = options
  }

  override prepareDefines(defines: MaterialDefines, _scene: Scene, _mesh: AbstractMesh): void {
    defines["WEATHER_HEIGHT_FOG"] = Boolean(this.options.heightFog)
    defines["WEATHER_FOG_ONLY"] = Boolean(this.options.fogOnly)
    defines["WEATHER_LOW"] = Boolean(this.options.low)
  }

  override getClassName(): string {
    return "WeatherSurfacePlugin"
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("weatherCloudMap", "weatherBasinMap", "weatherTrackMap")
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    activeTextures.push(this.clouds, this.marks.basins, this.marks.tracks)
  }

  override hasTexture(texture: BaseTexture): boolean {
    return texture === this.clouds || texture === this.marks.basins || texture === this.marks.tracks
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[]
    fragment: string
  } {
    return {
      ubo: [
        { name: "weatherClouds", size: 4, type: "vec4" },
        { name: "weatherSnow", size: 4, type: "vec4" },
        { name: "weatherWater", size: 4, type: "vec4" },
        { name: "weatherReflect", size: 4, type: "vec4" },
        { name: "weatherMarks", size: 4, type: "vec4" },
        { name: "weatherHeightFog", size: 4, type: "vec4" }
      ],
      fragment:
        shaderLanguage === ShaderLanguage.GLSL
          ? "uniform vec4 weatherClouds;\nuniform vec4 weatherSnow;\nuniform vec4 weatherWater;\n" +
            "uniform vec4 weatherReflect;\nuniform vec4 weatherMarks;\nuniform vec4 weatherHeightFog;"
          : ""
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const { cloudOffsetX, cloudOffsetZ, shadowedShare, shadowDepth, snow, snowBrightness, groundFog } = this.surface
    uniformBuffer.updateFloat4(
      "weatherClouds",
      cloudOffsetX / CLOUD_SCALE,
      cloudOffsetZ / CLOUD_SCALE,
      shadowedShare,
      shadowDepth
    )
    uniformBuffer.updateFloat4("weatherSnow", snow, snowBrightness, 1 / CLOUD_SCALE, groundFog)
    const { waterMargin, waterShown, rain, time, reflectR, reflectG, reflectB } = this.surface
    uniformBuffer.updateFloat4("weatherWater", waterMargin, waterShown, rain, time)
    uniformBuffer.updateFloat4("weatherReflect", reflectR, reflectG, reflectB, this.marks.base)
    const { scale, offset } = this.marks
    uniformBuffer.updateFloat4("weatherMarks", scale.x, scale.y, offset.x, offset.y)
    const fog = this.options.heightFog
    uniformBuffer.updateFloat4("weatherHeightFog", fog?.density ?? 0, fog?.falloff ?? 0, fog?.base ?? 0, 0)
    uniformBuffer.setTexture("weatherCloudMap", this.clouds)
    uniformBuffer.setTexture("weatherBasinMap", this.marks.basins)
    uniformBuffer.setTexture("weatherTrackMap", this.marks.tracks)
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
        CUSTOM_FRAGMENT_DEFINITIONS:
          "var weatherCloudMap: texture_2d<f32>;\nvar weatherCloudMapSampler: sampler;\n" +
          "var weatherBasinMap: texture_2d<f32>;\nvar weatherBasinMapSampler: sampler;\n" +
          "var weatherTrackMap: texture_2d<f32>;\nvar weatherTrackMapSampler: sampler;\n" +
          HEIGHT_FOG_WGSL,
        CUSTOM_FRAGMENT_BEFORE_FOG: `
          #ifndef WEATHER_LOW
          let weatherMarksAt: vec2f = fragmentInputs.vPositionW.xz * uniforms.weatherMarks.xy + uniforms.weatherMarks.zw;
          let weatherBasins: vec2f = textureSample(weatherBasinMap, weatherBasinMapSampler, weatherMarksAt).rg + vec2f(uniforms.weatherReflect.w);
          #endif
          var weatherColor: vec3f = color.rgb;
          #ifndef WEATHER_FOG_ONLY
          let weatherGround: vec2f = fragmentInputs.vPositionW.xz * uniforms.weatherSnow.z;
          let weatherCloud: f32 = textureSample(weatherCloudMap, weatherCloudMapSampler, weatherGround + uniforms.weatherClouds.xy).r;
          let weatherShade: f32 = smoothstep(1.0 - uniforms.weatherClouds.z - 0.06, 1.0 - uniforms.weatherClouds.z + 0.06, weatherCloud);
          var weatherLevel: f32 = 1.0;
          #ifdef NORMAL
          weatherLevel = smoothstep(0.55, 0.85, normalize(fragmentInputs.vNormalW).y);
          #endif
          weatherColor = weatherColor * (1.0 - uniforms.weatherClouds.w * weatherShade);
          var weatherTrodden: f32 = 0.0;
          var weatherDrift: f32 = 0.5;
          #ifndef WEATHER_LOW
          weatherTrodden = textureSample(weatherTrackMap, weatherTrackMapSampler, weatherMarksAt).r;
          let weatherWet: f32 = clamp((weatherBasins.x - uniforms.weatherWater.x - fragmentInputs.vPositionW.y) * 25.0, 0.0, 1.0) * weatherLevel * uniforms.weatherWater.y;
          let weatherRipplesAt: vec2f = fragmentInputs.vPositionW.xz * 0.35;
          let weatherRipple: f32 = abs(textureSample(weatherCloudMap, weatherCloudMapSampler, weatherRipplesAt + vec2f(0.11, 0.07) * uniforms.weatherWater.w).r - textureSample(weatherCloudMap, weatherCloudMapSampler, weatherRipplesAt * 1.3 - vec2f(0.09, 0.13) * uniforms.weatherWater.w).r);
          let weatherFresnel: f32 = 0.1 + 0.6 * pow(1.0 - clamp(viewDirectionW.y, 0.0, 1.0), 5.0);
          weatherDrift = textureSample(weatherCloudMap, weatherCloudMapSampler, weatherGround * 6.7).r;
          let weatherPuddle: vec3f = mix(weatherColor * 0.35, uniforms.weatherReflect.rgb, weatherFresnel) * (1.0 + uniforms.weatherWater.z * (weatherRipple * 1.6 - 0.3));
          weatherColor = mix(weatherColor, weatherPuddle, weatherWet);
          weatherColor = weatherColor * (1.0 - 0.3 * uniforms.weatherSnow.x * weatherTrodden * weatherLevel);
          #endif
          let weatherSnowHere: f32 = clamp(uniforms.weatherSnow.x * 1.3 - weatherDrift * 0.8, 0.0, 0.8) * weatherLevel * (1.0 - 0.75 * weatherTrodden);
          weatherColor = mix(weatherColor, vec3f(0.72, 0.74, 0.78) * uniforms.weatherSnow.y, weatherSnowHere);
          #endif
          #ifndef WEATHER_LOW
          let weatherPool: f32 = smoothstep(1.0, 6.0, weatherBasins.y - fragmentInputs.vPositionW.y) * uniforms.weatherSnow.w;
          weatherColor = mix(weatherColor, uniforms.weatherReflect.rgb, weatherPool * 0.85);
          #endif
          #ifdef WEATHER_HEIGHT_FOG
          weatherColor = mix(uniforms.weatherReflect.rgb, weatherColor, heightFogTransmittance(scene.vEyePosition.xyz, fragmentInputs.vPositionW, uniforms.weatherHeightFog));
          #endif
          color = vec4f(weatherColor, color.a);
        `
      }
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS:
        "uniform sampler2D weatherCloudMap;\nuniform sampler2D weatherBasinMap;\nuniform sampler2D weatherTrackMap;\n" +
        HEIGHT_FOG_GLSL,
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        #ifndef WEATHER_LOW
        vec2 weatherMarksAt = vPositionW.xz * weatherMarks.xy + weatherMarks.zw;
        vec2 weatherBasins = texture2D(weatherBasinMap, weatherMarksAt).rg + vec2(weatherReflect.w);
        #endif
        #ifndef WEATHER_FOG_ONLY
        vec2 weatherGround = vPositionW.xz * weatherSnow.z;
        float weatherCloud = texture2D(weatherCloudMap, weatherGround + weatherClouds.xy).r;
        float weatherShade = smoothstep(1.0 - weatherClouds.z - 0.06, 1.0 - weatherClouds.z + 0.06, weatherCloud);
        float weatherLevel = 1.0;
        #ifdef NORMAL
        weatherLevel = smoothstep(0.55, 0.85, normalize(vNormalW).y);
        #endif
        color.rgb *= 1.0 - weatherClouds.w * weatherShade;
        float weatherTrodden = 0.0;
        float weatherDrift = 0.5;
        #ifndef WEATHER_LOW
        weatherTrodden = texture2D(weatherTrackMap, weatherMarksAt).r;
        float weatherWet = clamp((weatherBasins.x - weatherWater.x - vPositionW.y) * 25.0, 0.0, 1.0) * weatherLevel * weatherWater.y;
        vec2 weatherRipplesAt = vPositionW.xz * 0.35;
        float weatherRipple = abs(texture2D(weatherCloudMap, weatherRipplesAt + vec2(0.11, 0.07) * weatherWater.w).r - texture2D(weatherCloudMap, weatherRipplesAt * 1.3 - vec2(0.09, 0.13) * weatherWater.w).r);
        float weatherFresnel = 0.1 + 0.6 * pow(1.0 - clamp(viewDirectionW.y, 0.0, 1.0), 5.0);
        weatherDrift = texture2D(weatherCloudMap, weatherGround * 6.7).r;
        vec3 weatherPuddle = mix(color.rgb * 0.35, weatherReflect.rgb, weatherFresnel) * (1.0 + weatherWater.z * (weatherRipple * 1.6 - 0.3));
        color.rgb = mix(color.rgb, weatherPuddle, weatherWet);
        color.rgb *= 1.0 - 0.3 * weatherSnow.x * weatherTrodden * weatherLevel;
        #endif
        float weatherSnowHere = clamp(weatherSnow.x * 1.3 - weatherDrift * 0.8, 0.0, 0.8) * weatherLevel * (1.0 - 0.75 * weatherTrodden);
        color.rgb = mix(color.rgb, vec3(0.72, 0.74, 0.78) * weatherSnow.y, weatherSnowHere);
        #endif
        #ifndef WEATHER_LOW
        float weatherPool = smoothstep(1.0, 6.0, weatherBasins.y - vPositionW.y) * weatherSnow.w;
        color.rgb = mix(color.rgb, weatherReflect.rgb, weatherPool * 0.85);
        #endif
        #ifdef WEATHER_HEIGHT_FOG
        color.rgb = mix(weatherReflect.rgb, color.rgb, heightFogTransmittance(vEyePosition.xyz, vPositionW, weatherHeightFog));
        #endif
      `
    }
  }
}
