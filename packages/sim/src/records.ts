import fleury from "../data/fleury-weather-1914-1918.json" with { type: "json" }
import {
  type AirAt,
  createCycleAir,
  type Forecast,
  morningFogAt,
  precipitationVisibility,
  smoothNoise,
  WeatherPattern,
  withGround
} from "./weather.ts"

/**
 * The weather of the war in one region, 3-hourly from 1 August 1914 to 30 November 1918: the 20th Century Reanalysis
 * corrected by Météo-France's station records, built by scripts/build-historical-weather.mjs. Values are fixed-point
 * integers: temperature in tenths of a °C, cloud and humidity in percent, precipitation in hundredths of a millimetre
 * an hour, snow as the percentage falling as snow, wind in tenths of a metre per second toward +x (east) and +z
 * (north) near the ground. `fogs` are fogs history records: [first hour, last hour (UTC ms), visibility in metres].
 */
export interface WeatherRecords {
  readonly start: number
  readonly stepHours: number
  readonly temperature: readonly number[]
  readonly cloud: readonly number[]
  readonly precipitation: readonly number[]
  readonly snow: readonly number[]
  readonly windX: readonly number[]
  readonly windZ: readonly number[]
  readonly humidity: readonly number[]
  readonly fogs: readonly (readonly number[])[]
  /** Where the records are for, which sets the hours of dawn for radiation fog. */
  readonly location?: { readonly latitude: number; readonly longitude: number }
}

/**
 * The regions of the Western Front with history's weather. Fleury's serves all of Verdun, the Argonne and Les Éparges,
 * and is built in; the others load when a battle needs them (`loadWeatherRegion`).
 * - champagne: Souain and Perthes, the offensives of 1915.
 * - aisne: the Chemin des Dames at Craonne, with Malmaison, the 1914 crossings and the Marne of 1918.
 * - somme: Albert and Thiepval, 1916.
 * - artois: Vimy and Arras, 1915 and 1917.
 */
export const WEATHER_REGIONS = ["fleury", "champagne", "aisne", "somme", "artois"] as const
export type WeatherRegion = (typeof WEATHER_REGIONS)[number]

const loaded = new Map<WeatherRegion, WeatherRecords>([["fleury", fleury]])
const loaders: Readonly<Record<Exclude<WeatherRegion, "fleury">, () => Promise<{ default: WeatherRecords }>>> = {
  champagne: () => import("../data/champagne-weather-1914-1918.json", { with: { type: "json" } }),
  aisne: () => import("../data/aisne-weather-1914-1918.json", { with: { type: "json" } }),
  somme: () => import("../data/somme-weather-1914-1918.json", { with: { type: "json" } }),
  artois: () => import("../data/artois-weather-1914-1918.json", { with: { type: "json" } })
}

/** Loads a region's weather, once, before a battle there creates its forecast. Fleury's is always loaded. */
export async function loadWeatherRegion(region: WeatherRegion): Promise<void> {
  if (!loaded.has(region) && region !== "fleury") {
    loaded.set(region, (await loaders[region]()).default)
  }
}

/** A region's weather, which must have been loaded. */
function recordsOf(region: WeatherRegion): WeatherRecords {
  const records = loaded.get(region)
  if (!records) {
    throw new Error(`History's weather for ${region} isn't loaded: await loadWeatherRegion("${region}") first`)
  }
  return records
}

const HOUR = 3_600_000
/** Clear air over the battlefield is this hazy, in metres of visibility, from dry air to damp. */
const HAZE = { dry: 30_000, damp: 8000 } as const
/** Radiation fog forms in air this damp or damper, and this calm, in m/s. */
const FOG = { humidity: 93, wind: 2.5, visibility: 120 } as const
const GUST_MINUTES = 10
const SHOWER_MINUTES = 25

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** What history's weather looks like as a pattern, for anything that wants to name it. */
function patternOf(precipitation: number, cloudCover: number, visibility: number, temperature: number): WeatherPattern {
  if (precipitation >= 3 && temperature > 10) {
    return WeatherPattern.Storm
  }
  if (precipitation >= 0.35) {
    return WeatherPattern.Rain
  }
  if (precipitation >= 0.05) {
    return WeatherPattern.Drizzle
  }
  if (visibility < 1000) {
    return WeatherPattern.Fog
  }
  if (cloudCover >= 0.8) {
    return WeatherPattern.Overcast
  }
  return cloudCover >= 0.25 ? WeatherPattern.Fair : WeatherPattern.Clear
}

/**
 * A forecast that plays history's weather: between the 3-hourly records temperature, cloud, humidity and wind are
 * interpolated, rain and snow held, with the same seeded gusts and showers as the cycle. Fog, which neither source
 * records, forms in damp, calm air in the small hours and at dawn, as radiation fog does, and wherever history records
 * one. Outside the records the cycle takes over, from the same seed.
 */
export function createRecordsForecast(
  spec: { readonly kind: "records"; readonly seed: number; readonly region?: WeatherRegion },
  records: WeatherRecords = recordsOf(spec.region ?? "fleury")
): Forecast {
  const { latitude, longitude } = records.location ?? { latitude: 49.1935, longitude: 5.433 }
  const step = records.stepHours * HOUR
  const last = records.temperature.length - 1
  const outside = createCycleAir(spec.seed)
  const airAt: AirAt = (utc) => {
    const position = (utc - records.start) / step
    if (position < 0 || position >= last) {
      return outside(utc)
    }
    const index = Math.floor(position)
    const along = position - index
    const between = (values: readonly number[]) => lerp(values[index]!, values[index + 1]!, along)
    const temperature = between(records.temperature) / 10
    const cloudCover = Math.min(1, Math.max(0, between(records.cloud) / 100))
    const humidity = between(records.humidity)
    const snowFraction = Math.min(1, Math.max(0, between(records.snow) / 100))
    const showers = 1 + 0.5 * smoothNoise(spec.seed + 1, utc, SHOWER_MINUTES * 60_000)
    const precipitation = (records.precipitation[index]! / 100) * showers
    const windX = between(records.windX) / 10
    const windZ = between(records.windZ) / 10
    const calm = Math.sqrt(windX * windX + windZ * windZ)
    const gust = 1 + 0.3 * smoothNoise(spec.seed + 2, utc, GUST_MINUTES * 60_000)
    const veer = 0.35 * smoothNoise(spec.seed + 3, utc, GUST_MINUTES * 60_000)
    const haze = Math.exp(lerp(Math.log(HAZE.dry), Math.log(HAZE.damp), Math.min(1, Math.max(0, (humidity - 50) / 45))))
    const damp = Math.min(1, Math.max(0, (humidity - FOG.humidity) / (100 - FOG.humidity)))
    const still = Math.max(0, 1 - calm / FOG.wind)
    const fog = damp * still * morningFogAt(utc, latitude, longitude)
    let visibility = Math.min(
      Math.exp(lerp(Math.log(haze), Math.log(FOG.visibility), fog)),
      precipitationVisibility(precipitation, snowFraction)
    )
    for (const [from, to, recorded] of records.fogs) {
      if (utc >= from! && utc <= to!) {
        visibility = Math.min(visibility, recorded!)
      }
    }
    return {
      pattern: patternOf(precipitation, cloudCover, visibility, temperature),
      cloudCover,
      precipitation,
      snowFraction,
      temperature,
      visibility,
      wind: {
        x: gust * (windX * Math.cos(veer) - windZ * Math.sin(veer)),
        z: gust * (windX * Math.sin(veer) + windZ * Math.cos(veer))
      }
    }
  }
  return { spec, at: (utc) => withGround(airAt, utc) }
}
