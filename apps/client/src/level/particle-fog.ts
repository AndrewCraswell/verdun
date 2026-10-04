import { Vector4 } from "@babylonjs/core/Maths/math.vector"
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import type { Scene } from "@babylonjs/core/scene"
import { HEIGHT_FOG_GLSL, HEIGHT_FOG_WGSL, type HeightFog, heightFogVector } from "../environment/height-fog.ts"
import { extendParticles, type ParticleShaderPatches, patchParticleShaders } from "./particle-shaders.ts"

/**
 * Particles in the low-lying fog the ground lies in (see environment/height-fog.ts), in place of Babylon's own fog, which
 * thickens with distance from the camera alone. Once a scene has the fog (useHeightFog), every particle system set in
 * fog (see particle-light.ts's setInFog) takes it: smoke, dust and mist fade into the haze by how much of the fog lies
 * between them and the eye, as the ground and props around them do, not by distance as if the fog were even.
 */
const DEFINE = "HEIGHT_FOG"

/**
 * The fog's sum, shared with the ground's shaders, and the particle mixed into the haze by it, where Babylon's own fog
 * would mix it. The world position comes from Babylon's own vertex shader (POSITIONW_AS_VARYING).
 */
const PATCHES: ParticleShaderPatches = {
  glsl: {
    particlesVertexShader: [],
    particlesPixelShader: [
      [
        "#define CUSTOM_FRAGMENT_DEFINITIONS",
        `#ifdef HEIGHT_FOG\nuniform vec4 heightFog;uniform vec3 heightFogEye;uniform vec3 heightFogColor;varying vec3 vPositionW;\n${HEIGHT_FOG_GLSL}\n#endif\n`
      ],
      [
        "#include<fogFragment>(color,baseColor)",
        "#ifdef HEIGHT_FOG\nbaseColor.rgb=mix(heightFogColor,baseColor.rgb,heightFogTransmittance(heightFogEye,vPositionW,heightFog));\n#endif\n"
      ]
    ]
  },
  wgsl: {
    particlesVertexShader: [],
    particlesPixelShader: [
      [
        "#define CUSTOM_FRAGMENT_DEFINITIONS",
        `#ifdef HEIGHT_FOG\nuniform heightFog: vec4f;uniform heightFogEye: vec3f;uniform heightFogColor: vec3f;varying vPositionW: vec3f;\n${HEIGHT_FOG_WGSL}\n#endif\n`
      ],
      [
        "#include<fogFragment>(color,baseColor)",
        "#ifdef HEIGHT_FOG\nbaseColor=vec4f(mix(uniforms.heightFogColor,baseColor.rgb,heightFogTransmittance(uniforms.heightFogEye,input.vPositionW,uniforms.heightFog)),baseColor.a);\n#endif\n"
      ]
    ]
  }
}

/** The low-lying fog of each scene that has one, as the environment has it now. */
const fogs = new WeakMap<Scene, () => Readonly<HeightFog> | null>()

/**
 * Gives a scene's particles set in fog the low-lying fog, as `fog` gives it each frame: null leaves them in Babylon's
 * own fog.
 */
export function useHeightFog(scene: Scene, fog: () => Readonly<HeightFog> | null): void {
  fogs.set(scene, fog)
}

/** Has a particle system set in fog take the low-lying fog whenever its scene has one (see useHeightFog). */
export function takeHeightFog(system: ParticleSystem): void {
  patchParticleShaders(DEFINE, PATCHES)
  const fogNow = () => {
    const scene = system.getScene()
    return scene ? (fogs.get(scene)?.() ?? null) : null
  }
  const vector = new Vector4()
  extendParticles(system, {
    define: DEFINE,
    defines(defines) {
      if (!fogNow()) {
        return
      }
      // In place of Babylon's own fog, by distance from the camera alone.
      const own = defines.indexOf("#define FOG")
      if (own >= 0) {
        defines.splice(own, 1)
      }
      defines.push(`#define ${DEFINE}`, "#define POSITIONW_AS_VARYING")
    },
    uniforms: ["heightFog", "heightFogEye", "heightFogColor"],
    bind(effect) {
      const fog = fogNow()
      const eye = system.getScene()?.activeCamera?.globalPosition
      if (!fog || !eye) {
        return
      }
      effect.setVector4("heightFog", heightFogVector(fog, vector))
      effect.setVector3("heightFogEye", eye)
      effect.setColor3("heightFogColor", fog.color)
    }
  })
}
