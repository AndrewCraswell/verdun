import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator"
import type { Material } from "@babylonjs/core/Materials/material"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import type { Color3 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Observable } from "@babylonjs/core/Misc/observable"
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import { type Simulation, soldierIds, type Weather, WeatherPattern } from "@verdun/sim"
import { createDaylight, type Daylight, lightLevel } from "./daylight.ts"
import { createGroundMarks } from "./ground-marks.ts"
import { createHeightFog, type HeightFog, heightFogFor } from "./height-fog.ts"
import { createPrecipitation, type Precipitation } from "./precipitation.ts"
import { createCloudTexture, type WeatherSurface, WeatherSurfacePlugin } from "./weather-surface-plugin.ts"
import { type Wind, WindSwayPlugin } from "./wind-sway-plugin.ts"

/** The level's own atmosphere: shadows from the key light, and smoke and mist that drift on the wind. */
export interface LevelAir {
  readonly shadows: ShadowGenerator | null
  readonly smoke: ParticleSystem
  readonly mist: ParticleSystem
}

export interface EnvironmentViewOptions {
  /** Materials that darken when the ground is wet: the ground's first, then the props'. */
  readonly materials?: readonly Material[]
  readonly air?: LevelAir | null
}

export interface EnvironmentView {
  readonly daylight: Daylight
  readonly precipitation: Precipitation
  /** Cloud shadows and lying snow, as the ground and props are drawn with them now. */
  readonly surface: Readonly<WeatherSurface>
  /** The wind the grass and trees sway in. */
  readonly wind: Readonly<Wind>
  /** The fog lying low over the field now (see height-fog.ts), for anything that draws it: particles, materials. */
  readonly heightFog: Readonly<HeightFog>
  /** Fires on each lightning flash with how far off it struck, in metres: thunder follows at 3 s a kilometre. */
  readonly onLightning: Observable<number>
  /** Draws the simulation's time of day and weather. Call once a frame. */
  update(frameSeconds: number): void
  /** Craters have reshaped the ground: puddles find its new hollows, within a couple of seconds. */
  reshape(): void
  dispose(): void
}

/** How dark soaked ground and props get, and how much they shine. */
const WET = { darken: 0.38, propDarken: 0.2, shine: 0.14, power: 48 } as const
/** Particle drift per metre a second of wind: what made smoke and mist drift right on a 2 m/s westerly. */
const DRIFT = { smoke: 0.09, mist: 0.024 } as const
/** Seconds between lightning flashes in a thunderstorm, and how long one lights the field. */
const LIGHTNING = { minGap: 6, maxGap: 22, flash: 0.18, nearest: 1500, farthest: 8000 } as const
/** Clouds drift with the wind aloft, this many times the wind near the ground, and never slower than `least`, in m/s. */
const CLOUD_DRIFT = { aloft: 3, least: 3 } as const
/** Cloud shadows are this dark at most, on a half-cloudy day with the sun high. */
const CLOUD_SHADOW = 0.45
/** Snow lying this deep, in millimetres of water, covers the ground. */
const SNOW_COVERS = 8
/**
 * Puddles: none until the ground is this wet; then water rises in the hollows from `dry` metres below their brims to
 * `sodden` below as the ground soaks. Rain of `heavy` mm an hour ripples them hard.
 */
const PUDDLES = { from: 0.2, full: 0.95, dry: 0.5, sodden: 0.05, heavy: 4 } as const
/**
 * Plants sway as hard as the wind is strong, `perMetre` of strength for each metre a second, and never quite still:
 * a breath of air moves the grass on the calmest day.
 */
const SWAY = { perMetre: 0.2, least: 0.15, most: 3 } as const
/** Seconds between marking where men tread in snow, and between finding the hollows again after craters. */
const MARKS = { tread: 0.5, reshape: 2 } as const

/**
 * How thick fog lies in the low ground, from 0 to 1. Fog in the forecast fills the ravines first; and on a clear, calm
 * night over damp ground, the air cooling off the ground drains into the hollows as radiation fog even when the forecast
 * is clear. Wind stirs both away.
 */
export function groundFogFor(weather: Weather, windSpeed: number, light: number): number {
  const foggy = Math.min(1, Math.max(0, Math.log(20_000 / weather.visibility) / Math.log(100)))
  const radiation = 0.6 * (1 - light) * (1 - weather.cloudCover) * smoothstep(0.2, 0.6, weather.wetness)
  const calm = 1 - smoothstep(2, 7, windSpeed)
  return Math.min(1, (0.8 * foggy + radiation) * (0.35 + 0.65 * calm))
}

const smoothstep = (from: number, to: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

const isSun = (light: unknown): light is DirectionalLight => light instanceof DirectionalLight
const isSky = (light: unknown): light is HemisphericLight => light instanceof HemisphericLight
const isStandard = (material: Material): material is StandardMaterial => material instanceof StandardMaterial

/** Darkens materials as the ground gets wet: soaked earth and timber go darker and catch a little light. */
function createWetness(materials: readonly Material[]) {
  const standard = materials.filter(isStandard)
  const dry = new Map<StandardMaterial, { diffuse: Color3; specular: Color3; power: number }>(
    standard.map((material) => [
      material,
      {
        diffuse: material.diffuseColor.clone(),
        specular: material.specularColor.clone(),
        power: material.specularPower
      }
    ])
  )
  let shown = -1
  return (wetness: number) => {
    if (Math.abs(wetness - shown) < 0.01) {
      return
    }
    shown = wetness
    standard.forEach((material, index) => {
      const base = dry.get(material)
      if (!base) {
        return
      }
      const darken = index === 0 ? WET.darken : WET.propDarken
      base.diffuse.scaleToRef(1 - darken * wetness, material.diffuseColor)
      material.specularColor.set(
        base.specular.r + WET.shine * wetness,
        base.specular.g + WET.shine * wetness,
        base.specular.b + WET.shine * wetness
      )
      material.specularPower = wetness > 0.05 ? WET.power : base.power
    })
  }
}

/**
 * The simulation's environment on screen: daylight and night, fog, rain and snow around the camera, lightning in a
 * thunderstorm, wet ground after rain, and the level's smoke and mist drifting on the wind.
 */
export function createEnvironmentView(
  scene: Scene,
  sim: Simulation,
  camera: TargetCamera,
  { materials = [], air = null }: EnvironmentViewOptions = {}
): EnvironmentView | null {
  const key = scene.lights.find(isSun)
  const sky = scene.lights.find(isSky)
  if (!key || !sky) {
    return null
  }
  const daylight = createDaylight(scene, sim.environment, key, sky)
  const precipitation = createPrecipitation(scene, (x, z) => heightAt(sim.map, x, z))
  const wetness = createWetness(materials)
  const surface: WeatherSurface = {
    cloudOffsetX: 0,
    cloudOffsetZ: 0,
    shadowedShare: 0,
    shadowDepth: 0,
    snow: 0,
    snowBrightness: 1,
    groundFog: 0,
    waterMargin: PUDDLES.dry,
    waterShown: 0,
    rain: 0,
    time: 0,
    reflectR: 0,
    reflectG: 0,
    reflectB: 0
  }
  const clouds = createCloudTexture(scene)
  const marks = createGroundMarks(scene, sim.map)
  // The fog lies on the low ground: the height a tenth of the map lies below.
  const heights = Float32Array.from(sim.map.heights).sort()
  const heightFog = createHeightFog(heights[Math.floor(heights.length * 0.1)] ?? 0)
  const surfaced = materials.map((material) => new WeatherSurfacePlugin(material, clouds, marks, surface))
  const wind: Wind = { towardX: 1, towardZ: 0, strength: SWAY.least, time: 0 }
  const swaying = materials.map((material) => new WindSwayPlugin(material, wind))
  let untilTread = 0
  let untilReshape = 0
  let reshaped = false
  const onLightning = new Observable<number>()
  const mistRate = air?.mist.emitRate ?? 0
  let untilLightning = LIGHTNING.maxGap
  let flash = 0

  return {
    daylight,
    precipitation,
    surface,
    wind,
    heightFog,
    onLightning,
    update(frameSeconds) {
      const { environment } = sim
      const { weather } = environment
      const target = camera.getTarget()
      daylight.update(Vector3.Distance(camera.position, target), air?.shadows)
      const light = lightLevel(environment.illuminance)
      precipitation.update(weather, target, light)
      wetness(weather.wetness)

      // Broken cloud throws drifting shadows while the sun is up; a clear or an overcast sky throws none.
      const windSpeed = Math.sqrt(sim.wind.x ** 2 + sim.wind.z ** 2)
      const drift = Math.max(CLOUD_DRIFT.least, windSpeed * CLOUD_DRIFT.aloft) * frameSeconds
      // Becalmed, the clouds still come in from the west.
      surface.cloudOffsetX -= (windSpeed > 0 ? sim.wind.x / windSpeed : 1) * drift
      surface.cloudOffsetZ -= (windSpeed > 0 ? sim.wind.z / windSpeed : 0) * drift
      if (windSpeed > 0) {
        wind.towardX = sim.wind.x / windSpeed
        wind.towardZ = sim.wind.z / windSpeed
      }
      wind.strength = Math.min(SWAY.most, Math.max(SWAY.least, windSpeed * SWAY.perMetre))
      wind.time += frameSeconds
      const sunUp = Math.min(1, Math.max(0, environment.sky.sun.altitude / 10))
      surface.shadowedShare = weather.cloudCover
      surface.shadowDepth = CLOUD_SHADOW * sunUp * Math.sin(Math.PI * weather.cloudCover)
      surface.snow = Math.min(1, weather.snowCover / SNOW_COVERS)
      surface.snowBrightness = 0.15 + 0.85 * light

      surface.groundFog = groundFogFor(weather, windSpeed, light)
      const { density, falloff } = heightFogFor(weather)
      heightFog.density = density
      heightFog.falloff = falloff
      heightFog.color.copyFrom(scene.fogColor)

      // Puddles rise in the hollows as the ground soaks, mirror the haze, and ripple in rain; frozen, they lie still.
      const soaking = smoothstep(PUDDLES.from, PUDDLES.full, weather.wetness)
      surface.waterShown = smoothstep(PUDDLES.from, PUDDLES.from + 0.15, weather.wetness)
      surface.waterMargin = PUDDLES.dry + (PUDDLES.sodden - PUDDLES.dry) * soaking
      const rainfall = weather.temperature > 0 ? weather.precipitation * (1 - weather.snowFraction) : 0
      surface.rain = Math.min(1, rainfall / PUDDLES.heavy)
      surface.time += frameSeconds
      surface.reflectR = scene.fogColor.r
      surface.reflectG = scene.fogColor.g
      surface.reflectB = scene.fogColor.b

      // Men tread trails through lying snow; fresh snow fills them.
      untilTread -= frameSeconds
      if (untilTread <= 0) {
        untilTread = MARKS.tread
        const { x, z } = sim.soldiers.position
        const standing = weather.snowCover > 0.05 ? soldierIds(sim) : []
        marks.tread(
          standing.map((soldier) => ({ x: x[soldier] ?? 0, z: z[soldier] ?? 0 })),
          weather.snowCover
        )
      }
      untilReshape -= frameSeconds
      if (reshaped && untilReshape <= 0) {
        untilReshape = MARKS.reshape
        reshaped = false
        marks.reshape()
      }

      if (weather.pattern === WeatherPattern.Storm) {
        untilLightning -= frameSeconds
        if (untilLightning <= 0) {
          untilLightning = LIGHTNING.minGap + Math.random() * (LIGHTNING.maxGap - LIGHTNING.minGap)
          flash = LIGHTNING.flash
          onLightning.notifyObservers(LIGHTNING.nearest + Math.random() * (LIGHTNING.farthest - LIGHTNING.nearest))
        }
      }
      if (flash > 0) {
        flash -= frameSeconds
        sky.intensity += 1.6 * Math.max(0, flash / LIGHTNING.flash)
      }

      if (air) {
        air.smoke.gravity.set(sim.wind.x * DRIFT.smoke, 0, sim.wind.z * DRIFT.smoke)
        air.mist.gravity.set(sim.wind.x * DRIFT.mist, 0, sim.wind.z * DRIFT.mist)
        // Mist thickens as visibility falls, and thins in a dry, clear afternoon.
        const fog = Math.min(1, Math.max(0, Math.log(20_000 / weather.visibility) / Math.log(100)))
        air.mist.emitRate = mistRate * (0.4 + 2.6 * fog)
      }
    },
    reshape() {
      reshaped = true
    },
    dispose() {
      daylight.dispose()
      precipitation.dispose()
      surfaced.forEach((plugin) => plugin.dispose())
      swaying.forEach((plugin) => plugin.dispose())
      clouds.dispose()
      marks.dispose()
      onLightning.clear()
    }
  }
}
