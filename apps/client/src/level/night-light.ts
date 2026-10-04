import { PointLight } from "@babylonjs/core/Lights/pointLight"
import type { Material } from "@babylonjs/core/Materials/material"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Scene } from "@babylonjs/core/scene"

/** A muzzle flash: a shot fired from a point. */
export interface FlashView {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** What the night light reads each frame. */
export interface NightSources {
  /** How dark it is, 0 (full day) to 1 (moonless night). */
  darkness(): number
  /** Where the camera is looking: lights go to the fires nearest it. */
  focus(): Vector3
  /** Braziers and fires burning now. */
  fires(): readonly Vector3[]
}

export interface NightLight {
  /** The pooled lights: the fires, then the muzzle flash. */
  readonly lights: readonly PointLight[]
  /** Whether the lights are on: only after dark, so daylight shaders don't pay for them. */
  readonly lit: boolean
  /** Muzzle flashes from the last simulation steps; the nearest to where the camera looks lights the ground. */
  flash(shots: readonly FlashView[]): void
  /** Places and dims the lights. Call once per frame. */
  update(frameSeconds: number): void
  dispose(): void
}

/** The flares' spot lights, drawn by effects/flare-view.ts, count against the same light limit. */
const FLARE_LIGHTS = 3
const FIRE_LIGHTS = 2
/** Lights come on below this much darkness and go off above the lower figure, so dusk doesn't flicker them. */
const DARK = { on: 0.45, off: 0.35 } as const
/** Firelight: warm, flickering, a few metres round. */
const FIRE = { color: Color3.FromHexString("#ff8a3c"), intensity: 9, range: 12, lift: 0.6 } as const
/** A rifle's flash lights its surroundings for an instant. */
const FLASH = { color: Color3.FromHexString("#ffd58a"), intensity: 8, range: 16, seconds: 0.07, reach: 120 } as const
/** Lights per material once the night lights are on: the sun, the sky, the flares' three and these three. */
export const NIGHT_LIGHT_COUNT = 2 + FLARE_LIGHTS + FIRE_LIGHTS + 1

function pointLight(scene: Scene, name: string, color: Color3, range: number): PointLight {
  const light = new PointLight(name, Vector3.Zero(), scene)
  light.diffuse = color
  light.specular = Color3.Black()
  light.range = range
  light.intensity = 0
  light.setEnabled(false)
  return light
}

/**
 * Light after dark: braziers and burning wrecks glowing warm on the ground around them, and rifles flashing. (Flares
 * are drawn by effects/flare-view.ts.) The lights are a fixed pool, given to the fires nearest where the camera looks,
 * so the number of lights, and with it the shaders, never changes while they are on. `materials` are those that should
 * take the light: their light limit is raised to fit, flares' lights included.
 */
export function createNightLight(scene: Scene, sources: NightSources, materials: readonly Material[]): NightLight {
  const fireLights = Array.from({ length: FIRE_LIGHTS }, (_, index) =>
    pointLight(scene, `fire-light-${index}`, FIRE.color, FIRE.range)
  )
  const flashLight = pointLight(scene, "muzzle-flash-light", FLASH.color, FLASH.range)
  const lights = [...fireLights, flashLight]
  for (const material of materials) {
    if ("maxSimultaneousLights" in material && typeof material.maxSimultaneousLights === "number") {
      material.maxSimultaneousLights = Math.max(material.maxSimultaneousLights, NIGHT_LIGHT_COUNT)
    }
  }

  let lit = false
  let flashLeft = 0
  let clock = 0

  function setLit(on: boolean): void {
    if (on !== lit) {
      lit = on
      for (const light of lights) {
        light.setEnabled(on)
      }
    }
  }

  return {
    lights,
    get lit() {
      return lit
    },
    flash(shots) {
      if (!lit || shots.length === 0) {
        return
      }
      const focus = sources.focus()
      let nearest: FlashView | null = null
      let best: number = FLASH.reach
      for (const shot of shots) {
        const distance = Math.hypot(shot.x - focus.x, shot.z - focus.z)
        if (distance < best) {
          best = distance
          nearest = shot
        }
      }
      if (nearest) {
        flashLight.position.set(nearest.x, nearest.y + 0.3, nearest.z)
        flashLeft = FLASH.seconds
      }
    },
    update(frameSeconds) {
      clock += frameSeconds
      const darkness = sources.darkness()
      setLit(lit ? darkness > DARK.off : darkness > DARK.on)
      const focus = sources.focus()

      if (!lit) {
        return
      }
      const byDistance = <T extends { readonly x: number; readonly z: number }>(items: readonly T[]) =>
        [...items].sort((a, b) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z))

      const nearFires = byDistance(sources.fires())
      for (const [index, light] of fireLights.entries()) {
        const fire = nearFires[index]
        // Flames flicker: two beating waves and a little noise.
        const flicker = 0.75 + 0.15 * Math.sin(clock * 11 + index * 3) + 0.1 * Math.sin(clock * 23 + index)
        light.intensity = fire ? FIRE.intensity * flicker * darkness : 0
        if (fire) {
          light.position.set(fire.x, fire.y + FIRE.lift, fire.z)
        }
      }
      flashLeft = Math.max(0, flashLeft - frameSeconds)
      flashLight.intensity = flashLeft > 0 ? FLASH.intensity * darkness : 0
    },
    dispose() {
      for (const light of lights) {
        light.dispose()
      }
    }
  }
}
