import { describe, expect, it } from "vitest"
import { createRecordsForecast, loadWeatherRegion, WEATHER_REGIONS, type WeatherRecords } from "./records.ts"
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

  it("lays snow on the ground the Germans crossed on 21 February 1916", () => {
    expect(history.at(Date.UTC(1916, 1, 21, 7)).snowCover).toBeGreaterThan(2)
  })

  it("brings the fog the Meuse-Argonne offensive opened in, 26 September 1918", () => {
    expect(history.at(Date.UTC(1918, 8, 26, 4, 30)).visibility).toBeLessThanOrEqual(80)
    expect(history.at(Date.UTC(1918, 8, 26, 14)).visibility).toBeGreaterThan(1000)
  })

  it("matches the war's other documented days at Verdun", () => {
    // The great frost of February 1917, the coldest of the war.
    expect(history.at(Date.UTC(1917, 1, 3, 6)).temperature).toBeLessThan(-8)
    // The clear, starlit night before the attack on the Mort-Homme, 20 August 1917.
    expect(history.at(Date.UTC(1917, 7, 20, 2)).cloudCover).toBeLessThan(0.5)
    // Saint-Mihiel, 12 September 1918: rain after days of it, the roads deep in mud.
    const stMihiel = history.at(Date.UTC(1918, 8, 12, 4))
    expect(stMihiel.precipitation).toBeGreaterThan(0.3)
    expect(stMihiel.wetness).toBeGreaterThan(0.8)
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

describe("history's weather elsewhere on the front", () => {
  const day = (region: (typeof WEATHER_REGIONS)[number], utc: number) => {
    const history = createForecast({ kind: "records", seed: 1916, region })
    return Array.from({ length: 8 }, (_, step) => history.at(utc + step * 3 * HOUR))
  }

  it("loads each region once asked, and refuses one that isn't loaded", async () => {
    expect(() => createForecast({ kind: "records", seed: 1, region: "somme" })).toThrow(/loadWeatherRegion/)
    for (const region of WEATHER_REGIONS) {
      await loadWeatherRegion(region)
    }
    expect(
      createForecast({ kind: "records", seed: 1, region: "somme" }).at(Date.UTC(1916, 6, 1)).temperature
    ).toBeGreaterThan(0)
  })

  it("matches the documented days of the war's other battles", async () => {
    for (const region of WEATHER_REGIONS) {
      await loadWeatherRegion(region)
    }
    // The first day of the Somme, 1 July 1916: fine and hot, 26 °C, no rain (Gliddon). The nearest stations that kept
    // records through the war are over 100 km off, at Gisors and Paris, and make it a warm day of about 21 °C.
    const somme = day("somme", Date.UTC(1916, 6, 1))
    expect(Math.max(...somme.map((weather) => weather.temperature))).toBeGreaterThan(20)
    expect(somme.every((weather) => weather.precipitation === 0)).toBe(true)
    // Arras, 9 April 1917: snow and sleet squalls as the attack went in at 05:30.
    const arras = createForecast({ kind: "records", seed: 1916, region: "artois" }).at(Date.UTC(1917, 3, 9, 5))
    expect(arras.snowFraction * arras.precipitation).toBeGreaterThan(0.5)
    // Vimy, 9 May 1915: bright and dry.
    expect(day("artois", Date.UTC(1915, 4, 9)).every((weather) => weather.precipitation === 0)).toBe(true)
    // The Chemin des Dames, 16 April 1917: dawn misty and overcast.
    const nivelle = createForecast({ kind: "records", seed: 1916, region: "aisne" }).at(Date.UTC(1917, 3, 16, 5))
    expect(nivelle.visibility).toBeLessThanOrEqual(800)
    // The Aisne, 12 September 1914: torrents of rain.
    const aisne = createForecast({ kind: "records", seed: 1916, region: "aisne" }).at(Date.UTC(1914, 8, 12, 12))
    expect(aisne.precipitation).toBeGreaterThan(2)
    // Champagne, 25 September 1915: heavy rain from the night until noon.
    const champagne = createForecast({ kind: "records", seed: 1916, region: "champagne" }).at(Date.UTC(1915, 8, 25, 6))
    expect(champagne.precipitation).toBeGreaterThan(0.3)
  })
})
