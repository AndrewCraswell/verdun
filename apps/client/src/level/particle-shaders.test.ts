import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore"
import { Effect } from "@babylonjs/core/Materials/effect"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { extendParticles, type ParticleShaderPatches, patchParticleShaders } from "./particle-shaders.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function world() {
  const engine = new NullEngine()
  engines.push(engine)
  return { engine, scene: new Scene(engine) }
}

/** A particle effect compiled with these defines. */
function effectWith(engine: NullEngine, defines: string): Effect {
  return new Effect(
    "particles",
    { attributes: [], uniformsNames: [], samplers: [], defines, fallbacks: null, onCompiled: null, onError: null },
    engine
  )
}

/** A line of code before every main function of Babylon's particle shaders. */
const MARKED: ParticleShaderPatches = {
  glsl: {
    particlesVertexShader: [["void main(void)", "#ifdef MARKED\n#endif\n"]],
    particlesPixelShader: [["void main(void)", "#ifdef MARKED\n#endif\n"]]
  },
  wgsl: {
    particlesVertexShader: [["@vertex", "#ifdef MARKED\n#endif\n"]],
    particlesPixelShader: [["@fragment", "#ifdef MARKED\n#endif\n"]]
  }
}

describe("patchParticleShaders", () => {
  it("puts each piece of code before its line of Babylon's, in both languages, once however often it's asked", () => {
    patchParticleShaders("MARKED", MARKED)
    patchParticleShaders("MARKED", MARKED)

    for (const store of [ShaderStore.ShadersStore, ShaderStore.ShadersStoreWGSL]) {
      for (const name of ["particlesVertexShader", "particlesPixelShader"]) {
        expect((store[name] ?? "").split("#ifdef MARKED").length - 1).toBe(1)
      }
    }
  })

  it("says so when a line it goes before is missing, as from a new Babylon", () => {
    const lost: ParticleShaderPatches = {
      glsl: { particlesVertexShader: [], particlesPixelShader: [["no such line", "#ifdef LOST\n#endif\n"]] },
      wgsl: { particlesVertexShader: [], particlesPixelShader: [] }
    }

    expect(() => patchParticleShaders("LOST", lost)).toThrow(/no "no such line"/)
  })
})

describe("extendParticles", () => {
  it("compiles the system's shader with its additions, and sets them only on shaders compiled with them", () => {
    const { engine, scene } = world()
    const system = new ParticleSystem("smoke", 10, scene)
    const bind = vi.fn<(effect: Effect) => void>()
    extendParticles(system, {
      define: "EXTRA",
      defines(defines) {
        defines.push("#define EXTRA")
      },
      uniforms: ["extra"],
      samplers: ["extraSampler"],
      bind
    })
    const defines: string[] = []
    system.fillDefines(defines, ParticleSystem.BLENDMODE_STANDARD)
    const uniforms: string[] = []
    const samplers: string[] = []
    system.fillUniformsAttributesAndSamplerNames(uniforms, [], samplers)
    const extended = effectWith(engine, "#define EXTRA")

    system.onBeforeDrawParticlesObservable.notifyObservers(extended)
    system.onBeforeDrawParticlesObservable.notifyObservers(effectWith(engine, ""))
    system.onBeforeDrawParticlesObservable.notifyObservers(null)

    expect(defines).toContain("#define EXTRA")
    expect(uniforms).toContain("extra")
    expect(samplers).toContain("extraSampler")
    expect(bind).toHaveBeenCalledTimes(1)
    expect(bind).toHaveBeenCalledWith(extended)
  })
})
