import { type Forecast, type Weather, WeatherPattern } from "./weather.ts"

const HOUR = 3_600_000
const DAY = 24 * HOUR

/** A day's weather in brief, as a communiqué or a soldier would give it. */
export interface DayOutlook {
  /** 00:00 UTC on the day. */
  readonly day: number
  /** The day's weather by daylight: what most of the hours from 06:00 to 18:00 UTC were. */
  readonly pattern: WeatherPattern
  /** Lowest and highest temperatures, °C. */
  readonly low: number
  readonly high: number
  /** Rain and snow over the day, in millimetres of water. */
  readonly precipitation: number
  /** Whether much of it fell as snow. */
  readonly snow: boolean
  /** Whether there was fog, thick enough to hide a man at 600 m (visibility under 1 km), at some hour. */
  readonly fog: boolean
  /** The wind in the afternoon: compass degrees it blows from, and its speed near the ground in m/s. */
  readonly windFrom: number
  readonly windSpeed: number
}

/** The compass direction a wind blows from, in degrees clockwise from north. */
export function windFrom(wind: Weather["wind"]): number {
  // Toward (x east, z north); from is the opposite way.
  const toward = (Math.atan2(wind.x, wind.z) * 180) / Math.PI
  return (toward + 180 + 360) % 360
}

/** One day's outlook from a forecast, sampled hourly. */
export function dayOutlook(forecast: Forecast, day: number): DayOutlook {
  const hours = Array.from({ length: 24 }, (_, hour) => forecast.at(day + hour * HOUR))
  const daylight = hours.slice(6, 19)
  const counts = new Map<WeatherPattern, number>()
  for (const weather of daylight) {
    counts.set(weather.pattern, (counts.get(weather.pattern) ?? 0) + 1)
  }
  const pattern = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? WeatherPattern.Fair
  const temperatures = hours.map((weather) => weather.temperature)
  const precipitation = hours.reduce((sum, weather) => sum + weather.precipitation, 0)
  const snowfall = hours.reduce((sum, weather) => sum + weather.precipitation * weather.snowFraction, 0)
  const afternoon = hours[15]!
  return {
    day,
    pattern,
    low: Math.min(...temperatures),
    high: Math.max(...temperatures),
    precipitation,
    snow: snowfall > 0.5 && snowfall > precipitation / 2,
    fog: hours.some((weather) => weather.visibility < 1000),
    windFrom: windFrom(afternoon.wind),
    windSpeed: Math.sqrt(afternoon.wind.x ** 2 + afternoon.wind.z ** 2)
  }
}

/**
 * A day's weather as the staff's forecast gave it: exact for the day it's issued, a forecaster's call for the days after,
 * vaguer and more often wrong the further ahead it looks, as forecasts in 1916 were. Players plan attacks round fog and
 * rain; a forecast they can trust for today but only guess by for next week keeps that a gamble.
 */
export interface ForecastDay {
  /** 00:00 UTC on the day. */
  readonly day: number
  /** Days ahead of the day the forecast was issued: 0 is that day, known for certain. */
  readonly ahead: number
  /** Whether the forecast is certain: the day it's issued. */
  readonly certain: boolean
  /** The forecaster's call for the day's sky by daylight. */
  readonly pattern: WeatherPattern
  /** The chance of rain or snow, from 0 to 1: 0 or 1 when certain. */
  readonly wet: number
  /** Whether what falls would be snow. */
  readonly snow: boolean
  /** The chance of fog at some hour, from 0 to 1. */
  readonly fog: number
  /** Lowest and highest temperatures expected, °C. */
  readonly low: number
  readonly high: number
  /** The wind expected in the afternoon: compass degrees it blows from, and m/s. */
  readonly windFrom: number
  readonly windSpeed: number
}

/** How far a forecast's skill falls each day further ahead: a day's is worth this much of the day before's. */
const SKILL_PER_DAY = 0.6
/** What a forecaster with no skill would say, over the year at Verdun: rain on two days in five, fog seldom. */
const CLIMATE = { wet: 0.4, fog: 0.03 } as const
/** Errors grow each day ahead by this much: degrees Celsius, compass degrees of wind. */
const ERROR_PER_DAY = { temperature: 1.5, wind: 25 } as const
/** A day's rain counts as wet from this much water, in mm. */
const WET_DAY = 1

/** A fixed hash of three numbers to 0..1: the same forecast always reads the same, and draws on no dice in play. */
function noise(a: number, b: number, c: number): number {
  let h = Math.imul(
    Math.floor(a / 3_600_000) * 374_761_393 + Math.floor(b / 3_600_000) * 668_265_263 + c * 2_246_822_519,
    1_274_126_177
  )
  h = Math.imul(h ^ (h >>> 13), 1_103_515_245)
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** One day of the staff's forecast, issued on `issued` (00:00 UTC on the issue day). */
export function forecastDay(forecast: Forecast, issued: number, day: number): ForecastDay {
  const truth = dayOutlook(forecast, day)
  const ahead = Math.max(0, Math.round((day - issued) / DAY))
  if (ahead === 0) {
    return {
      day,
      ahead,
      certain: true,
      pattern: truth.pattern,
      wet: truth.precipitation >= WET_DAY ? 1 : 0,
      snow: truth.snow,
      fog: truth.fog ? 1 : 0,
      low: truth.low,
      high: truth.high,
      windFrom: truth.windFrom,
      windSpeed: truth.windSpeed
    }
  }
  const skill = SKILL_PER_DAY ** ahead
  const guess = (salt: number) => noise(issued, day, salt) * 2 - 1
  // Each chance leans toward the truth as far as the forecaster's skill goes, toward the season's odds beyond it, and
  // wanders with the forecaster's errors.
  const truthWet = clamp01(truth.precipitation / (WET_DAY * 2))
  const wet = clamp01(skill * truthWet + (1 - skill) * CLIMATE.wet + guess(1) * (1 - skill))
  const fog = clamp01(skill * (truth.fog ? 1 : 0) + (1 - skill) * CLIMATE.fog + guess(2) * 0.3 * (1 - skill))
  const warmer = guess(3) * ERROR_PER_DAY.temperature * ahead
  let pattern: WeatherPattern = truth.pattern
  if (wet >= 0.65) {
    pattern = WeatherPattern.Rain
  } else if (fog >= 0.55) {
    pattern = WeatherPattern.Fog
  } else if (wet >= 0.4 || pattern === WeatherPattern.Rain || pattern === WeatherPattern.Drizzle) {
    pattern = WeatherPattern.Overcast
  } else if (pattern === WeatherPattern.Storm || pattern === WeatherPattern.Fog) {
    pattern = WeatherPattern.Fair
  }
  return {
    day,
    ahead,
    certain: false,
    pattern,
    wet,
    snow: truth.low + warmer < 1 && (truth.snow || truth.high + warmer < 3),
    fog,
    low: truth.low + warmer,
    high: truth.high + warmer,
    windFrom: (truth.windFrom + guess(4) * ERROR_PER_DAY.wind * ahead + 360) % 360,
    windSpeed: truth.windSpeed * (1 + guess(5) * 0.4 * (1 - skill))
  }
}

/** The staff's forecast issued on a day, for it and the days after: `days` in all, the first certain. */
export function forecastFrom(forecast: Forecast, issued: number, days = 7): ForecastDay[] {
  const start = Math.floor(issued / DAY) * DAY
  return Array.from({ length: days }, (_, index) => forecastDay(forecast, start, start + index * DAY))
}
