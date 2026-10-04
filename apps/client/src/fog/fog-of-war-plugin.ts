import type { Material } from "@babylonjs/core/Materials/material"
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"

export interface FogOfWarSettings {
  /** The visibility texture: one red channel value per fog cell, covering the whole map. */
  readonly texture: BaseTexture
  readonly mapWidth: number
  readonly mapDepth: number
  /** Brightness of ground the player can't currently see, from 0 (black) to 1 (no darkening). */
  readonly unseenBrightness?: number
}

/**
 * Darkens ground the player can't currently see, in both GLSL (WebGL2) and WGSL (WebGPU). Applied before the scene's
 * distance fog, so far ground still fades into the haze.
 */
export class FogOfWarPlugin extends MaterialPluginBase {
  private readonly settings: Required<FogOfWarSettings>

  constructor(material: Material, settings: FogOfWarSettings) {
    super(material, "FogOfWar", 210, undefined, true, true)
    this.settings = { unseenBrightness: 0.4, ...settings }
  }

  override getClassName(): string {
    return "FogOfWarPlugin"
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL
  }

  override getSamplers(samplers: string[]): void {
    samplers.push("fogOfWar")
  }

  override getActiveTextures(activeTextures: BaseTexture[]): void {
    activeTextures.push(this.settings.texture)
  }

  override hasTexture(texture: BaseTexture): boolean {
    return texture === this.settings.texture
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[]
    fragment: string
  } {
    return {
      ubo: [{ name: "fogOfWarParams", size: 4, type: "vec4" }],
      fragment: shaderLanguage === ShaderLanguage.GLSL ? "uniform vec4 fogOfWarParams;" : ""
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const { mapWidth, mapDepth, unseenBrightness, texture } = this.settings
    uniformBuffer.updateFloat4("fogOfWarParams", 1 / mapWidth, 1 / mapDepth, unseenBrightness, 0)
    uniformBuffer.setTexture("fogOfWar", texture)
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
        CUSTOM_FRAGMENT_DEFINITIONS: "var fogOfWar: texture_2d<f32>;\nvar fogOfWarSampler: sampler;",
        CUSTOM_FRAGMENT_BEFORE_FOG: `
          let fogOfWarSeen: f32 = textureSample(fogOfWar, fogOfWarSampler, fragmentInputs.vPositionW.xz * uniforms.fogOfWarParams.xy).r;
          color = vec4f(color.rgb * mix(uniforms.fogOfWarParams.z, 1.0, fogOfWarSeen), color.a);
        `
      }
    }
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: "uniform sampler2D fogOfWar;",
      CUSTOM_FRAGMENT_BEFORE_FOG: `
        float fogOfWarSeen = texture2D(fogOfWar, vPositionW.xz * fogOfWarParams.xy).r;
        color.rgb *= mix(fogOfWarParams.z, 1.0, fogOfWarSeen);
      `
    }
  }
}
