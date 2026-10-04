import { type ForecastDay, WeatherPattern } from "@verdun/sim"

const DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const
const SKY: Readonly<Record<WeatherPattern, string>> = {
  [WeatherPattern.Clear]: "clear",
  [WeatherPattern.Fair]: "fair",
  [WeatherPattern.Overcast]: "overcast",
  [WeatherPattern.Fog]: "fog",
  [WeatherPattern.Drizzle]: "drizzle",
  [WeatherPattern.Rain]: "rain",
  [WeatherPattern.Storm]: "thunderstorms"
}

const compass = (degrees: number) => COMPASS[Math.round(degrees / 45) % 8]

/** The chance of rain or snow as a forecaster words it. */
function wetness(day: ForecastDay): string {
  const fall = day.snow ? "snow" : "rain"
  if (day.wet >= 0.65) {
    return `${fall} likely`
  }
  if (day.wet >= 0.4) {
    return day.snow ? "a chance of snow" : "showers possible"
  }
  return day.pattern === WeatherPattern.Overcast ? "dull, dry" : `${SKY[day.pattern]}, dry`
}

/**
 * A day of the staff's forecast as the communiqué gives it. The day it's issued, for certain: "Tue 27 Jun: rain, 11–17 °C,
 * fog at times, wind W 4 m/s". The days after, a forecaster's call, rounded and hedged: "Wed 28 Jun: rain likely,
 * about 10–18 °C, fog possible, wind W".
 */
export function forecastLabel(day: ForecastDay): string {
  const date = DATE.format(day.day)
  if (day.certain) {
    const sky = day.snow ? "snow" : SKY[day.pattern]
    const fog = day.fog >= 0.5 && day.pattern !== WeatherPattern.Fog ? ", fog at times" : ""
    return (
      `${date}: ${sky}, ${Math.round(day.low)}–${Math.round(day.high)} °C${fog}, ` +
      `wind ${compass(day.windFrom)} ${Math.round(day.windSpeed)} m/s`
    )
  }
  // Rounded to two degrees and widened a little: a forecaster commits to no more than that.
  const low = Math.floor(day.low / 2) * 2
  const high = Math.ceil(day.high / 2) * 2
  let fog = ""
  if (day.fog >= 0.55) {
    fog = ", fog likely"
  } else if (day.fog >= 0.3) {
    fog = ", fog possible"
  }
  // Below freezing a dash reads as a minus sign: "−6 to 2 °C".
  const range = low < 0 ? `${String(low).replace("-", "−")} to ${high}` : `${low}–${high}`
  return `${date}: ${wetness(day)}, about ${range} °C${fog}, wind ${compass(day.windFrom)}`
}
