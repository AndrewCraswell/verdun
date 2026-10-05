import { Constants } from "@babylonjs/core/Engines/constants"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Particles/particleSystemComponent"
import type { Scene } from "@babylonjs/core/scene"
import type { Weather } from "@verdun/sim"
import { createRain, type Rain } from "./rain.ts"

/** Snow falls in a box this far around the camera's target, from this high above it. */
const FALL = { halfWidth: 55, height: 30 } as const
const SNOW = { speed: 1.1, perMillimetre: 350, capacity: 9000 } as const
/**
 * Raindrops striking the ground near the camera: each throws a tiny crown of droplets, 2 to 4 cm, seen for a frame or
 * two and gone (a crown lasts 10 to 20 ms). Only on ground within `reach` metres of the camera, `perSquareMetre` a second
 * in rain of 1 mm an hour, at most `most` a second.
 */
const SPLASH = { reach: 15, perSquareMetre: 3, most: 3000, capacity: 400 } as const

/** The ground's height at a point, in metres: where splashes land. */
export type GroundHeight = (x: number, z: number) => number

/** Particles a second for a precipitation rate: more flakes in heavier snow, though not in proportion. */
export function dropsPerSecond(millimetresPerHour: number, perMillimetre: number): number {
  return millimetresPerHour > 0.02 ? perMillimetre * millimetresPerHour ** 0.6 : 0
}

/**
 * Splashes a second on the ground round a camera `height` metres above it: those within `SPLASH.reach` of it, a disc
 * of ground shrinking as the camera rises, none from higher than that.
 */
export function splashesPerSecond(millimetresPerHour: number, height: number): number {
  const radius = Math.sqrt(Math.max(0, SPLASH.reach ** 2 - height ** 2))
  return Math.min(SPLASH.most, dropsPerSecond(millimetresPerHour, SPLASH.perSquareMetre) * Math.PI * radius ** 2)
}

/** A soft white flake for snow. */
function flakeTexture(scene: Scene): Texture {
  const size = 16
  const pixels = new Uint8Array(size * size * 4)
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const x = (column + 0.5) / size - 0.5
      const y = (row + 0.5) / size - 0.5
      const alpha = Math.max(0, 1 - Math.sqrt(x * x + y * y) * 2)
      pixels.set([255, 255, 255, Math.round(255 * alpha)], (row * size + column) * 4)
    }
  }
  return texture(scene, "snowflake", pixels, size)
}

/** A splash's crown: a ring of sharp droplets round a bright middle, hard-edged, nothing soft about it. */
function crownTexture(scene: Scene): Texture {
  const size = 16
  const pixels = new Uint8Array(size * size * 4)
  const droplets = Array.from({ length: 7 }, (_, index) => {
    const angle = (index / 7) * 2 * Math.PI + 0.4
    return [0.5 + Math.cos(angle) * 0.36, 0.5 + Math.sin(angle) * 0.36] as const
  })
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const x = (column + 0.5) / size
      const y = (row + 0.5) / size
      const middle = Math.hypot(x - 0.5, y - 0.5) < 0.13
      const droplet = droplets.some(([dx, dy]) => Math.hypot(x - dx, y - dy) < 0.08)
      pixels.set([255, 255, 255, middle || droplet ? 255 : 0], (row * size + column) * 4)
    }
  }
  return texture(scene, "splash-crown", pixels, size)
}

function texture(scene: Scene, name: string, pixels: Uint8Array, size: number): Texture {
  const made = new RawTexture(
    pixels,
    size,
    size,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE
  )
  made.name = name
  made.hasAlpha = true
  return made
}

function particles(scene: Scene, name: string, capacity: number, sprite: Texture): ParticleSystem {
  const system = new ParticleSystem(name, capacity, scene)
  system.particleTexture = sprite
  system.emitter = Vector3.Zero()
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD
  // Babylon steps particles 0.01 a frame by default; a sixtieth makes lifetimes, rates and speeds real seconds.
  system.updateSpeed = 1 / 60
  system.emitRate = 0
  system.start()
  return system
}

export interface Precipitation {
  /** Rain round the camera, drawn on the GPU (see rain.ts). */
  readonly rain: Rain
  readonly snow: ParticleSystem
  readonly splashes: ParticleSystem
  /**
   * Lets rain and snow fall for the weather: as hard as it's falling, blown by the wind, and as bright as the light (0
   * to 1). Rain falls round the scene's camera, snow round `around`, the point the camera looks at.
   */
  update(weather: Weather, around: Vector3, light: number): void
  dispose(): void
}

/**
 * Rain and snow falling around the camera, so the player always stands in the weather, and rain splashing on the ground
 * close by.
 */
export function createPrecipitation(
  scene: Scene,
  groundAt: GroundHeight = () => 0,
  { splashes: splashing = true }: { readonly splashes?: boolean } = {}
): Precipitation {
  const rain = createRain(scene)

  const snow = particles(scene, "snow", SNOW.capacity, flakeTexture(scene))
  snow.createBoxEmitter(
    new Vector3(0, -1, 0),
    new Vector3(0, -1, 0),
    new Vector3(-FALL.halfWidth, 0, -FALL.halfWidth),
    new Vector3(FALL.halfWidth, 0, FALL.halfWidth)
  )
  snow.minSize = 0.22
  snow.maxSize = 0.4
  snow.minLifeTime = snow.maxLifeTime = (FALL.height + 2) / SNOW.speed
  snow.minEmitPower = snow.maxEmitPower = SNOW.speed
  snow.minAngularSpeed = -1
  snow.maxAngularSpeed = 1

  // Each splash is struck on the ground under a random point near the camera, where it stays: no growing, no flying.
  const splashes = particles(scene, "rain-splashes", SPLASH.capacity, crownTexture(scene))
  const splashCentre = new Vector3()
  let splashRadius = 0
  splashes.startPositionFunction = (_world, position) => {
    const angle = Math.random() * 2 * Math.PI
    const distance = splashRadius * Math.sqrt(Math.random())
    const x = splashCentre.x + Math.cos(angle) * distance
    const z = splashCentre.z + Math.sin(angle) * distance
    position.set(x, groundAt(x, z) + 0.01, z)
  }
  splashes.direction1 = Vector3.Zero()
  splashes.direction2 = Vector3.Zero()
  splashes.minEmitPower = splashes.maxEmitPower = 0
  splashes.minLifeTime = 0.03
  splashes.maxLifeTime = 0.05
  splashes.minSize = 0.02
  splashes.maxSize = 0.04

  return {
    rain,
    snow,
    splashes,
    update(weather, around, light) {
      const snowing = weather.snowFraction
      snow.emitter = new Vector3(around.x, around.y + FALL.height, around.z)
      snow.emitRate = dropsPerSecond(weather.precipitation * snowing, SNOW.perMillimetre)
      // The wind carries the flakes: direction scales with emit power, so the wind goes in as a fraction of the fall.
      const drift = new Vector3(weather.wind.x / SNOW.speed, -1, weather.wind.z / SNOW.speed)
      snow.direction1 = drift
      snow.direction2 = drift
      const shade = 0.25 + 0.75 * light
      snow.color1 = new Color4(shade, shade, shade * 1.03, 0.95)
      snow.color2 = new Color4(shade * 0.9, shade * 0.92, shade, 0.95 * 0.7)
      // Each flake lives just long enough to reach the ground, so it keeps its colour all the way down.
      snow.colorDead = new Color4(shade * 0.9, shade * 0.92, shade, 0.95 * 0.7)

      const rainfall = weather.precipitation * (1 - snowing)
      rain.fall(rainfall, weather.wind.x, weather.wind.z)

      // Splashes on the ground within reach of the camera, faint and as bright as the air.
      const camera = scene.activeCamera?.globalPosition
      const height = camera ? camera.y - groundAt(camera.x, camera.z) : Infinity
      splashCentre.copyFrom(camera ?? around)
      splashRadius = Math.sqrt(Math.max(0, SPLASH.reach ** 2 - height ** 2))
      splashes.emitRate = splashing ? splashesPerSecond(rainfall, height) : 0
      const fog = scene.fogColor
      splashes.color1 = new Color4(fog.r * 1.3, fog.g * 1.3, fog.b * 1.3, 0.3)
      splashes.color2 = new Color4(fog.r * 1.2, fog.g * 1.2, fog.b * 1.2, 0.22)
      splashes.colorDead = splashes.color2
    },
    dispose() {
      rain.dispose()
      snow.dispose()
      splashes.dispose()
    }
  }
}
