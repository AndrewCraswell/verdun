import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { swayOf, WindSwayPlugin } from "./wind-sway-plugin.ts"

const engines: NullEngine[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function scene(): Scene {
  const engine = new NullEngine()
  engines.push(engine)
  return new Scene(engine)
}

describe("WindSwayPlugin", () => {
  it("compiles the swaying variant only for tagged plants, by their stiffness", () => {
    const world = scene()
    const plugin = new WindSwayPlugin(new StandardMaterial("kit", world), {
      towardX: 1,
      towardZ: 0,
      strength: 1,
      time: 0
    })
    const tagged = (sway: unknown) => {
      const mesh = CreateBox("piece", { size: 1 }, world)
      mesh.metadata = sway === undefined ? null : { sway }
      const defines = new MaterialDefines()
      plugin.prepareDefines(defines, world, mesh)
      return [defines["WINDSWAY"], defines["WINDSWAY_TREE"], defines["WINDSWAY_POLE"]]
    }
    expect(tagged(1)).toEqual([true, false, false])
    expect(tagged(0.25)).toEqual([true, true, false])
    expect(tagged(0.1)).toEqual([true, false, true])
    expect(tagged(undefined)).toEqual([false, false, false])
    expect(tagged("lots")).toEqual([false, false, false])
    expect(swayOf(undefined)).toBe(0)
  })

  it("bends the world position in both shader languages, and binds the wind as a uniform", () => {
    const world = scene()
    const wind = { towardX: 0.6, towardZ: 0.8, strength: 1.2, time: 4 }
    const plugin = new WindSwayPlugin(new StandardMaterial("kit", world), wind)
    expect(plugin.getClassName()).toBe("WindSwayPlugin")
    expect(plugin.isCompatible(ShaderLanguage.WGSL)).toBe(true)
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      const code = plugin.getCustomCode("vertex", language)?.CUSTOM_VERTEX_UPDATE_WORLDPOS
      expect(code).toContain("#ifdef WINDSWAY")
      expect(code).toContain("finalWorld[3]")
      expect(code).toContain("positionUpdated.y")
    }
    expect(plugin.getCustomCode("fragment")).toBeNull()
    expect(plugin.getUniforms(ShaderLanguage.GLSL).vertex).toBe("uniform vec4 windSway;")
    const buffer = { updateFloat4: vi.fn<UniformBuffer["updateFloat4"]>() }
    plugin.bindForSubMesh(buffer as unknown as UniformBuffer)
    expect(buffer.updateFloat4).toHaveBeenCalledWith("windSway", 0.6, 0.8, 1.2, 4)
  })
})
