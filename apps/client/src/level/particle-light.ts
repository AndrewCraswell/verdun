import { Color3, type Color4 } from "@babylonjs/core/Maths/math.color"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import type { Scene } from "@babylonjs/core/scene"

/** The fog's colour at midday under a grey sky, the light the particles' colours were chosen in (see daylight.ts). */
const MIDDAY_AIR = new Color3(0.557, 0.576, 0.561)
/** Brighter air than midday's, a clear noon, lifts the colours this much at most. */
const BRIGHTEST = 1.3
/** Systems that give off their own light, which no darkness dims. */
const GLOWING = /fireball|flash|spark|ember|fire/

/**
 * How the air is lit now, channel by channel, against midday: from the fog's colour, which the daylight model sets each
 * frame from the sun, the moon, the sky and the cloud. Near black on a moonless night, warm at sunset.
 */
export function airLight(scene: Scene, into = new Color3()): Color3 {
  const fog = scene.fogColor
  return into.copyFromFloats(
    Math.min(BRIGHTEST, fog.r / MIDDAY_AIR.r),
    Math.min(BRIGHTEST, fog.g / MIDDAY_AIR.g),
    Math.min(BRIGHTEST, fog.b / MIDDAY_AIR.b)
  )
}

/** Whether a particle system is lit by the air around it (smoke, dust, mist), rather than glowing (fire, sparks). */
export function litByAir(system: ParticleSystem): boolean {
  return system.blendMode === ParticleSystem.BLENDMODE_STANDARD && !GLOWING.test(system.name)
}

export interface ParticleLight {
  /** Lights the particles as the air is lit now (see airLight). Call once a frame. */
  update(light: Color3): void
}

/**
 * Smoke, dust and mist are drawn unlit, in the colours they're given, so at night they would glow white. This keeps
 * their colours in step with the light: each its midday colour times the light now. Colours set on the systems
 * afterwards are overwritten.
 */
export function lightParticles(systems: readonly ParticleSystem[]): ParticleLight {
  const colors: [Color4, Color4][] = []
  const track = (color: Color4 | undefined) => {
    if (color) {
      colors.push([color, color.clone()])
    }
  }
  for (const system of systems) {
    track(system.color1)
    track(system.color2)
    track(system.colorDead)
    for (const gradient of system.getColorGradients() ?? []) {
      track(gradient.color1)
      track(gradient.color2)
    }
  }
  const last = new Color3(1, 1, 1)
  return {
    update(light) {
      if (Math.abs(light.r - last.r) + Math.abs(light.g - last.g) + Math.abs(light.b - last.b) < 0.01) {
        return
      }
      last.copyFrom(light)
      for (const [color, midday] of colors) {
        color.r = midday.r * light.r
        color.g = midday.g * light.g
        color.b = midday.b * light.b
      }
    }
  }
}
