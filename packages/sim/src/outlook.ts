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

/** The weather to come, day by day: the week a daily turn will fight in, from `from` (00:00 UTC on its first day). */
export function weekOutlook(forecast: Forecast, from: number, days = 7): DayOutlook[] {
  const start = Math.floor(from / DAY) * DAY
  return Array.from({ length: days }, (_, index) => dayOutlook(forecast, start + index * DAY))
}
