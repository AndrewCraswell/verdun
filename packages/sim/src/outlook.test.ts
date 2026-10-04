import { describe, expect, it } from "vitest"
import { dayOutlook, forecastDay, forecastFrom, weekOutlook, windFrom } from "./outlook.ts"
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

  it("gives the staff's forecast: exact for the day it's issued, a forecaster's call after", () => {
    const history = createForecast({ kind: "records", seed: 1916 })
    const issued = Date.UTC(1916, 9, 20)
    const days = forecastFrom(history, issued + 5 * 3_600_000, 4)
    expect(days.map((day) => day.ahead)).toEqual([0, 1, 2, 3])
    const [today, tomorrow] = days
    const truth = dayOutlook(history, issued)
    expect(today?.certain).toBe(true)
    expect(today?.low).toBe(truth.low)
    expect(today?.wet === 0 || today?.wet === 1).toBe(true)
    expect(tomorrow?.certain).toBe(false)
    expect(tomorrow?.wet).toBeGreaterThan(0)
    expect(tomorrow?.wet).toBeLessThan(1)
    // The same forecast always reads the same.
    expect(forecastDay(history, issued, issued + 86_400_000)).toEqual(tomorrow)
  })

  it("loses its skill the further ahead it looks, as 1916's forecasts did", () => {
    const history = createForecast({ kind: "records", seed: 1916 })
    const DAY = 86_400_000
    const rightAbout = (ahead: number) => {
      let right = 0
      for (let index = 0; index < 300; index++) {
        const day = Date.UTC(1916, 0, 10) + index * DAY
        const wet = dayOutlook(history, day).precipitation >= 1
        right += forecastDay(history, day - ahead * DAY, day).wet >= 0.5 === wet ? 1 : 0
      }
      return right / 300
    }
    const tomorrow = rightAbout(1)
    const nextWeek = rightAbout(6)
    expect(tomorrow).toBeGreaterThan(0.72)
    expect(nextWeek).toBeLessThan(tomorrow - 0.15)
  })
})
