import { type ForecastDay, WeatherPattern } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { forecastLabel } from "./forecast-label.ts"

const today: ForecastDay = {
  day: Date.UTC(1916, 5, 27),
  ahead: 0,
  certain: true,
  pattern: WeatherPattern.Rain,
  wet: 1,
  snow: false,
  fog: 1,
  low: 10.6,
  high: 17.2,
  windFrom: 265,
  windSpeed: 4.2
}

describe("the communiqué's forecast", () => {
  it("gives today's weather exactly", () => {
    expect(forecastLabel(today)).toBe("Tue 27 Jun: rain, 11–17 °C, fog at times, wind W 4 m/s")
  })

  it("hedges the days after: chances in words, temperatures widened to even degrees, no wind speed", () => {
    const later = { ...today, day: Date.UTC(1916, 5, 28), ahead: 1, certain: false, wet: 0.7, fog: 0.35 }
    expect(forecastLabel(later)).toBe("Wed 28 Jun: rain likely, about 10–18 °C, fog possible, wind W")
    expect(forecastLabel({ ...later, wet: 0.45, fog: 0.6 })).toBe(
      "Wed 28 Jun: showers possible, about 10–18 °C, fog likely, wind W"
    )
    expect(forecastLabel({ ...later, wet: 0.1, fog: 0, pattern: WeatherPattern.Fair })).toBe(
      "Wed 28 Jun: fair, dry, about 10–18 °C, wind W"
    )
    expect(forecastLabel({ ...later, wet: 0.8, snow: true, low: -4.5, high: 0.4, fog: 0 })).toBe(
      "Wed 28 Jun: snow likely, about −6 to 2 °C, wind W"
    )
  })
})
