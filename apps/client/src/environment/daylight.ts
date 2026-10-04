import { Atmosphere } from "@babylonjs/addons/atmosphere/atmosphere"
import type { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import type { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator"
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Scene } from "@babylonjs/core/scene"
import type { Environment, SkyPosition } from "@verdun/sim"

/**
 * Brightness the eye reads in a light level: log10 of lux from a moonless night (0.001 lux) to an overcast noon
 * (10,000 lux and more), as 0 to 1. The renderer can't show a range of ten million to one, so night is drawn dim and
 * blue rather than black, as films and games have always done.
 */
export function lightLevel(illuminance: number): number {
  return Math.min(1, Math.max(0, (Math.log10(Math.max(illuminance, 1e-6)) + 3) / 7))
}

/** The direction light from a body in the sky travels: down from it, in the map's frame (x east, y up, z north). */
export function lightDirection({ altitude, azimuth }: SkyPosition): Vector3 {
  const radians = Math.PI / 180
  const up = Math.sin(altitude * radians)
  const across = Math.cos(altitude * radians)
  return new Vector3(-across * Math.sin(azimuth * radians), -up, -across * Math.cos(azimuth * radians)).normalize()
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)))
  return t * t * (3 - 2 * t)
}

/** Sunlight through the air by the sun's altitude, where the atmosphere add-on can't run: red at the horizon. */
const SUN_COLORS: readonly (readonly [number, Color3])[] = [
  [0, Color3.FromHexString("#ff7a3d")],
  [4, Color3.FromHexString("#ffa860")],
  [12, Color3.FromHexString("#ffd9a8")],
  [30, Color3.FromHexString("#fff0d6")]
]
/** Moonlight as the dark-adapted eye sees it: cool and grey. */
const MOON_COLOR = Color3.FromHexString("#9fb2d8")
const DAY_SKY = Color3.FromHexString("#d3d9e0")
/**
 * A full moon high up as a key light, against the sun's 1: a quarter million times fainter in truth, but drawn bright
 * enough that a moonlit night reads clearly brighter than a moonless one, with shadows, as eyes adapted to the dark see
 * it.
 */
const MOONLIGHT = 0.6
const NIGHT_SKY = Color3.FromHexString("#6f87b5")
const DAY_GROUND = Color3.FromHexString("#6b5e4f")
const NIGHT_GROUND = Color3.FromHexString("#2a2c33")
/** Haze the sector sits in on a fair day, and fog colour by day and by night. */
const HAZE_DENSITY = 0.0011
const DAY_FOG = Color3.FromHexString("#8e938f")
const NIGHT_FOG = Color3.FromHexString("#1d2330")
/**
 * The camera looks down through the fog, which lies near the ground, not along it as a man on the ground looks; drawn
 * at full density it would hide the ground entirely from a camera a few hundred metres up. However thick the fog, at
 * least this much of the ground where the camera looks still shows through.
 */
const GROUND_SHOWING = 0.35

/** Scene fog density for the weather, thinned so the ground `cameraDistance` metres away still shows through. */
export function fogDensityFor(lighting: Lighting, cameraDistance: number): number {
  const limit = Math.sqrt(-Math.log(GROUND_SHOWING)) / Math.max(1, cameraDistance)
  return Math.max(Math.min(lighting.fogDensity, limit), Math.min(HAZE_DENSITY, limit))
}

/** The haze at sunrise and sunset, catching the low sun: a muted rose-amber, not a postcard. */
const TWILIGHT_HAZE = Color3.FromHexString("#b88f72")

/**
 * How much the haze takes the low sun's colour, from 0 to 1: most with the sun just at the horizon, fading by the time
 * it is 8° up, and gone once it is 6° below. Overcast mutes it.
 */
export function twilight(altitude: number): number {
  return altitude < 0 ? smoothstep(-6, 0, altitude) : 1 - smoothstep(1, 8, altitude)
}

/** The light settings a fair midday had before the day cycled. */
const FULL = { sunIntensity: 1.15, skyIntensity: 0.75, shadowDarkness: 0.42 } as const

export function sunColorAt(altitude: number): Color3 {
  const first = SUN_COLORS[0]!
  if (altitude <= first[0]) {
    return first[1].clone()
  }
  for (let index = 1; index < SUN_COLORS.length; index++) {
    const [high, color] = SUN_COLORS[index]!
    if (altitude <= high) {
      const [low, below] = SUN_COLORS[index - 1]!
      return Color3.Lerp(below, color, (altitude - low) / (high - low))
    }
  }
  return SUN_COLORS[SUN_COLORS.length - 1]![1].clone()
}

/** How the scene is lit for an environment: the key light (sun or moon), the sky's fill light, fog and shadow. */
export interface Lighting {
  readonly keyDirection: Vector3
  /** Whether the key light is the moon. */
  readonly moonlit: boolean
  readonly keyColor: Color3
  readonly keyIntensity: number
  readonly skyColor: Color3
  readonly groundColor: Color3
  readonly skyIntensity: number
  readonly fogColor: Color3
  readonly fogDensity: number
  /** Babylon's shadow darkness: 0 for black shadows, 1 for none. */
  readonly shadowDarkness: number
}

export function lightingFor(environment: Environment): Lighting {
  const { sky, weather } = environment
  const level = lightLevel(environment.illuminance)
  // Cloud takes the direct beam first: under a full overcast there is no sun to cast a shadow, only grey sky.
  const direct = 1 - 0.92 * weather.cloudCover ** 1.6
  const sunUp = smoothstep(-2, 6, sky.sun.altitude)
  const moonUp = smoothstep(0, 10, sky.moon.altitude) * sky.moon.phase * MOONLIGHT
  const moonlit = moonUp > sunUp
  const key = moonlit ? sky.moon : sky.sun
  const keyStrength = Math.max(sunUp, moonUp) * direct
  const night = 1 - smoothstep(0.3, 0.6, level)
  const keyColor = moonlit ? MOON_COLOR.clone() : sunColorAt(sky.sun.altitude)
  // Koschmieder: a dark object fades to 5% contrast at the visibility; exp2 fog reaches 5% at 1.73 / density.
  const fogDensity = Math.max(HAZE_DENSITY, 1.73 / weather.visibility)
  return {
    keyDirection: lightDirection(key),
    moonlit,
    keyColor,
    keyIntensity: FULL.sunIntensity * keyStrength * (0.25 + 0.75 * level),
    skyColor: Color3.Lerp(DAY_SKY, NIGHT_SKY, night),
    groundColor: Color3.Lerp(DAY_GROUND, NIGHT_GROUND, night),
    skyIntensity: FULL.skyIntensity * (0.45 + 0.55 * level ** 0.8) * (1 + 0.25 * weather.cloudCover),
    fogColor: Color3.Lerp(
      Color3.Lerp(DAY_FOG, NIGHT_FOG, night),
      TWILIGHT_HAZE,
      twilight(sky.sun.altitude) * (1 - 0.6 * weather.cloudCover)
    ).scale(0.35 + 0.65 * level),
    fogDensity,
    shadowDarkness: 1 - (1 - FULL.shadowDarkness) * Math.min(1, keyStrength * 1.2)
  }
}

export interface Daylight {
  /** The physically based atmosphere colouring sunlight, where the engine supports it. */
  readonly atmosphere: Atmosphere | null
  /** Lights the scene for the environment now, for a camera that far from what it looks at. Call once a frame. */
  update(cameraDistance: number, shadows?: ShadowGenerator | null): void
  dispose(): void
}

/**
 * Lights the battlefield by the simulation's clock and weather: the sun or the moon as the key light, the sky as fill,
 * fog and haze by the visibility, shadows that fade as the cloud thickens. Where the engine supports it, Babylon's
 * physically based atmosphere colours the sunlight through the air, from white at noon to red at sunset.
 */
export function createDaylight(
  scene: Scene,
  environment: Environment,
  key: DirectionalLight,
  sky: HemisphericLight
): Daylight {
  const atmosphere = Atmosphere.IsSupported(scene.getEngine())
    ? new Atmosphere("atmosphere", scene, [key], {
        isSkyViewLutEnabled: false,
        isAerialPerspectiveLutEnabled: false,
        isDiffuseSkyIrradianceLutEnabled: false
      })
    : null
  // The camera never looks up at the sky, so the atmosphere only colours the light; nothing draws it.
  if (atmosphere) {
    atmosphere.skyRenderingGroup = -1
    atmosphere.aerialPerspectiveRenderingGroup = -1
    atmosphere.globeAtmosphereRenderingGroup = -1
  }
  let lighting = lightingFor(environment)
  // Before each camera renders, the atmosphere sets the key light's colour to sunlight through the air along its
  // direction, in linear space, then converts it for the materials. Moonlight keeps its own colour.
  const observer = atmosphere?.onBeforeLightVariablesUpdateObservable.add(() => {
    if (lighting.moonlit) {
      lighting.keyColor.toLinearSpaceToRef(key.diffuse)
      key.specular.copyFrom(key.diffuse)
    }
  })
  return {
    atmosphere,
    update(cameraDistance, shadows) {
      lighting = lightingFor(environment)
      key.direction.copyFrom(lighting.keyDirection)
      key.intensity = lighting.keyIntensity
      if (!atmosphere || lighting.moonlit) {
        key.diffuse.copyFrom(lighting.keyColor)
      }
      key.specular.copyFrom(key.diffuse)
      sky.diffuse.copyFrom(lighting.skyColor)
      sky.groundColor.copyFrom(lighting.groundColor)
      sky.intensity = lighting.skyIntensity
      scene.fogColor.copyFrom(lighting.fogColor)
      scene.fogDensity = fogDensityFor(lighting, cameraDistance)
      scene.clearColor = Color4.FromColor3(lighting.fogColor, 1)
      shadows?.setDarkness(lighting.shadowDarkness)
    },
    dispose() {
      observer?.remove()
      atmosphere?.dispose()
    }
  }
}
