import { ShaderStore } from "@babylonjs/core/Engines/shaderStore"
import type { Effect } from "@babylonjs/core/Materials/effect"
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Shaders/particles.fragment"
import "@babylonjs/core/Shaders/particles.vertex"
import "@babylonjs/core/ShadersWGSL/particles.fragment"
import "@babylonjs/core/ShadersWGSL/particles.vertex"

/**
 * Additions to Babylon's own particle shaders, so particles can do what Babylon's can't (soft edges against the ground,
 * low-lying fog) while the rest of their drawing stays Babylon's. Each addition sits behind a define of its own, so
 * only the systems given it pay for it.
 */

/** Code added to one of Babylon's particle shaders: each piece goes in before a line of Babylon's. */
type ShaderPatch = readonly (readonly [before: string, code: string])[]

/** An addition's code for both of Babylon's particle shaders, in both shading languages. */
export interface ParticleShaderPatches {
  readonly glsl: { readonly particlesVertexShader: ShaderPatch; readonly particlesPixelShader: ShaderPatch }
  readonly wgsl: { readonly particlesVertexShader: ShaderPatch; readonly particlesPixelShader: ShaderPatch }
}

/**
 * Adds an addition's code to Babylon's particle shaders, once for the page. Throws if a line it goes before is missing,
 * as it would be if a new Babylon changed its shaders.
 */
export function patchParticleShaders(define: string, patches: ParticleShaderPatches): void {
  const stores = { glsl: ShaderStore.ShadersStore, wgsl: ShaderStore.ShadersStoreWGSL }
  for (const language of ["glsl", "wgsl"] as const) {
    const store = stores[language]
    for (const [name, patch] of Object.entries(patches[language])) {
      let source = store[name]
      if (source === undefined) {
        throw new Error(`Babylon's ${language} ${name} isn't loaded`)
      }
      if (source.includes(`#ifdef ${define}`)) {
        continue
      }
      for (const [before, code] of patch) {
        if (!source.includes(before)) {
          throw new Error(`Babylon's ${language} ${name} has no "${before}" to put ${define} before`)
        }
        source = source.replace(before, `${code}${before}`)
      }
      store[name] = source
    }
  }
}

/** What a particle system's shader needs to take an addition. */
export interface ParticleShaderExtension {
  /** The define its shader is compiled with when it has the addition. */
  readonly define: string
  /** Adds its defines to those the system's shader is about to be compiled with, if it's to have the addition now. */
  defines(defines: string[]): void
  readonly uniforms: readonly string[]
  readonly samplers?: readonly string[]
  /** Sets its values on a shader compiled with it, before the system draws. */
  bind(effect: Effect): void
}

/** Gives a particle system an addition to its shader (see patchParticleShaders). */
export function extendParticles(system: ParticleSystem, extension: ParticleShaderExtension): void {
  const fillDefines = system.fillDefines.bind(system)
  system.fillDefines = (defines, blendMode, fillImageProcessing) => {
    fillDefines(defines, blendMode, fillImageProcessing)
    extension.defines(defines)
  }
  const fillNames = system.fillUniformsAttributesAndSamplerNames.bind(system)
  system.fillUniformsAttributesAndSamplerNames = (uniforms, attributes, samplers) => {
    fillNames(uniforms, attributes, samplers)
    uniforms.push(...extension.uniforms)
    samplers.push(...(extension.samplers ?? []))
  }
  const compiledWith = new WeakMap<Effect, boolean>()
  system.onBeforeDrawParticlesObservable.add((effect) => {
    if (!effect) {
      return
    }
    let has = compiledWith.get(effect)
    if (has === undefined) {
      has = effect.defines.includes(`#define ${extension.define}`)
      compiledWith.set(effect, has)
    }
    if (has) {
      extension.bind(effect)
    }
  })
}
