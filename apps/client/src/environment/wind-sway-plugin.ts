import type { Material } from "@babylonjs/core/Materials/material"
import type { MaterialDefines } from "@babylonjs/core/Materials/materialDefines"
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import type { Scene } from "@babylonjs/core/scene"

/** The wind as the plants feel it this frame: uniforms, so gusts never recompile a shader. */
export interface Wind {
  /** Which way it blows, a unit vector on the ground (x east, z north). */
  towardX: number
  towardZ: number
  /** How hard, from 0 (a still day) to about 3 (a gale): metres a plant leans for each metre of its height, ×0.2. */
  strength: number
  /** Seconds, for the sway's swing and the gusts rolling across the field. */
  time: number
}

/**
 * How freely a mesh sways, from its `metadata.sway` (the level tags its plants: grass 1, crowned dead trees 0.25, trees
 * stripped to poles 0.1), or 0 for everything that stands still.
 */
export function swayOf(mesh: AbstractMesh | undefined): number {
  const metadata: unknown = mesh?.metadata
  if (typeof metadata !== "object" || metadata === null || !("sway" in metadata)) {
    return 0
  }
  return typeof metadata.sway === "number" ? metadata.sway : 0
}

/**
 * Bends grass and trees with the wind, in both GLSL (WebGL2) and WGSL (WebGPU), on the kit's shared materials. Only the
 * meshes tagged to sway compile the swaying variant; stiffness comes in three bands (grass, trees, poles), each its own
 * variant, so one material can draw all three without a per-mesh uniform. A plant leans downwind in proportion to its
 * height, swings about that, and gusts roll across the field; each instance's place sets its phase, so neighbours don't
 * move in step. Shadows are drawn by Babylon's own depth shader and stay still.
 */
export class WindSwayPlugin extends MaterialPluginBase {
  private readonly wind: Readonly<Wind>

  constructor(material: Material, wind: Readonly<Wind>) {
    super(material, "WindSway", 210, { WINDSWAY: false, WINDSWAY_TREE: false, WINDSWAY_POLE: false }, true, true)
    this.wind = wind
  }

  override getClassName(): string {
    return "WindSwayPlugin"
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL
  }

  override prepareDefines(defines: MaterialDefines, _scene: Scene, mesh: AbstractMesh): void {
    const sway = swayOf(mesh)
    defines["WINDSWAY"] = sway > 0
    defines["WINDSWAY_TREE"] = sway > 0.15 && sway < 0.5
    defines["WINDSWAY_POLE"] = sway > 0 && sway <= 0.15
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[]
    vertex: string
  } {
    return {
      ubo: [{ name: "windSway", size: 4, type: "vec4" }],
      vertex: shaderLanguage === ShaderLanguage.GLSL ? "uniform vec4 windSway;" : ""
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const { towardX, towardZ, strength, time } = this.wind
    uniformBuffer.updateFloat4("windSway", towardX, towardZ, strength, time)
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL
  ): Record<string, string> | null {
    if (shaderType !== "vertex") {
      return null
    }
    if (shaderLanguage === ShaderLanguage.WGSL) {
      return {
        CUSTOM_VERTEX_UPDATE_WORLDPOS: `
          #ifdef WINDSWAY
          var windStiffness: f32 = 1.0;
          #ifdef WINDSWAY_TREE
          windStiffness = 0.25;
          #endif
          #ifdef WINDSWAY_POLE
          windStiffness = 0.1;
          #endif
          let windRoot: vec3f = finalWorld[3].xyz;
          let windPhase: f32 = dot(windRoot.xz, vec2f(0.21, 0.17));
          let windGust: f32 = 0.6 + 0.4 * sin(uniforms.windSway.w * 0.45 - dot(windRoot.xz, uniforms.windSway.xy) * 0.04);
          let windSwing: f32 = 0.7 + 0.3 * sin(uniforms.windSway.w * (1.6 + 0.6 * windStiffness) + windPhase);
          let windLean: f32 = 0.2 * uniforms.windSway.z * windStiffness * windGust * windSwing * max(positionUpdated.y, 0.0);
          let windFlutter: f32 = 0.25 * windLean * sin(uniforms.windSway.w * 3.1 + windPhase * 1.7);
          worldPos = vec4f(worldPos.x + uniforms.windSway.x * windLean - uniforms.windSway.y * windFlutter, worldPos.y, worldPos.z + uniforms.windSway.y * windLean + uniforms.windSway.x * windFlutter, worldPos.w);
          #endif
        `
      }
    }
    return {
      CUSTOM_VERTEX_UPDATE_WORLDPOS: `
        #ifdef WINDSWAY
        float windStiffness = 1.0;
        #ifdef WINDSWAY_TREE
        windStiffness = 0.25;
        #endif
        #ifdef WINDSWAY_POLE
        windStiffness = 0.1;
        #endif
        vec3 windRoot = finalWorld[3].xyz;
        float windPhase = dot(windRoot.xz, vec2(0.21, 0.17));
        float windGust = 0.6 + 0.4 * sin(windSway.w * 0.45 - dot(windRoot.xz, windSway.xy) * 0.04);
        float windSwing = 0.7 + 0.3 * sin(windSway.w * (1.6 + 0.6 * windStiffness) + windPhase);
        float windLean = 0.2 * windSway.z * windStiffness * windGust * windSwing * max(positionUpdated.y, 0.0);
        float windFlutter = 0.25 * windLean * sin(windSway.w * 3.1 + windPhase * 1.7);
        worldPos.xz += windSway.xy * windLean + vec2(-windSway.y, windSway.x) * windFlutter;
        #endif
      `
    }
  }
}
