import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator"
import type { Material } from "@babylonjs/core/Materials/material"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import type { Color3 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import type { Scene } from "@babylonjs/core/scene"
import { type Simulation, WeatherPattern } from "@verdun/sim"
import { createDaylight, type Daylight, lightLevel } from "./daylight.ts"
import { createPrecipitation, type Precipitation } from "./precipitation.ts"

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
  /** Draws the simulation's time of day and weather. Call once a frame. */
  update(frameSeconds: number): void
  dispose(): void
}

/** How dark soaked ground and props get, and how much they shine. */
const WET = { darken: 0.38, propDarken: 0.2, shine: 0.14, power: 48 } as const
/** Particle drift per metre a second of wind: what made smoke and mist drift right on a 2 m/s westerly. */
const DRIFT = { smoke: 0.09, mist: 0.024 } as const
/** Seconds between lightning flashes in a thunderstorm, and how long one lights the field. */
const LIGHTNING = { minGap: 6, maxGap: 22, flash: 0.18 } as const

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
  const precipitation = createPrecipitation(scene)
  const wetness = createWetness(materials)
  const mistRate = air?.mist.emitRate ?? 0
  let untilLightning = LIGHTNING.maxGap
  let flash = 0

  return {
    daylight,
    precipitation,
    update(frameSeconds) {
      const { environment } = sim
      const { weather } = environment
      const target = camera.getTarget()
      daylight.update(Vector3.Distance(camera.position, target), air?.shadows)
      const light = lightLevel(environment.illuminance)
      precipitation.update(weather, target, light)
      wetness(weather.wetness)

      if (weather.pattern === WeatherPattern.Storm) {
        untilLightning -= frameSeconds
        if (untilLightning <= 0) {
          untilLightning = LIGHTNING.minGap + Math.random() * (LIGHTNING.maxGap - LIGHTNING.minGap)
          flash = LIGHTNING.flash
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
    dispose() {
      daylight.dispose()
      precipitation.dispose()
    }
  }
}
