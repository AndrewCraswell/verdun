import { describe, expect, it } from "vitest"
import { blendWeather, createForecast, typicalWeather, type Weather, WeatherPattern } from "./weather.ts"

const HOUR = 3_600_000

/** A month of hourly weather from a cycle. */
function month(seed: number, monthIndex: number): Weather[] {
  const forecast = createForecast({ kind: "cycle", seed })
  return Array.from({ length: 30 * 24 }, (_, hour) => forecast.at(Date.UTC(1916, monthIndex, 1) + hour * HOUR))
}

describe("a cycling forecast", () => {
  it("gives the same weather for the same seed and moment, however it is asked", () => {
    const moment = Date.UTC(1916, 5, 23, 6)
    const later = createForecast({ kind: "cycle", seed: 4 })
    later.at(Date.UTC(1916, 8, 1))
    expect(later.at(moment)).toEqual(createForecast({ kind: "cycle", seed: 4 }).at(moment))
    expect(createForecast({ kind: "cycle", seed: 5 }).at(moment)).not.toEqual(later.at(moment))
  })

  it("holds each spell for hours and changes smoothly", () => {
    const hours = month(1916, 5)
    const changes = hours.filter((weather, hour) => hour > 0 && weather.pattern !== hours[hour - 1]!.pattern).length
    expect(changes).toBeGreaterThan(10)
    expect(changes).toBeLessThan(80)
    // A front takes an hour or two to arrive: no jumps from one ten minutes to the next.
    const forecast = createForecast({ kind: "cycle", seed: 1916 })
    const start = Date.UTC(1916, 5, 1)
    for (let step = 1; step < 6 * 24 * 10; step++) {
      const before = forecast.at(start + ((step - 1) * HOUR) / 6)
      const after = forecast.at(start + (step * HOUR) / 6)
      expect(Math.abs(after.cloudCover - before.cloudCover)).toBeLessThan(0.2)
    }
  })

  it("brings thunderstorms in summer and fog and snow in winter", () => {
    const summer = [5, 6, 7].flatMap((index) => month(1916, index))
    const winter = [0, 1, 11].flatMap((index) => month(1916, index))
    const count = (weathers: Weather[], test: (weather: Weather) => boolean) => weathers.filter(test).length
    expect(count(summer, (weather) => weather.pattern === WeatherPattern.Storm)).toBeGreaterThan(0)
    expect(count(winter, (weather) => weather.pattern === WeatherPattern.Storm)).toBe(0)
    expect(count(winter, (weather) => weather.pattern === WeatherPattern.Fog)).toBeGreaterThan(
      count(summer, (weather) => weather.pattern === WeatherPattern.Fog)
    )
    expect(count(winter, (weather) => weather.precipitation > 0 && weather.snowFraction > 0.5)).toBeGreaterThan(0)
    expect(count(summer, (weather) => weather.snowFraction > 0)).toBe(0)
  })

  it("keeps to the Verdun climate: about a metre of rain a year, westerly winds, cold winters, warm summers", () => {
    const year = Array.from({ length: 12 }, (_, index) => month(1916, index)).flat()
    const rain = year.reduce((sum, weather) => sum + weather.precipitation, 0)
    expect(rain).toBeGreaterThan(700)
    expect(rain).toBeLessThan(1300)
    expect(year.reduce((sum, weather) => sum + weather.wind.x, 0) / year.length).toBeGreaterThan(0.5)
    const temperatures = year.map((weather) => weather.temperature)
    expect(Math.min(...temperatures)).toBeGreaterThan(-15)
    expect(Math.max(...temperatures)).toBeLessThan(35)
    const mean = (weathers: Weather[]) =>
      weathers.reduce((sum, weather) => sum + weather.temperature, 0) / weathers.length
    expect(mean(month(1916, 6)) - mean(month(1916, 0))).toBeGreaterThan(10)
  })

  it("is coldest before dawn and warmest in the afternoon", () => {
    const forecast = createForecast({ kind: "cycle", seed: 2 })
    let colder = 0
    for (let day = 0; day < 30; day++) {
      const dawn = forecast.at(Date.UTC(1916, 6, 1 + day, 3))
      const afternoon = forecast.at(Date.UTC(1916, 6, 1 + day, 14))
      colder += dawn.temperature < afternoon.temperature ? 1 : 0
    }
    expect(colder).toBeGreaterThan(24)
  })

  it("lays morning fog in the hollows of autumn, gone by the afternoon", () => {
    const forecast = createForecast({ kind: "cycle", seed: 1916 })
    let foggyMornings = 0
    let foggyAfternoons = 0
    for (let day = 0; day < 60; day++) {
      foggyMornings += forecast.at(Date.UTC(1916, 9, 1 + day, 6)).visibility < 1000 ? 1 : 0
      const afternoon = forecast.at(Date.UTC(1916, 9, 1 + day, 14))
      foggyAfternoons += afternoon.visibility < 1000 && afternoon.pattern !== WeatherPattern.Fog ? 1 : 0
    }
    expect(foggyMornings).toBeGreaterThan(3)
    expect(foggyAfternoons).toBe(0)
  })

  it("wets the ground after rain and dries it after", () => {
    const hours = Array.from({ length: 12 }, (_, index) => month(1916, index)).flat()
    const wettest = hours.reduce((best, weather) => (weather.wetness > best.wetness ? weather : best))
    const driest = hours.reduce((best, weather) => (weather.wetness < best.wetness ? weather : best))
    expect(wettest.wetness).toBeGreaterThan(0.8)
    expect(driest.wetness).toBeLessThan(0.2)
  })
})

describe("the whole war", () => {
  it("has its own weather in every year from the invasion of Belgium to the armistice", () => {
    const forecast = createForecast({ kind: "cycle", seed: 1916 })
    for (const start of [Date.UTC(1914, 7, 4), Date.UTC(1918, 10, 1)]) {
      const days = Array.from({ length: 10 }, (_, day) => forecast.at(start + day * 24 * HOUR))
      expect(new Set(days.map((weather) => weather.pattern)).size).toBeGreaterThan(1)
    }
  })

  it("blends one weather into another, fog thinning on a log scale", () => {
    const fog = typicalWeather(WeatherPattern.Fog, { x: 0, z: 0 })
    const rain = typicalWeather(WeatherPattern.Rain, { x: 4, z: 0 })
    for (const [t, end] of [
      [0, fog],
      [1, rain]
    ] as const) {
      const blended = blendWeather(fog, rain, t)
      expect(blended.pattern).toBe(end.pattern)
      expect(blended.cloudCover).toBe(end.cloudCover)
      expect(blended.visibility).toBeCloseTo(end.visibility)
    }
    const half = blendWeather(fog, rain, 0.5)
    expect(half.pattern).toBe(WeatherPattern.Rain)
    expect(half.wind.x).toBe(2)
    expect(half.visibility).toBeCloseTo(Math.sqrt(fog.visibility * rain.visibility))
  })
})

describe("a steady forecast", () => {
  it("holds one weather at every moment", () => {
    const rain = typicalWeather(WeatherPattern.Rain, { x: 3, z: 1 })
    const forecast = createForecast({ kind: "steady", weather: rain })
    expect(forecast.at(0)).toEqual(rain)
    expect(forecast.at(Date.UTC(1916, 1, 21))).toEqual(rain)
    expect(rain.precipitation).toBeGreaterThan(0)
    expect(rain.wetness).toBeGreaterThan(typicalWeather(WeatherPattern.Clear, { x: 0, z: 0 }).wetness)
  })
})
