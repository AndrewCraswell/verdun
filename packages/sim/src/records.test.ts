import { describe, expect, it } from "vitest"
import { createRecordsForecast, type WeatherRecords } from "./records.ts"
import { createForecast, WeatherPattern } from "./weather.ts"

const HOUR = 3_600_000
const START = Date.UTC(1916, 9, 20)

/** Five days of made-up records, 3-hourly: mild and damp, a wet day in the middle, then still and foggy. */
function synthetic(): WeatherRecords {
  const steps = 5 * 8
  const each = (value: (step: number) => number) => Array.from({ length: steps }, (_, step) => value(step))
  return {
    start: START,
    stepHours: 3,
    temperature: each((step) => 100 + (step % 8) * 10),
    cloud: each((step) => (step < 16 ? 50 : 100)),
    precipitation: each((step) => (step >= 16 && step < 24 ? 200 : 0)),
    snow: each(() => 0),
    windX: each((step) => (step < 32 ? 40 : 0)),
    windZ: each(() => 0),
    humidity: each((step) => (step < 32 ? 70 : 99)),
    fogs: [[START + 3 * 24 * HOUR + 12 * HOUR, START + 3 * 24 * HOUR + 15 * HOUR, 100]]
  }
}

describe("a forecast from records", () => {
  const forecast = createRecordsForecast({ kind: "records", seed: 1 }, synthetic())

  it("interpolates temperature, cloud and wind between the 3-hourly records", () => {
    const halfway = forecast.at(START + 1.5 * HOUR)
    expect(halfway.temperature).toBeCloseTo(10.5)
    expect(halfway.cloudCover).toBeCloseTo(0.5)
    expect(Math.sqrt(halfway.wind.x ** 2 + halfway.wind.z ** 2)).toBeGreaterThan(2.5)
  })

  it("rains when history rained, and wets the ground after", () => {
    const raining = forecast.at(START + 2 * 24 * HOUR + 6 * HOUR)
    expect(raining.precipitation).toBeGreaterThan(0.9)
    expect(raining.pattern).toBe(WeatherPattern.Rain)
    const before = forecast.at(START + 2 * 24 * HOUR - HOUR)
    const after = forecast.at(START + 3 * 24 * HOUR + 3 * HOUR)
    expect(after.wetness).toBeGreaterThan(before.wetness + 0.3)
  })

  it("lays fog in still, damp air before dawn, and where history recorded one", () => {
    const dawn = forecast.at(START + 4 * 24 * HOUR + 5 * HOUR)
    expect(dawn.visibility).toBeLessThan(1000)
    expect(dawn.pattern).toBe(WeatherPattern.Fog)
    const recorded = forecast.at(START + 3 * 24 * HOUR + 13 * HOUR)
    expect(recorded.visibility).toBe(100)
  })

  it("plays the cycle from the same seed outside the records", () => {
    const outside = Date.UTC(1920, 5, 1)
    expect(forecast.at(outside)).toEqual(createForecast({ kind: "cycle", seed: 1 }).at(outside))
  })
})

describe("history's weather at Fleury", () => {
  const history = createForecast({ kind: "records", seed: 1916 })

  it("covers the war, with snow at the opening of Verdun and a hot June", () => {
    const february = Array.from({ length: 10 * 8 }, (_, step) => history.at(Date.UTC(1916, 1, 20) + step * 3 * HOUR))
    expect(february.some((weather) => weather.snowFraction > 0.5 && weather.precipitation > 0)).toBe(true)
    const june = Array.from({ length: 10 }, (_, day) => history.at(Date.UTC(1916, 5, 20 + day, 14)))
    expect(Math.max(...june.map((weather) => weather.temperature))).toBeGreaterThan(22)
  })

  it("brings the fog the French attacked Douaumont under, lifting in the afternoon", () => {
    expect(history.at(Date.UTC(1916, 9, 24, 10)).visibility).toBeLessThanOrEqual(100)
    expect(history.at(Date.UTC(1916, 9, 24, 16)).visibility).toBeGreaterThan(1000)
  })

  it("rains about as much a year as Verdun does", () => {
    let total = 0
    for (let step = 0; step < 365 * 8; step++) {
      total += history.at(Date.UTC(1916, 0, 1) + step * 3 * HOUR).precipitation * 3
    }
    expect(total).toBeGreaterThan(600)
    expect(total).toBeLessThan(1300)
  })
})
