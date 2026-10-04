import { Constants } from "@babylonjs/core/Engines/constants"
import { PointLight } from "@babylonjs/core/Lights/pointLight"
import type { Material } from "@babylonjs/core/Materials/material"
import type { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Scene } from "@babylonjs/core/scene"
import { Sprite } from "@babylonjs/core/Sprites/sprite"
import { SpriteManager } from "@babylonjs/core/Sprites/spriteManager"
import { type BattlefieldMap, heightAt } from "@verdun/map"
import { FLARE as FLIGHT, type Flare, flarePosition } from "@verdun/sim"

/** A flare burning in the air, as the simulation reports it. */
export interface FlareView {
  readonly x: number
  /** Height above sea level of the map's base, metres. */
  readonly y: number
  readonly z: number
  /** How brightly it burns now, 0 to 1: flaring up after launch, steady, then guttering out. */
  readonly brightness: number
}

/** A flare flares up this long after it's fired and gutters out over its last this long, in seconds. */
const FLARE_FADE = { up: 0.3, out: 1.2 } as const
const TICKS_PER_SECOND = 20

/**
 * The simulation's flares as drawn at a moment, `tick` fractional between steps for smooth motion: where each is above
 * the map and how brightly it burns.
 */
export function flareViews(map: BattlefieldMap, flares: readonly Flare[], tick: number): FlareView[] {
  return flares.map((flare) => {
    const { x, y, z } = flarePosition(flare, tick)
    const age = (tick - flare.firedAt) / TICKS_PER_SECOND
    const left = (flare.burnsOutAt - tick) / TICKS_PER_SECOND
    const brightness = Math.max(
      0,
      Math.min(1, 0.3 + (0.7 * age) / FLARE_FADE.up, left / FLARE_FADE.out, age < FLIGHT.burnSeconds ? 1 : 0)
    )
    return { x, y: heightAt(map, x, z) + y, z, brightness }
  })
}

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
  /** Flares in the air now. */
  flares(): readonly FlareView[]
}

export interface NightLight {
  /** The pooled lights: flares first, then fires, then the muzzle flash. */
  readonly lights: readonly PointLight[]
  /** Sprites drawing the flares themselves. */
  readonly flareSprites: readonly Sprite[]
  /** Whether the lights are on: only after dark, so daylight shaders don't pay for them. */
  readonly lit: boolean
  /** Muzzle flashes from the last simulation steps; the nearest to where the camera looks lights the ground. */
  flash(shots: readonly FlashView[]): void
  /** Places and dims the lights. Call once per frame. */
  update(frameSeconds: number): void
  dispose(): void
}

const FLARE_LIGHTS = 3
const FIRE_LIGHTS = 2
/** Lights come on below this much darkness and go off above the lower figure, so dusk doesn't flicker them. */
const DARK = { on: 0.45, off: 0.35 } as const
/** A Very light: cold, greenish white, lighting ground about 60 m round. */
const FLARE = { color: Color3.FromHexString("#dff2d0"), intensity: 14, range: 95, spriteSize: 2.2 } as const
/** Firelight: warm, flickering, a few metres round. */
const FIRE = { color: Color3.FromHexString("#ff8a3c"), intensity: 9, range: 12, lift: 0.6 } as const
/** A rifle's flash lights its surroundings for an instant. */
const FLASH = { color: Color3.FromHexString("#ffd58a"), intensity: 8, range: 16, seconds: 0.07, reach: 120 } as const
/** Point lights per material once the night lights are on: the sun, the sky and these six. */
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
 * Light after dark: Very lights hanging over no man's land throwing hard, cold light, braziers and burning wrecks
 * glowing warm on the ground around them, and rifles flashing. The lights are a fixed pool, given to the flares and
 * fires nearest where the camera looks, so the number of lights, and with it the shaders, never changes while they
 * are on. `materials` are those that should take the light: their light limit is raised to fit.
 */
export function createNightLight(
  scene: Scene,
  sources: NightSources,
  sprite: Texture,
  materials: readonly Material[]
): NightLight {
  const flareLights = Array.from({ length: FLARE_LIGHTS }, (_, index) =>
    pointLight(scene, `flare-light-${index}`, FLARE.color, FLARE.range)
  )
  const fireLights = Array.from({ length: FIRE_LIGHTS }, (_, index) =>
    pointLight(scene, `fire-light-${index}`, FIRE.color, FIRE.range)
  )
  const flashLight = pointLight(scene, "muzzle-flash-light", FLASH.color, FLASH.range)
  const lights = [...flareLights, ...fireLights, flashLight]
  for (const material of materials) {
    if ("maxSimultaneousLights" in material && typeof material.maxSimultaneousLights === "number") {
      material.maxSimultaneousLights = Math.max(material.maxSimultaneousLights, NIGHT_LIGHT_COUNT)
    }
  }

  const sheet = new SpriteManager("flares", "", 16, 128, scene)
  sheet.texture = sprite
  sheet.blendMode = Constants.ALPHA_ADD
  sheet.isPickable = false
  const flareSprites: Sprite[] = []
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
    flareSprites,
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

      // Every flare in the air gets a sprite, lit or not: they show at dusk too.
      const flares = sources.flares()
      while (flareSprites.length < flares.length) {
        const flare = new Sprite("flare", sheet)
        flare.isPickable = false
        flareSprites.push(flare)
      }
      for (const [index, flareSprite] of flareSprites.entries()) {
        const flare = flares[index]
        flareSprite.isVisible = flare !== undefined
        if (flare) {
          const flicker = 0.85 + 0.15 * Math.sin(clock * 37 + index * 2.1)
          flareSprite.position.set(flare.x, flare.y, flare.z)
          flareSprite.size = FLARE.spriteSize * (0.6 + 0.4 * flare.brightness)
          // Brighter than white, so the bloom catches it.
          const glow = 2.5 * flare.brightness * flicker
          flareSprite.color = new Color4(FLARE.color.r * glow, FLARE.color.g * glow, FLARE.color.b * glow, 1)
        }
      }
      if (!lit) {
        return
      }
      const byDistance = <T extends { readonly x: number; readonly z: number }>(items: readonly T[]) =>
        [...items].sort((a, b) => Math.hypot(a.x - focus.x, a.z - focus.z) - Math.hypot(b.x - focus.x, b.z - focus.z))

      const nearFlares = byDistance(flares)
      for (const [index, light] of flareLights.entries()) {
        const flare = nearFlares[index]
        light.intensity = flare
          ? FLARE.intensity * flare.brightness * darkness * (0.9 + 0.1 * Math.sin(clock * 29 + index))
          : 0
        if (flare) {
          light.position.set(flare.x, flare.y, flare.z)
        }
      }
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
      sheet.dispose()
    }
  }
}
