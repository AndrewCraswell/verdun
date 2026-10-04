import type { Material } from "@babylonjs/core/Materials/material"
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"

/** Vertex buffer kind holding per-vertex surface weights: grass, mud, chalk, churned. */
export const SPLAT_KIND = "splat"

/** One ground texture per surface, in `Surface` order. */
export interface SplatLayers {
  readonly grass: BaseTexture
  readonly mud: BaseTexture
  readonly chalk: BaseTexture
  readonly churned: BaseTexture
}

const SAMPLERS = ["grassLayer", "mudLayer", "chalkLayer", "churnedLayer"] as const

type Rgb = readonly [number, number, number]

/** Colour multipliers per layer, grading the four source photos toward the muted palette. */
export interface SplatTints {
  readonly grass: Rgb
  readonly mud: Rgb
  readonly chalk: Rgb
  readonly churned: Rgb
}

const DEFAULT_TINTS: SplatTints = {
  grass: [0.82, 0.86, 0.72],
  mud: [0.72, 0.64, 0.58],
  // The chalk layer uses a darker stony texture as its base, so it's brightened.
  chalk: [1.75, 1.72, 1.62],
  churned: [0.62, 0.56, 0.5]
}

export interface TerrainSplatOptions {
  /** Ground textures repeat every this many metres, in world space so they line up across chunks. */
  readonly tileMeters?: number
  /** How far to pull the blended colour toward grey, from 0 (none) to 1. */
  readonly desaturation?: number
  readonly tints?: SplatTints
}

const TINT_UNIFORMS = ["splatTintGrass", "splatTintMud", "splatTintChalk", "splatTintChurned"] as const

// Each layer is sampled twice, the second time at another scale and rotated 37 degrees, and the two are averaged.
// That breaks up the visible grid a single repeating photo makes across a battlefield.
const GLSL_FRAGMENT_DEFINITIONS = `
  varying vec4 vSplat;
  uniform sampler2D grassLayer;
  uniform sampler2D mudLayer;
  uniform sampler2D chalkLayer;
  uniform sampler2D churnedLayer;

  vec3 splatSample(sampler2D layer, vec2 uv) {
    vec2 rotatedUV = mat2(0.799, -0.602, 0.602, 0.799) * uv * 0.61 + vec2(0.37, 0.71);
    return 0.5 * (texture2D(layer, uv).rgb + texture2D(layer, rotatedUV).rgb);
  }
`

// Replaces the base colour with the weighted, tinted blend of the four ground layers. The existing base colour carries
// the vertex colour, a broad brightness variation that also hides tiling, so it multiplies the blend.
const GLSL_UPDATE_DIFFUSE = `
  vec2 splatUV = vPositionW.xz * splatOptions.x;
  vec4 splatWeights = vSplat / max(dot(vSplat, vec4(1.0)), 0.0001);
  vec3 splatColor =
    splatSample(grassLayer, splatUV) * splatTintGrass.rgb * splatWeights.x +
    splatSample(mudLayer, splatUV) * splatTintMud.rgb * splatWeights.y +
    splatSample(chalkLayer, splatUV) * splatTintChalk.rgb * splatWeights.z +
    splatSample(churnedLayer, splatUV) * splatTintChurned.rgb * splatWeights.w;
  float splatLuma = dot(splatColor, vec3(0.299, 0.587, 0.114));
  splatColor = mix(splatColor, vec3(splatLuma), splatOptions.y);
  baseColor.rgb = splatColor * baseColor.rgb;
`

const WGSL_FRAGMENT_DEFINITIONS = `
  varying vSplat: vec4f;
  var grassLayer: texture_2d<f32>;
  var grassLayerSampler: sampler;
  var mudLayer: texture_2d<f32>;
  var mudLayerSampler: sampler;
  var chalkLayer: texture_2d<f32>;
  var chalkLayerSampler: sampler;
  var churnedLayer: texture_2d<f32>;
  var churnedLayerSampler: sampler;

  fn splatSample(layer: texture_2d<f32>, layerSampler: sampler, uv: vec2f) -> vec3f {
    let rotatedUV: vec2f = mat2x2f(0.799, -0.602, 0.602, 0.799) * uv * 0.61 + vec2f(0.37, 0.71);
    return 0.5 * (textureSample(layer, layerSampler, uv).rgb + textureSample(layer, layerSampler, rotatedUV).rgb);
  }
`

const WGSL_UPDATE_DIFFUSE = `
  let splatUV: vec2f = fragmentInputs.vPositionW.xz * uniforms.splatOptions.x;
  let splatWeights: vec4f = fragmentInputs.vSplat / max(dot(fragmentInputs.vSplat, vec4f(1.0)), 0.0001);
  var splatColor: vec3f =
    splatSample(grassLayer, grassLayerSampler, splatUV) * uniforms.splatTintGrass.rgb * splatWeights.x +
    splatSample(mudLayer, mudLayerSampler, splatUV) * uniforms.splatTintMud.rgb * splatWeights.y +
    splatSample(chalkLayer, chalkLayerSampler, splatUV) * uniforms.splatTintChalk.rgb * splatWeights.z +
    splatSample(churnedLayer, churnedLayerSampler, splatUV) * uniforms.splatTintChurned.rgb * splatWeights.w;
  let splatLuma: f32 = dot(splatColor, vec3f(0.299, 0.587, 0.114));
  splatColor = mix(splatColor, vec3f(splatLuma), uniforms.splatOptions.y);
  baseColor = vec4f(splatColor * baseColor.rgb, baseColor.a);
`

/**
 * Texture splatting for terrain on a StandardMaterial, in both GLSL (WebGL2) and WGSL (WebGPU), so WebGPU never needs
 * Babylon's GLSL-to-WGSL converter from its CDN. Lighting, fog and shadows stay the StandardMaterial's own.
 */
export class TerrainSplatPlugin extends MaterialPluginBase {
  private readonly layers: SplatLayers
  private readonly tileMeters: number
  private readonly desaturation: number
  private readonly tints: SplatTints

  constructor(
    material: Material,
    layers: SplatLayers,
    { tileMeters = 7, desaturation = 0.25, tints = DEFAULT_TINTS }: TerrainSplatOptions = {}
  ) {
    super(material, "TerrainSplat", 200, undefined, true, true)
    this.layers = layers
    this.tileMeters = tileMeters
    this.desaturation = desaturation
    this.tints = tints
  }

  override getClassName(): string {
    return "TerrainSplatPlugin"
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL
  }

  override getAttributes(attributes: string[]): void {
    attributes.push(SPLAT_KIND)
  }

  override getSamplers(samplers: string[]): void {
    samplers.push(...SAMPLERS)
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    activeTextures.push(this.layers.grass, this.layers.mud, this.layers.chalk, this.layers.churned)
  }

  override hasTexture(texture: BaseTexture): boolean {
    return Object.values(this.layers).includes(texture)
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[]
    fragment: string
  } {
    const names = ["splatOptions", ...TINT_UNIFORMS]
    return {
      ubo: names.map((name) => ({ name, size: 4, type: "vec4" })),
      fragment: shaderLanguage === ShaderLanguage.GLSL ? names.map((name) => `uniform vec4 ${name};`).join("\n") : ""
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat4("splatOptions", 1 / this.tileMeters, this.desaturation, 0, 0)
    const { grass, mud, chalk, churned } = this.tints
    const tints = [grass, mud, chalk, churned]
    TINT_UNIFORMS.forEach((name, index) => {
      const [r, g, b] = tints[index]
      uniformBuffer.updateFloat4(name, r, g, b, 1)
    })
    uniformBuffer.setTexture("grassLayer", this.layers.grass)
    uniformBuffer.setTexture("mudLayer", this.layers.mud)
    uniformBuffer.setTexture("chalkLayer", this.layers.chalk)
    uniformBuffer.setTexture("churnedLayer", this.layers.churned)
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL
  ): Record<string, string> | null {
    const wgsl = shaderLanguage === ShaderLanguage.WGSL
    if (shaderType === "vertex") {
      return wgsl
        ? {
            CUSTOM_VERTEX_DEFINITIONS: "attribute splat: vec4f;\nvarying vSplat: vec4f;",
            CUSTOM_VERTEX_MAIN_END: "vertexOutputs.vSplat = input.splat;"
          }
        : {
            CUSTOM_VERTEX_DEFINITIONS: "attribute vec4 splat;\nvarying vec4 vSplat;",
            CUSTOM_VERTEX_MAIN_END: "vSplat = splat;"
          }
    }
    if (shaderType === "fragment") {
      return wgsl
        ? {
            CUSTOM_FRAGMENT_DEFINITIONS: WGSL_FRAGMENT_DEFINITIONS,
            CUSTOM_FRAGMENT_UPDATE_DIFFUSE: WGSL_UPDATE_DIFFUSE
          }
        : {
            CUSTOM_FRAGMENT_DEFINITIONS: GLSL_FRAGMENT_DEFINITIONS,
            CUSTOM_FRAGMENT_UPDATE_DIFFUSE: GLSL_UPDATE_DIFFUSE
          }
    }
    return null
  }
}
