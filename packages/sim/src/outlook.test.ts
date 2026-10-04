import { describe, expect, it } from "vitest"
import { dayOutlook, weekOutlook, windFrom } from "./outlook.ts"
import { createForecast, typicalWeather, WeatherPattern } from "./weather.ts"

describe("the weather to come", () => {
  it("names the winds by where they blow from", () => {
    expect(windFrom({ x: 3, z: 0 })).toBeCloseTo(270)
    expect(windFrom({ x: 0, z: -3 })).toBeCloseTo(0)
    expect(windFrom({ x: -2, z: 0 })).toBeCloseTo(90)
  })

  it("sums up a held day: its pattern, temperatures, rain, and wind", () => {
    const rain = createForecast({ kind: "steady", weather: typicalWeather(WeatherPattern.Rain, { x: 4, z: 0 }) })
    const day = dayOutlook(rain, Date.UTC(1916, 5, 23))
    expect(day.pattern).toBe(WeatherPattern.Rain)
    expect(day.precipitation).toBeCloseTo(24)
    expect(day.snow).toBe(false)
    expect(day.windFrom).toBeCloseTo(270)
    expect(day.windSpeed).toBeCloseTo(4)
  })

  it("gives history's week: the fog the French took Douaumont under, and the rain", () => {
    const history = createForecast({ kind: "records", seed: 1916 })
    const week = weekOutlook(history, Date.UTC(1916, 9, 24, 15))
    expect(week).toHaveLength(7)
    expect(week[0]!.day).toBe(Date.UTC(1916, 9, 24))
    expect(week[0]!.fog).toBe(true)
    expect(week[0]!.precipitation).toBeGreaterThan(2)
    expect(week[0]!.high).toBeGreaterThan(week[0]!.low)
  })
})
