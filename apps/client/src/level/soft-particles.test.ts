import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore"
import { Effect } from "@babylonjs/core/Materials/effect"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { softenParticles } from "./soft-particles.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function world() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const camera = new ArcRotateCamera("camera", 0, 1, 50, Vector3.Zero(), scene)
  camera.minZ = 0.5
  camera.maxZ = 2000
  const depthMap = RawTexture.CreateRTexture(new Float32Array(4), 2, 2, scene)
  return { engine, scene, camera, depthMap }
}

/** A particle effect compiled with these defines. */
function effectWith(engine: NullEngine, defines: string): Effect {
  return new Effect(
    "particles",
    { attributes: [], uniformsNames: [], samplers: [], defines, fallbacks: null, onCompiled: null, onError: null },
    engine
  )
}

/** The defines a system compiles its shader with. */
function definesOf(system: ParticleSystem): string[] {
  const defines: string[] = []
  system.fillDefines(defines, ParticleSystem.BLENDMODE_STANDARD)
  return defines
}

describe("softenParticles", () => {
  it("adds the soft edges to Babylon's particle shaders, in both languages, once however many it softens", () => {
    const { scene, camera, depthMap } = world()
    softenParticles([new ParticleSystem("mist", 10, scene)], { depthMap, camera })
    softenParticles([new ParticleSystem("smoke", 10, scene)], { depthMap, camera })

    for (const store of [ShaderStore.ShadersStore, ShaderStore.ShadersStoreWGSL]) {
      for (const name of ["particlesVertexShader", "particlesPixelShader"]) {
        // Its declarations, and its code in the main function.
        expect((store[name] ?? "").split("#ifdef SOFT_EDGES").length - 1).toBe(2)
      }
    }
  })

  it("compiles the systems it softens with the soft edges and what they need, and no others", () => {
    const { scene, camera, depthMap } = world()
    const mist = new ParticleSystem("mist", 10, scene)
    const sparks = new ParticleSystem("burst-sparks", 10, scene)

    softenParticles([mist], { depthMap, camera })
    const uniforms: string[] = []
    const samplers: string[] = []
    mist.fillUniformsAttributesAndSamplerNames(uniforms, [], samplers)

    expect(definesOf(mist)).toContain("#define SOFT_EDGES")
    expect(definesOf(sparks)).not.toContain("#define SOFT_EDGES")
    expect(uniforms).toEqual(expect.arrayContaining(["softEdges", "softScreen"]))
    expect(samplers).toContain("softDepthSampler")
  })

  it("tells the shader how the depth map measures depth, the screen's size, and how far particles fade", () => {
    const { engine, scene, camera, depthMap } = world()
    const mist = new ParticleSystem("mist", 10, scene)
    softenParticles([mist], { depthMap, camera }, 0.3)
    const effect = effectWith(engine, "#define SOFT_EDGES")
    const setFloat4 = vi.spyOn(effect, "setFloat4")
    const setFloat2 = vi.spyOn(effect, "setFloat2")
    const setTexture = vi.spyOn(effect, "setTexture")

    mist.onBeforeDrawParticlesObservable.notifyObservers(effect)

    // WebGL's depth map measures from the near plane, over the near plane and the far.
    expect(setFloat4).toHaveBeenCalledWith("softEdges", 0.5, 2000.5, 0.3, 0)
    expect(setFloat2).toHaveBeenCalledWith("softScreen", 1 / engine.getRenderWidth(), 1 / engine.getRenderHeight())
    expect(setTexture).toHaveBeenCalledWith("softDepthSampler", depthMap)
  })

  it("leaves alone an effect compiled without the soft edges", () => {
    const { engine, scene, camera, depthMap } = world()
    const mist = new ParticleSystem("mist", 10, scene)
    softenParticles([mist], { depthMap, camera })
    const effect = effectWith(engine, "")
    const setTexture = vi.spyOn(effect, "setTexture")

    mist.onBeforeDrawParticlesObservable.notifyObservers(effect)
    mist.onBeforeDrawParticlesObservable.notifyObservers(null)

    expect(setTexture).not.toHaveBeenCalled()
  })
})
