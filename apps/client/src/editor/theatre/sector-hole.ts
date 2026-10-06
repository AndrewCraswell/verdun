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

/** No box: nothing is cut away. */
export const NO_BOX: GroundBox = { x0: 0, z0: 0, x1: 0, z1: 0 }

/**
 * Leaves holes in the theatre's ground where finer ground is drawn instead: the sector being edited, its trenches and
 * all, and the square of 1 m ground round the camera. `holes` is read each frame, so a hole can move by changing
 * what it gives. Works in GLSL (WebGL 2) and WGSL (WebGPU).
 */
export class SectorHolePlugin extends MaterialPluginBase {
  private readonly holes: () => readonly [GroundBox, GroundBox]

  constructor(material: Material, holes: () => readonly [GroundBox, GroundBox]) {
    super(material, "SectorHole", 200, undefined, true, true)
    this.holes = holes
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
      ubo: [
        { name: "sectorHole", size: 4, type: "vec4" },
        { name: "fineHole", size: 4, type: "vec4" }
      ],
      fragment: shaderLanguage === ShaderLanguage.GLSL ? "uniform vec4 sectorHole;\nuniform vec4 fineHole;" : ""
    }
  }

  override bindForSubMesh(uniformBuffer: UniformBuffer): void {
    const [sector, fine] = this.holes()
    uniformBuffer.updateFloat4("sectorHole", sector.x0, sector.z0, sector.x1, sector.z1)
    uniformBuffer.updateFloat4("fineHole", fine.x0, fine.z0, fine.x1, fine.z1)
  }

  override getCustomCode(
    shaderType: string,
    shaderLanguage: ShaderLanguage = ShaderLanguage.GLSL
  ): Record<string, string> | null {
    if (shaderType !== "fragment") {
      return null
    }
    const wgsl = shaderLanguage === ShaderLanguage.WGSL
    const position = wgsl ? "fragmentInputs.vPositionW" : "vPositionW"
    const inside = (hole: string) => {
      const box = wgsl ? `uniforms.${hole}` : hole
      return `(${position}.x > ${box}.x && ${position}.x < ${box}.z && ${position}.z > ${box}.y && ${position}.z < ${box}.w)`
    }
    return {
      CUSTOM_FRAGMENT_MAIN_BEGIN: `if (${inside("sectorHole")} || ${inside("fineHole")}) { discard; }`
    }
  }
}
