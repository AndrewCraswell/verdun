import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore"
import { Effect } from "@babylonjs/core/Materials/effect"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Vector3, Vector4 } from "@babylonjs/core/Maths/math.vector"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { HeightFog } from "../environment/height-fog.ts"
import { takeHeightFog, useHeightFog } from "./particle-fog.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

/** A scene in Babylon's fog, a camera looking on, and a puff of smoke set in the fog. */
function world() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  scene.fogMode = Scene.FOGMODE_EXP2
  const camera = new ArcRotateCamera("camera", 0, 1, 50, Vector3.Zero(), scene)
  scene.activeCamera = camera
  const smoke = new ParticleSystem("smoke", 10, scene)
  smoke.applyFog = true
  takeHeightFog(smoke)
  return { engine, scene, camera, smoke }
}

const fog: HeightFog = { density: 0.01, falloff: 0.025, base: 12, color: new Color3(0.5, 0.52, 0.5) }

/** The defines a system compiles its shader with. */
function definesOf(system: ParticleSystem): string[] {
  const defines: string[] = []
  system.fillDefines(defines, ParticleSystem.BLENDMODE_STANDARD)
  return defines
}

describe("takeHeightFog", () => {
  it("leaves particles in Babylon's fog until the scene has the low-lying fog, and while it hasn't", () => {
    const { scene, smoke } = world()
    expect(definesOf(smoke)).toContain("#define FOG")
    expect(definesOf(smoke)).not.toContain("#define HEIGHT_FOG")

    useHeightFog(scene, () => null)
    expect(definesOf(smoke)).toContain("#define FOG")
  })

  it("puts particles in the low-lying fog in place of Babylon's once the scene has it", () => {
    const { scene, smoke } = world()
    useHeightFog(scene, () => fog)
    const uniforms: string[] = []
    smoke.fillUniformsAttributesAndSamplerNames(uniforms, [], [])

    expect(definesOf(smoke)).toEqual(expect.arrayContaining(["#define HEIGHT_FOG", "#define POSITIONW_AS_VARYING"]))
    expect(definesOf(smoke)).not.toContain("#define FOG")
    expect(uniforms).toEqual(expect.arrayContaining(["heightFog", "heightFogEye", "heightFogColor"]))
  })

  it("tells the shader the fog, where the eye is and the haze's colour", () => {
    const { engine, scene, camera, smoke } = world()
    useHeightFog(scene, () => fog)
    const effect = new Effect(
      "particles",
      {
        attributes: [],
        uniformsNames: [],
        samplers: [],
        defines: "#define HEIGHT_FOG",
        fallbacks: null,
        onCompiled: null,
        onError: null
      },
      engine
    )
    const setVector4 = vi.spyOn(effect, "setVector4")
    const setVector3 = vi.spyOn(effect, "setVector3")
    const setColor3 = vi.spyOn(effect, "setColor3")

    smoke.onBeforeDrawParticlesObservable.notifyObservers(effect)

    expect(setVector4).toHaveBeenCalledWith("heightFog", new Vector4(0.01, 0.025, 12, 0))
    expect(setVector3).toHaveBeenCalledWith("heightFogEye", camera.globalPosition)
    expect(setColor3).toHaveBeenCalledWith("heightFogColor", fog.color)
  })

  it("gives Babylon's particle shaders the fog's sum, in both languages", () => {
    world()

    for (const store of [ShaderStore.ShadersStore, ShaderStore.ShadersStoreWGSL]) {
      const fragment = store.particlesPixelShader ?? ""
      expect(fragment.split("#ifdef HEIGHT_FOG").length - 1).toBe(2)
      expect(fragment).toContain("heightFogTransmittance(")
    }
  })
})
