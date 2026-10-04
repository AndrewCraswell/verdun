import { Body, Equator, Horizon, Illumination, Observer } from "astronomy-engine"

/** Where on Earth the battlefield lies, for the sun and moon. */
export interface GeoLocation {
  /** Degrees north. */
  readonly latitude: number
  /** Degrees east. */
  readonly longitude: number
  /** Metres above sea level. */
  readonly elevation: number
}

/** Fleury-devant-Douaumont, on the ridge between Fort Douaumont and Fort Souville. */
export const FLEURY: GeoLocation = { latitude: 49.1935, longitude: 5.433, elevation: 330 }

/** A body's place in the sky, in degrees: altitude above the horizon (refraction included), azimuth clockwise from north. */
export interface SkyPosition {
  readonly altitude: number
  readonly azimuth: number
}

export interface Sky {
  readonly sun: SkyPosition
  readonly moon: SkyPosition & {
    /** Fraction of the disc lit, from 0 (new) to 1 (full). */
    readonly phase: number
  }
  /** Light falling on open ground under a clear sky, in lux: sun, twilight, moon and stars together. */
  readonly clearIlluminance: number
}

/**
 * Daylight and twilight on open ground under a clear sky, by the sun's altitude: log10 of lux. From the US Naval
 * Observatory's sun illuminance tables: about 730 lux as the sun touches the horizon, 3 lux at the end of civil twilight
 * (-6°), less than a hundredth at the end of nautical twilight (-12°).
 */
const SUN_LUX: readonly (readonly [number, number])[] = [
  [-18, -3.3],
  [-12, -2.1],
  [-6, 0.53],
  [-0.8, 2.86],
  [5, 3.65],
  [10, 4],
  [20, 4.43],
  [30, 4.65],
  [60, 4.95],
  [90, 5.05]
]
/** Starlight and airglow on a clear moonless night. */
const STARLIGHT_LUX = 0.002

/** Linear interpolation through a table of [x, y] points, clamped at both ends. */
export function interpolate(table: readonly (readonly [number, number])[], x: number): number {
  const first = table[0]!
  if (x <= first[0]) {
    return first[1]
  }
  for (let index = 1; index < table.length; index++) {
    const [x1, y1] = table[index]!
    if (x <= x1) {
      const [x0, y0] = table[index - 1]!
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
    }
  }
  return table[table.length - 1]![1]
}

/**
 * Moonlight on open ground, in lux. The moon's visual magnitude gives its light above the atmosphere (a full moon, at
 * magnitude -12.7, gives about 0.26 lux); then the slant of its light and the air it passes through.
 */
function moonLux(altitude: number, magnitude: number): number {
  if (altitude <= 0) {
    return 0
  }
  const sine = Math.sin((altitude * Math.PI) / 180)
  const airMass = 1 / (sine + 0.025 * Math.exp(-11 * sine))
  return 10 ** ((-14.18 - magnitude) / 2.5) * sine * 0.8 ** airMass
}

/** The sun and moon over a place at a moment, and the light they give. `utc` is milliseconds since 1970. */
export function skyAt(utc: number, location: GeoLocation): Sky {
  const date = new Date(utc)
  const observer = new Observer(location.latitude, location.longitude, location.elevation)
  const place = (body: Body): SkyPosition => {
    const equator = Equator(body, date, observer, true, true)
    const horizon = Horizon(date, observer, equator.ra, equator.dec, "normal")
    return { altitude: horizon.altitude, azimuth: horizon.azimuth }
  }
  const sun = place(Body.Sun)
  const moon = place(Body.Moon)
  const illumination = Illumination(Body.Moon, date)
  const clearIlluminance = 10 ** interpolate(SUN_LUX, sun.altitude) + moonLux(moon.altitude, illumination.mag)
  return {
    sun,
    moon: { ...moon, phase: illumination.phase_fraction },
    clearIlluminance: clearIlluminance + STARLIGHT_LUX
  }
}

/**
 * Light reaching the ground through cloud, in lux. Kasten and Czeplak's cloud law: a full overcast lets through about
 * a quarter of the light of a clear sky, a half cover nearly all of it.
 */
export function illuminanceUnder(sky: Sky, cloudCover: number): number {
  return sky.clearIlluminance * (1 - 0.75 * cloudCover ** 3.4)
}

/**
 * How far away a man can be made out by a given light, in metres: log10 of lux to metres. On a moonless night a
 * sentry sees a standing man at about 30 m; by a full moon, at about 150 m; by late civil twilight, at about 500 m.
 * Past full daylight, light no longer limits it.
 */
const SIGHT_BY_LIGHT: readonly (readonly [number, number])[] = [
  [-3.5, 12],
  [-2.7, 30],
  [-1.7, 60],
  [-0.6, 150],
  [0.5, 500],
  [1.5, 1500],
  [2.5, 10_000]
]

/**
 * A soldier is a small, drab target: they fade out well inside the meteorological visibility, which is measured against
 * large dark landmarks.
 */
const SOLDIER_VISIBILITY = 0.6

/** Lying snow covers the churned ground from about this much water, in millimetres, as the weather plugin draws it. */
const SNOW_COVERS = 8

/**
 * How much lying snow helps the eye at night, as a factor on the light: a man is seen against the ground behind him, and
 * snow sends back about 80% of the light where mud and grass send back 10–15%, so a dark figure on snow stands out as if
 * the night were several times brighter. Under cloud the light also bounces between the snow and the cloud base, which
 * brightens snowy overcast nights further. About 4.5 times on a clear night over full cover, 6 under overcast.
 */
export function snowGlow(snowCover: number, cloudCover: number): number {
  const cover = Math.min(1, snowCover / SNOW_COVERS)
  return 1 + cover * (3.5 + 1.5 * cloudCover)
}

/** How far a man can be made out, in metres: limited by the light and by fog, rain or snow. */
export function sightRange(illuminance: number, visibility: number): number {
  const byLight = interpolate(SIGHT_BY_LIGHT, Math.log10(Math.max(illuminance, 1e-6)))
  return Math.min(byLight, visibility * SOLDIER_VISIBILITY)
}
