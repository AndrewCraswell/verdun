import { Constants } from "@babylonjs/core/Engines/constants"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Particles/particleSystemComponent"
import type { Scene } from "@babylonjs/core/scene"
import type { Weather } from "@verdun/sim"

/** Rain and snow fall in a box this far around the camera's target, from this high above it. */
const FALL = { halfWidth: 55, height: 30 } as const
const RAIN = { speed: 8.5, perMillimetre: 900, capacity: 6000 } as const
const SNOW = { speed: 1.1, perMillimetre: 350, capacity: 9000 } as const
/**
 * Raindrops splashing on the ground nearest the camera, in a box `halfWidth` metres round its target: a share of the
 * drops falling there, each a brief crown of droplets.
 */
const SPLASH = { halfWidth: 22, share: 0.7, capacity: 1500 } as const

/** The ground's height at a point, in metres: where splashes land. */
export type GroundHeight = (x: number, z: number) => number

/** Particles a second for a precipitation rate: more drops in heavier rain, though not in proportion. */
export function dropsPerSecond(millimetresPerHour: number, perMillimetre: number): number {
  return millimetresPerHour > 0.02 ? perMillimetre * millimetresPerHour ** 0.6 : 0
}

/** A soft white sprite: a long thin streak for rain, a round flake for snow. */
function sprite(scene: Scene, width: number, height: number, name: string): Texture {
  const pixels = new Uint8Array(width * height * 4)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const x = (column + 0.5) / width - 0.5
      const y = (row + 0.5) / height - 0.5
      const alpha = Math.max(0, 1 - Math.sqrt(x * x + y * y) * 2)
      const index = (row * width + column) * 4
      pixels.set([255, 255, 255, Math.round(255 * alpha)], index)
    }
  }
  const texture = new RawTexture(
    pixels,
    width,
    height,
    Constants.TEXTUREFORMAT_RGBA,
    scene,
    false,
    false,
    Texture.BILINEAR_SAMPLINGMODE
  )
  texture.name = name
  texture.hasAlpha = true
  return texture
}

function createFall(scene: Scene, name: string, capacity: number, texture: Texture): ParticleSystem {
  const system = new ParticleSystem(name, capacity, scene)
  system.particleTexture = texture
  system.emitter = Vector3.Zero()
  system.createBoxEmitter(
    new Vector3(0, -1, 0),
    new Vector3(0, -1, 0),
    new Vector3(-FALL.halfWidth, 0, -FALL.halfWidth),
    new Vector3(FALL.halfWidth, 0, FALL.halfWidth)
  )
  system.blendMode = ParticleSystem.BLENDMODE_STANDARD
  // Babylon steps particles 0.01 a frame by default; a sixtieth makes lifetimes, rates and speeds real seconds.
  system.updateSpeed = 1 / 60
  system.emitRate = 0
  system.start()
  return system
}

export interface Precipitation {
  readonly rain: ParticleSystem
  readonly snow: ParticleSystem
  readonly splashes: ParticleSystem
  /**
   * Lets rain and snow fall around a point for the weather: as hard as it's falling, blown by the wind, and as bright
   * as the light (0 to 1).
   */
  update(weather: Weather, around: Vector3, light: number): void
  dispose(): void
}

/** Rain and snow falling around the camera, so the player always stands in the weather, and rain splashing round it. */
export function createPrecipitation(
  scene: Scene,
  groundAt: GroundHeight = () => 0,
  { splashes: splashing = true }: { readonly splashes?: boolean } = {}
): Precipitation {
  const rain = createFall(scene, "rain", RAIN.capacity, sprite(scene, 4, 64, "raindrop"))
  rain.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED
  // Drawn wider than a real drop, which would be a fraction of a pixel from the camera's height.
  rain.minSize = 0.09
  rain.maxSize = 0.14
  rain.minScaleY = 10
  rain.maxScaleY = 16
  rain.minLifeTime = rain.maxLifeTime = (FALL.height + 5) / RAIN.speed
  rain.minEmitPower = rain.maxEmitPower = RAIN.speed

  const snow = createFall(scene, "snow", SNOW.capacity, sprite(scene, 16, 16, "snowflake"))
  snow.minSize = 0.22
  snow.maxSize = 0.4
  snow.minLifeTime = snow.maxLifeTime = (FALL.height + 2) / SNOW.speed
  snow.minEmitPower = snow.maxEmitPower = SNOW.speed
  snow.minAngularSpeed = -1
  snow.maxAngularSpeed = 1

  // Each splash starts on the ground under a random point near the camera, jumps a hand's height and falls back.
  const splashes = createFall(scene, "rain-splashes", SPLASH.capacity, sprite(scene, 16, 16, "splash"))
  let splashCentre = Vector3.Zero()
  splashes.startPositionFunction = (_world, position) => {
    const x = splashCentre.x + (Math.random() * 2 - 1) * SPLASH.halfWidth
    const z = splashCentre.z + (Math.random() * 2 - 1) * SPLASH.halfWidth
    position.set(x, groundAt(x, z) + 0.03, z)
  }
  splashes.direction1 = new Vector3(-0.4, 1, -0.4)
  splashes.direction2 = new Vector3(0.4, 1, 0.4)
  splashes.minEmitPower = 0.6
  splashes.maxEmitPower = 1.3
  splashes.gravity = new Vector3(0, -9.8, 0)
  splashes.minLifeTime = 0.12
  splashes.maxLifeTime = 0.28
  splashes.minSize = 0.06
  splashes.maxSize = 0.12
  splashes.addSizeGradient(0, 0.6)
  splashes.addSizeGradient(1, 2.2)

  return {
    rain,
    snow,
    splashes,
    update(weather, around, light) {
      const origin = new Vector3(around.x, around.y + FALL.height, around.z)
      const snowing = weather.snowFraction
      for (const [system, speed, rate, alpha] of [
        [rain, RAIN.speed, dropsPerSecond(weather.precipitation * (1 - snowing), RAIN.perMillimetre), 0.45],
        [snow, SNOW.speed, dropsPerSecond(weather.precipitation * snowing, SNOW.perMillimetre), 0.95]
      ] as const) {
        system.emitter = origin
        system.emitRate = rate
        // The wind carries what falls: direction scales with emit power, so the wind goes in as a fraction of the fall.
        const drift = new Vector3(weather.wind.x / speed, -1, weather.wind.z / speed)
        system.direction1 = drift
        system.direction2 = drift
        const shade = 0.25 + 0.75 * light
        system.color1 = new Color4(shade, shade, shade * 1.03, alpha)
        system.color2 = new Color4(shade * 0.9, shade * 0.92, shade, alpha * 0.7)
        // Each drop or flake lives just long enough to reach the ground, so it keeps its colour all the way down.
        system.colorDead = new Color4(shade * 0.9, shade * 0.92, shade, alpha * 0.7)
      }
      // Splashes: the share of drops falling in the box round the camera's target, fading as they spread.
      splashCentre = around
      const rainfall = weather.precipitation * (1 - snowing)
      splashes.emitRate = splashing
        ? dropsPerSecond(rainfall, RAIN.perMillimetre) * SPLASH.share * (SPLASH.halfWidth / FALL.halfWidth) ** 2
        : 0
      const shade = 0.3 + 0.7 * light
      splashes.color1 = new Color4(shade, shade, shade * 1.03, 0.55)
      splashes.color2 = new Color4(shade * 0.9, shade * 0.92, shade, 0.4)
      splashes.colorDead = new Color4(shade * 0.9, shade * 0.92, shade, 0)
    },
    dispose() {
      rain.dispose()
      snow.dispose()
      splashes.dispose()
    }
  }
}
