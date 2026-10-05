import type { Material } from "@babylonjs/core/Materials/material"
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import { SPLAT_ATTRIBUTE, WETNESS_ATTRIBUTE } from "./terrain-chunks.ts"

/** One ground layer: its colour and its normal map. */
export interface GroundLayer {
  readonly albedo: BaseTexture
  readonly normal: BaseTexture
}

/** Where shells have blackened the ground: a single-channel texture spread over the map, `width` by `depth` metres. */
export interface GroundScorch {
  readonly texture: BaseTexture
  readonly width: number
  readonly depth: number
}

/** The ground layers, in the order their weights are stored: churned ground takes whatever share is left. */
export interface GroundLayers {
  readonly grass: GroundLayer
  readonly mud: GroundLayer
  readonly chalk: GroundLayer
  readonly churned: GroundLayer
}

/** Ground textures repeat every this many metres. */
const TILE_METERS = 7
/** A second lookup, rotated and larger, blended in to break up the repeat. */
const BREAKUP_SCALE = 0.37
const BREAKUP_ANGLE = 0.6
/**
 * Layers blend by their textures' brightness as well as their weights, so pebbles and clods poke through a neighbouring
 * layer and edges come out ragged. `HEIGHT_INFLUENCE` is how much brightness counts; `BLEND_DEPTH` how soft the edge is.
 */
const HEIGHT_INFLUENCE = 0.6
const BLEND_DEPTH = 0.2
/** How strongly the normal maps bend the ground's normal: Synty's are painted bold for close-up props. */
const NORMAL_STRENGTH = 0.7
/**
 * Steep ground (crater walls, the ravine's banks, the sunken road's sides) takes its colour from a second lookup
 * projected sideways, so textures don't smear down the slope. It fades in as the ground's normal tilts from
 * `STEEP_START` to `STEEP_FULL` (the normal's upward component).
 */
const STEEP_START = 0.8
const STEEP_FULL = 0.55
/** Colour of wet ground relative to dry: darker, a little cooler. */
const WET_TINT = [0.62, 0.64, 0.68] as const
/** Colour of burnt ground relative to unburnt, where the scorch is full. */
const SCORCH_TINT = [0.26, 0.22, 0.19] as const
const SCORCH_SAMPLER = "groundScorch"

const LAYERS = ["Grass", "Mud", "Chalk", "Churned"] as const
/** Each layer's weight in the splat's vec4. */
const CHANNELS = ["x", "y", "z", "w"] as const
const ALBEDO_SAMPLERS = LAYERS.map((layer) => `ground${layer}`)
const NORMAL_SAMPLERS = LAYERS.map((layer) => `ground${layer}Normal`)

interface ShaderSyntax {
  readonly vec2: string
  readonly vec3: string
  readonly vec4: string
  readonly float: string
  /** Samples a texture: `sample(sampler, uv)`. */
  sample(sampler: string, uv: string): string
  /**
   * Samples a texture with the screen-space gradients of its coordinates given, `${uv}Dx` and `${uv}Dy` (see
   * `gradients`), so it can be skipped inside a branch: sampling there with implicit gradients is undefined.
   */
  sampleGrad(sampler: string, uv: string): string
  /** Declares `${uv}Dx` and `${uv}Dy`, the gradients of a vec2 local. Only where every pixel of the quad runs. */
  gradients(uv: string): string
  readonly position: string
  /** Picks `b` where `condition` holds, else `a`. */
  select(a: string, b: string, condition: string): string
  readonly splat: string
  readonly wetness: string
  readonly params: string
  readonly scorchParams: string
}

const GLSL: ShaderSyntax = {
  vec2: "vec2",
  vec3: "vec3",
  vec4: "vec4",
  float: "float",
  sample: (sampler, uv) => `texture2D(${sampler}, ${uv})`,
  sampleGrad: (sampler, uv) => `textureGrad(${sampler}, ${uv}, ${uv}Dx, ${uv}Dy)`,
  gradients: (uv) => `vec2 ${uv}Dx = dFdx(${uv});\nvec2 ${uv}Dy = dFdy(${uv});`,
  position: "vPositionW",
  select: (a, b, condition) => `((${condition}) ? ${b} : ${a})`,
  splat: "vGroundSplat",
  wetness: "vGroundWetness",
  params: "groundSplatParams",
  scorchParams: "groundScorchParams"
}

const WGSL: ShaderSyntax = {
  vec2: "vec2f",
  vec3: "vec3f",
  vec4: "vec4f",
  float: "f32",
  sample: (sampler, uv) => `textureSample(${sampler}, ${sampler}Sampler, ${uv})`,
  sampleGrad: (sampler, uv) => `textureSampleGrad(${sampler}, ${sampler}Sampler, ${uv}, ${uv}Dx, ${uv}Dy)`,
  gradients: (uv) => `let ${uv}Dx: vec2f = dpdx(${uv});\nlet ${uv}Dy: vec2f = dpdy(${uv});`,
  position: "fragmentInputs.vPositionW",
  select: (a, b, condition) => `select(${a}, ${b}, ${condition})`,
  splat: "fragmentInputs.vGroundSplat",
  wetness: "fragmentInputs.vGroundWetness",
  params: "uniforms.groundSplatParams",
  scorchParams: "uniforms.groundScorchParams"
}

/** Declares a local: `var x: vec3f = ...` in WGSL, `vec3 x = ...` in GLSL. */
function declare(syntax: ShaderSyntax, type: string, name: string, value: string): string {
  return syntax === WGSL ? `var ${name}: ${type} = ${value};` : `${type} ${name} = ${value};`
}

/** The ground's colour and normal from the blended layers, replacing the material's diffuse colour. */
function groundCode(s: ShaderSyntax): string {
  // Each layer is looked up only where it's present, and sideways only on steep ground: most of the ground is one or
  // two layers on the flat, and every lookup skipped is one fewer filtered fetch for every pixel of it.
  const albedo = (index: number) => {
    const sampler = ALBEDO_SAMPLERS[index] ?? ""
    const layer = `groundLayer${index}`
    return [
      `if (groundWeights.${CHANNELS[index]} >= 0.0001) {`,
      `${layer} = mix(${s.sampleGrad(sampler, "groundUv")}.rgb, ${s.sampleGrad(sampler, "groundBreakupUv")}.rgb, 0.35);`,
      `if (groundSteep > 0.0) { ${layer} = mix(${layer}, ${s.sampleGrad(sampler, "groundSideUv")}.rgb, groundSteep); }`,
      "}"
    ].join("\n")
  }
  const normal = (index: number) => {
    const weight = `groundWeights.${CHANNELS[index]}`
    return `if (${weight} > 0.0) { groundNormal += ${s.sampleGrad(NORMAL_SAMPLERS[index] ?? "", "groundUv")}.rgb * ${weight}; }`
  }
  return [
    declare(s, s.vec2, "groundXz", `${s.position}.xz`),
    declare(s, s.vec2, "groundUv", `groundXz * ${s.params}.x`),
    declare(
      s,
      s.vec2,
      "groundBreakupUv",
      `${s.vec2}(groundXz.x * ${s.params}.z - groundXz.y * ${s.params}.w, groundXz.x * ${s.params}.w + groundXz.y * ${s.params}.z) * ${s.params}.y`
    ),
    // The sideways lookup faces whichever of east or north the slope faces more.
    declare(
      s,
      s.vec2,
      "groundSideUv",
      `${s.select(`${s.position}.xy`, `${s.position}.zy`, "abs(normalW.x) > abs(normalW.z)")} * ${s.params}.x`
    ),
    declare(
      s,
      s.float,
      "groundSteep",
      `clamp((${STEEP_START.toFixed(2)} - abs(normalW.y)) / ${(STEEP_START - STEEP_FULL).toFixed(2)}, 0.0, 1.0)`
    ),
    s.gradients("groundUv"),
    s.gradients("groundBreakupUv"),
    s.gradients("groundSideUv"),
    declare(
      s,
      s.vec4,
      "groundWeights",
      `${s.vec4}(${s.splat}.xyz, max(0.0, 1.0 - ${s.splat}.x - ${s.splat}.y - ${s.splat}.z))`
    ),
    ...LAYERS.map((_, index) => declare(s, s.vec3, `groundLayer${index}`, `${s.vec3}(0.0)`)),
    ...LAYERS.map((_, index) => albedo(index)),
    declare(
      s,
      s.vec4,
      "groundHeights",
      `${s.vec4}(dot(groundLayer0, ${s.vec3}(0.333)), dot(groundLayer1, ${s.vec3}(0.333)), dot(groundLayer2, ${s.vec3}(0.333)), dot(groundLayer3, ${s.vec3}(0.333)))`
    ),
    declare(s, s.vec4, "groundBlend", `groundWeights + groundHeights * ${HEIGHT_INFLUENCE.toFixed(2)}`),
    declare(
      s,
      s.float,
      "groundTop",
      `max(max(groundBlend.x, groundBlend.y), max(groundBlend.z, groundBlend.w)) - ${BLEND_DEPTH.toFixed(2)}`
    ),
    // Never bring in a layer that isn't here at all.
    `groundWeights = max(groundBlend - ${s.vec4}(groundTop), ${s.vec4}(0.0)) * step(${s.vec4}(0.0001), groundWeights);`,
    `groundWeights = groundWeights / max(dot(groundWeights, ${s.vec4}(1.0)), 0.0001);`,
    declare(
      s,
      s.vec3,
      "groundColor",
      `groundLayer0 * groundWeights.x + groundLayer1 * groundWeights.y + groundLayer2 * groundWeights.z + groundLayer3 * groundWeights.w`
    ),
    declare(s, s.vec3, "groundNormal", `${s.vec3}(0.0)`),
    ...LAYERS.map((_, index) => normal(index)),
    "groundNormal = groundNormal * 2.0 - 1.0;",
    // Texture u runs east and v north: bend the normal in that frame.
    declare(s, s.vec3, "groundTangent", `normalize(${s.vec3}(1.0, 0.0, 0.0) - normalW * normalW.x)`),
    declare(s, s.vec3, "groundBitangent", "cross(groundTangent, normalW)"),
    `normalW = normalize(groundTangent * groundNormal.x * ${NORMAL_STRENGTH.toFixed(2)} + groundBitangent * groundNormal.y * ${NORMAL_STRENGTH.toFixed(2)} + normalW * groundNormal.z);`,
    `groundColor = mix(groundColor, groundColor * ${s.vec3}(${WET_TINT.join(", ")}), ${s.wetness});`,
    declare(s, s.float, "groundScorch", `${s.sample(SCORCH_SAMPLER, `groundXz * ${s.scorchParams}.xy`)}.r`),
    `groundColor = mix(groundColor, groundColor * ${s.vec3}(${SCORCH_TINT.join(", ")}), groundScorch);`,
    s === WGSL
      ? `baseColor = vec4f(groundColor * ${s.splat}.w, baseColor.a);`
      : `baseColor.rgb = groundColor * ${s.splat}.w;`
  ].join("\n")
}

/**
 * Textures the terrain with the Synty ground layers, in place of the flat vertex colours. Layers blend per vertex by
 * the chunk's splat weights, sharpened by each texture's brightness so edges come out ragged; their normal maps bend
 * the ground's normal, muddy hollows darken where water stands, steep ground takes a sideways lookup, and the ground
 * blackens where the scorch map says shells burst. Texture coordinates come from world position, so layers line up
 * across chunks. Works in both GLSL (WebGL2) and WGSL (WebGPU).
 */
export class GroundSplatPlugin extends MaterialPluginBase {
  private readonly layers: GroundLayers
  private readonly scorch: GroundScorch

  constructor(material: Material, layers: GroundLayers, scorch: GroundScorch) {
    super(material, "GroundSplat", 150, undefined, true, true)
    this.layers = layers
    this.scorch = scorch
  }

  private textures(): BaseTexture[] {
    const { grass, mud, chalk, churned } = this.layers
    return [...[grass, mud, chalk, churned].flatMap((layer) => [layer.albedo, layer.normal]), this.scorch.texture]
  }

  override getClassName(): string {
    return "GroundSplatPlugin"
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL
  }

  override isReadyForSubMesh(): boolean {
    return this.textures().every((texture) => texture.isReady())
  }

  override getAttributes(attributes: string[]): void {
    attributes.push(SPLAT_ATTRIBUTE, WETNESS_ATTRIBUTE)
  }

  override getSamplers(samplers: string[]): void {
    samplers.push(...ALBEDO_SAMPLERS, ...NORMAL_SAMPLERS, SCORCH_SAMPLER)
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    activeTextures.push(...this.textures())
  }

  override hasTexture(texture: BaseTexture): boolean {
    return this.textures().includes(texture)
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[]
    fragment: string
  } {
    return {
      ubo: [
        { name: "groundSplatParams", size: 4, type: "vec4" },
        { name: "groundScorchParams", size: 2, type: "vec2" }
      ],
      fragment:
        shaderLanguage === ShaderLanguage.GLSL
          ? "uniform vec4 groundSplatParams;\nuniform vec2 groundScorchParams;"
          : ""
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    uniformBuffer.updateFloat4(
      "groundSplatParams",
      1 / TILE_METERS,
      BREAKUP_SCALE / TILE_METERS,
      Math.cos(BREAKUP_ANGLE),
      Math.sin(BREAKUP_ANGLE)
    )
    uniformBuffer.updateFloat2("groundScorchParams", 1 / this.scorch.width, 1 / this.scorch.depth)
    const { grass, mud, chalk, churned } = this.layers
    for (const [index, layer] of [grass, mud, chalk, churned].entries()) {
      uniformBuffer.setTexture(ALBEDO_SAMPLERS[index] ?? "", layer.albedo)
      uniformBuffer.setTexture(NORMAL_SAMPLERS[index] ?? "", layer.normal)
    }
    uniformBuffer.setTexture(SCORCH_SAMPLER, this.scorch.texture)
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL
  ): Record<string, string> | null {
    const wgsl = shaderLanguage === ShaderLanguage.WGSL
    if (shaderType === "vertex") {
      return wgsl
        ? {
            CUSTOM_VERTEX_DEFINITIONS: [
              `attribute ${SPLAT_ATTRIBUTE}: vec4f;`,
              `attribute ${WETNESS_ATTRIBUTE}: f32;`,
              "varying vGroundSplat: vec4f;",
              "varying vGroundWetness: f32;"
            ].join("\n"),
            CUSTOM_VERTEX_MAIN_END: [
              `vertexOutputs.vGroundSplat = vertexInputs.${SPLAT_ATTRIBUTE};`,
              `vertexOutputs.vGroundWetness = vertexInputs.${WETNESS_ATTRIBUTE};`
            ].join("\n")
          }
        : {
            CUSTOM_VERTEX_DEFINITIONS: [
              `attribute vec4 ${SPLAT_ATTRIBUTE};`,
              `attribute float ${WETNESS_ATTRIBUTE};`,
              "varying vec4 vGroundSplat;",
              "varying float vGroundWetness;"
            ].join("\n"),
            CUSTOM_VERTEX_MAIN_END: `vGroundSplat = ${SPLAT_ATTRIBUTE};\nvGroundWetness = ${WETNESS_ATTRIBUTE};`
          }
    }
    if (shaderType !== "fragment") {
      return null
    }
    const samplers = [...ALBEDO_SAMPLERS, ...NORMAL_SAMPLERS, SCORCH_SAMPLER]
    if (wgsl) {
      return {
        CUSTOM_FRAGMENT_DEFINITIONS: [
          "varying vGroundSplat: vec4f;",
          "varying vGroundWetness: f32;",
          ...samplers.flatMap((sampler) => [`var ${sampler}Sampler: sampler;`, `var ${sampler}: texture_2d<f32>;`])
        ].join("\n"),
        CUSTOM_FRAGMENT_UPDATE_DIFFUSE: groundCode(WGSL)
      }
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: [
        "varying vec4 vGroundSplat;",
        "varying float vGroundWetness;",
        ...samplers.map((sampler) => `uniform sampler2D ${sampler};`)
      ].join("\n"),
      CUSTOM_FRAGMENT_UPDATE_DIFFUSE: groundCode(GLSL)
    }
  }
}
