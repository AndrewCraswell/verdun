import type { Camera } from "@babylonjs/core/Cameras/camera"
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore"
import type { Effect } from "@babylonjs/core/Materials/effect"
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture"
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Shaders/particles.fragment"
import "@babylonjs/core/Shaders/particles.vertex"
import "@babylonjs/core/ShadersWGSL/particles.fragment"
import "@babylonjs/core/ShadersWGSL/particles.vertex"

/**
 * A particle is a flat card facing the camera, so a puff of mist or smoke lying on the ground cuts a hard, straight line
 * where its card goes into the earth. Soft edges fade each particle out over the last stretch before the ground behind
 * it, read from the depth map the depth of field already draws (terrain and backdrop: see post-process.ts), so the puff
 * seems to lie on the ground rather than stand in it.
 *
 * The fade is added to Babylon's own particle shaders behind a define, so only the systems softened here pay for it,
 * and the rest of their drawing is Babylon's as ever. A particle fades over `reach` of its size: a puff of mist twenty
 * metres across over two and a half metres, a puff of dust over a few centimetres. The mist lies on the ground, so a
 * longer fade thins it: over a quarter of each puff, a quarter to a third of its brightness went at the game's usual
 * view; over an eighth, about a tenth.
 */
const DEFINE = "SOFT_EDGES"

/**
 * The code each shader gains, by the line of Babylon's it goes in before: the particle's own depth, measured as the
 * depth map measures it (see Babylon's depth shaders), and the fade by how far the ground lies behind it.
 */
const PATCHES = {
  glsl: {
    particlesVertexShader: [
      [
        "#define CUSTOM_VERTEX_DEFINITIONS",
        "#ifdef SOFT_EDGES\nuniform vec4 softEdges;varying vec2 vSoftEdge;\n#endif\n"
      ],
      [
        "#define CUSTOM_VERTEX_MAIN_END",
        "#ifdef SOFT_EDGES\nvSoftEdge=vec2((gl_Position.z+softEdges.x)/softEdges.y,softEdges.y/max(0.01,max(size.x,size.y)*softEdges.z));\n#endif\n"
      ]
    ],
    particlesPixelShader: [
      [
        "#define CUSTOM_FRAGMENT_DEFINITIONS",
        "#ifdef SOFT_EDGES\nuniform vec2 softScreen;uniform sampler2D softDepthSampler;varying vec2 vSoftEdge;\n#endif\n"
      ],
      [
        "#include<fogFragment>(color,baseColor)",
        "#ifdef SOFT_EDGES\nbaseColor.a*=clamp((texture2D(softDepthSampler,gl_FragCoord.xy*softScreen).r-vSoftEdge.x)*vSoftEdge.y,0.0,1.0);\n#endif\n"
      ]
    ]
  },
  wgsl: {
    particlesVertexShader: [
      [
        "#define CUSTOM_VERTEX_DEFINITIONS",
        "#ifdef SOFT_EDGES\nuniform softEdges: vec4f;varying vSoftEdge: vec2f;\n#endif\n"
      ],
      [
        "#define CUSTOM_VERTEX_MAIN_END",
        "#ifdef SOFT_EDGES\nvertexOutputs.vSoftEdge=vec2f((vertexOutputs.position.z+uniforms.softEdges.x)/uniforms.softEdges.y,uniforms.softEdges.y/max(0.01,max(vertexInputs.size.x,vertexInputs.size.y)*uniforms.softEdges.z));\n#endif\n"
      ]
    ],
    particlesPixelShader: [
      [
        "#define CUSTOM_FRAGMENT_DEFINITIONS",
        "#ifdef SOFT_EDGES\nuniform softScreen: vec2f;var softDepthSamplerSampler: sampler;var softDepthSampler: texture_2d<f32>;varying vSoftEdge: vec2f;\n#endif\n"
      ],
      [
        "#include<fogFragment>(color,baseColor)",
        "#ifdef SOFT_EDGES\nbaseColor.a=baseColor.a*clamp((textureSampleLevel(softDepthSampler,softDepthSamplerSampler,fragmentInputs.position.xy*uniforms.softScreen,0.0).r-input.vSoftEdge.x)*input.vSoftEdge.y,0.0,1.0);\n#endif\n"
      ]
    ]
  }
} as const

/**
 * Adds the soft edges to Babylon's particle shaders, in GLSL and WGSL, once for the page. Throws if a line it goes
 * before is missing, as it would be if a new Babylon changed its shaders.
 */
export function patchParticleShaders(): void {
  const stores = { glsl: ShaderStore.ShadersStore, wgsl: ShaderStore.ShadersStoreWGSL }
  for (const language of ["glsl", "wgsl"] as const) {
    const store = stores[language]
    for (const [name, patches] of Object.entries(PATCHES[language])) {
      let source = store[name]
      if (source === undefined) {
        throw new Error(`Babylon's ${language} ${name} isn't loaded`)
      }
      if (source.includes(`#ifdef ${DEFINE}`)) {
        continue
      }
      for (const [before, code] of patches) {
        if (!source.includes(before)) {
          throw new Error(`Babylon's ${language} ${name} has no "${before}" to put the soft edges before`)
        }
        source = source.replace(before, `${code}${before}`)
      }
      store[name] = source
    }
  }
}

/** Where the soft edges read the ground from: the depth map and the camera it's drawn from. */
export interface SoftGround {
  readonly depthMap: BaseTexture
  readonly camera: Camera
}

/**
 * Gives particle systems soft edges against the ground: each particle fades out over the last `reach` of its size
 * before the ground behind it.
 */
export function softenParticles(systems: readonly ParticleSystem[], { depthMap, camera }: SoftGround, reach = 0.12) {
  patchParticleShaders()
  const softened = new WeakMap<Effect, boolean>()
  for (const system of systems) {
    const fillDefines = system.fillDefines.bind(system)
    system.fillDefines = (defines, blendMode, fillImageProcessing) => {
      fillDefines(defines, blendMode, fillImageProcessing)
      defines.push(`#define ${DEFINE}`)
    }
    const fillNames = system.fillUniformsAttributesAndSamplerNames.bind(system)
    system.fillUniformsAttributesAndSamplerNames = (uniforms, attributes, samplers) => {
      fillNames(uniforms, attributes, samplers)
      uniforms.push("softEdges", "softScreen")
      samplers.push("softDepthSampler")
    }
    system.onBeforeDrawParticlesObservable.add((effect) => {
      if (!effect) {
        return
      }
      let soft = softened.get(effect)
      if (soft === undefined) {
        soft = effect.defines.includes(`#define ${DEFINE}`)
        softened.set(effect, soft)
      }
      if (!soft) {
        return
      }
      const engine = effect.getEngine()
      // The depth map's measure of depth (see Babylon's depth renderer): its near plane and its range.
      const near = engine.isNDCHalfZRange ? 0 : camera.minZ
      effect.setFloat4("softEdges", near, near + camera.maxZ, reach, 0)
      effect.setFloat2("softScreen", 1 / engine.getRenderWidth(), 1 / engine.getRenderHeight())
      effect.setTexture("softDepthSampler", depthMap)
    })
  }
}
