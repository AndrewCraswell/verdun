import type { Material } from "@babylonjs/core/Materials/material"
import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"

/** A box of the ground in world metres: x from `x0` to `x1`, z from `z0` to `z1`. */
export interface GroundBox {
  readonly x0: number
  readonly z0: number
  readonly x1: number
  readonly z1: number
}

/**
 * Leaves a hole in the theatre's ground where the sector being edited is drawn, so the sector's own ground, trenches and
 * all, shows through and the theatre's coarser ground doesn't cut across it. Works in GLSL (WebGL 2) and WGSL (WebGPU).
 */
export class SectorHolePlugin extends MaterialPluginBase {
  private readonly hole: GroundBox

  constructor(material: Material, hole: GroundBox) {
    super(material, "SectorHole", 200, undefined, true, true)
    this.hole = hole
  }

  override getClassName(): string {
    return "SectorHolePlugin"
  }

  override isCompatible(shaderLanguage: ShaderLanguage): boolean {
    return shaderLanguage === ShaderLanguage.GLSL || shaderLanguage === ShaderLanguage.WGSL
  }

  override getUniforms(shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL): {
    ubo: { name: string; size: number; type: string }[]
    fragment: string
  } {
    return {
      ubo: [{ name: "sectorHole", size: 4, type: "vec4" }],
      fragment: shaderLanguage === ShaderLanguage.GLSL ? "uniform vec4 sectorHole;" : ""
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const { x0, z0, x1, z1 } = this.hole
    uniformBuffer.updateFloat4("sectorHole", x0, z0, x1, z1)
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL
  ): Record<string, string> | null {
    if (shaderType !== "fragment") {
      return null
    }
    const [position, hole] =
      shaderLanguage === ShaderLanguage.WGSL
        ? ["fragmentInputs.vPositionW", "uniforms.sectorHole"]
        : ["vPositionW", "sectorHole"]
    return {
      CUSTOM_FRAGMENT_MAIN_BEGIN: `if (${position}.x > ${hole}.x && ${position}.x < ${hole}.z && ${position}.z > ${hole}.y && ${position}.z < ${hole}.w) { discard; }`
    }
  }
}
