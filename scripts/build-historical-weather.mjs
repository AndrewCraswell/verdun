// Builds the historical weather at Fleury from the outbreak of war to the armistice, 3-hourly, as the simulation's
// `records` forecast reads it (packages/sim/src/records.ts): packages/sim/data/fleury-weather-1914-1918.json.
//
// Two sources, as docs/research/notes/weather/historical_weather_1916.md recommends:
//
// - NOAA-CIRES-DOE 20th Century Reanalysis v3 (20CRv3), the ensemble mean on its 1° grid, every 3 hours: temperature,
//   humidity, cloud, rain or snow, and wind, interpolated to Fleury. CC-BY 4.0. Support for the Twentieth Century
//   Reanalysis Project version 3 dataset is provided by the U.S. Department of Energy, Office of Science Biological and
//   Environmental Research (BER), by the National Oceanic and Atmospheric Administration Climate Program Office, and by
//   the NOAA Earth System Research Laboratory Physical Sciences Laboratory.
// - Météo-France's daily station records (Licence Ouverte 2.0): the day's lowest and highest temperatures at Metz and
//   Nancy, its rain at Sainte-Menehould, Bar-le-Duc and Metz, and the days snow was seen. They correct the reanalysis,
//   which runs cool on hot days and drizzles almost every day.
//
// Neither records fog; the forecast infers it from humidity, wind and the hour, with overrides for fogs history
// records (FOGS below).
//
// Downloads are cached in .asset-cache/weather/. Usage: pnpm weather:build

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"

/** Writes a line of the report. */
const print = (line) =>
  process.stdout.write(`${line}
`)

const FLEURY = { latitude: 49.1935, longitude: 5.433, elevation: 330 }
/** The table covers the war on the Western Front: 1 August 1914 to 30 November 1918, UTC. */
const START = Date.UTC(1914, 7, 1)
const END = Date.UTC(1918, 11, 1)
const STEP_HOURS = 3
const HOUR = 3_600_000
const DAY = 24 * HOUR
const CACHE = new URL("../.asset-cache/weather/", import.meta.url)
const OUTPUT = new URL("../packages/sim/data/fleury-weather-1914-1918.json", import.meta.url)

const REANALYSIS = "https://psl.noaa.gov/thredds/dodsC/Datasets/20thC_ReanV3"
/** 20CRv3 fields: folder, file stem and variable. */
const FIELDS = {
  air: ["2mSI", "air.2m", "air"],
  rhum: ["2mSI", "rhum.2m", "rhum"],
  tcdc: ["miscSI", "tcdc.eatm", "tcdc"],
  prate: ["sfcSI", "prate", "prate"],
  cpofp: ["sfcSI", "cpofp", "cpofp"],
  uwnd: ["10mSI", "uwnd.10m", "uwnd"],
  vwnd: ["10mSI", "vwnd.10m", "vwnd"]
}
/** Grid rows and columns around Fleury: latitude 49° and 50° N (rows 139, 140), longitude 5° and 6° E (5, 6). */
const ROWS = [139, 140]
const COLUMNS = [5, 6]
const FRACTION = { north: FLEURY.latitude - 49, east: FLEURY.longitude - 5 }

const STATIONS_URL = "https://meteofrance.s3.sbg.io.cloud.ovh.net/data/synchro_ftp/BASE/QUOT"
/** Stations by department: their daily temperatures, rain, and days of snow. */
const TEMPERATURE_STATIONS = ["57463001", "54395003"] // Metz-Les Récollets, Nancy-Faculté
const RAIN_STATIONS = ["51507002", "55029001", "57463001"] // Sainte-Menehould, Bar-le-Duc, Metz
const SNOW_STATIONS = ["51507002", "55029001", "55150001", "51272001"]
const DEPARTMENTS = ["51", "54", "55", "57"]
/** Temperature falls this much per metre of height: Fleury stands higher than Metz or Nancy. */
const LAPSE = 0.0065
/** The wind at a man's height is about three quarters of the 10 m wind. */
const NEAR_GROUND = 0.75

/**
 * Fogs history records, which neither source has: [first hour, last hour (UTC), visibility in metres]. The French
 * attack that retook Fort Douaumont went in under thick fog that lifted about 14:00.
 */
const FOGS = [[Date.UTC(1916, 9, 24, 0), Date.UTC(1916, 9, 24, 13), 100]]

async function cached(name, fetchIt) {
  const file = new URL(name, CACHE)
  if (existsSync(file)) {
    return readFile(file)
  }
  const data = await fetchIt()
  await mkdir(CACHE, { recursive: true })
  await writeFile(file, data)
  return data
}

/** Downloads a URL, retrying a few times: NOAA's server is slow and sometimes drops connections under load. */
async function download(url) {
  for (let attempt = 1; ; attempt++) {
    let failure
    try {
      const response = await fetch(url)
      if (response.ok) {
        return Buffer.from(await response.arrayBuffer())
      }
      failure = `HTTP ${response.status}`
    } catch (error) {
      failure = error instanceof Error ? (error.cause?.code ?? error.message) : String(error)
    }
    if (attempt >= 6) {
      throw new Error(`${url}: ${failure}`)
    }
    print(`retrying (${failure}) ${url.split("?")[0]}`)
    await new Promise((resolve) => setTimeout(resolve, 10_000 * attempt))
  }
}

/** One 20CRv3 field for one year at the four grid points round Fleury: { times (UTC ms), values [t][row][column] }. */
async function reanalysisYear(key, year) {
  const [folder, stem, variable] = FIELDS[key]
  const file = `${REANALYSIS}/${folder}/${stem}.${year}.nc`
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY
  const steps = days * 8
  const values = Array.from({ length: steps }, () => [
    [NaN, NaN],
    [NaN, NaN]
  ])
  // A year at once outlasts the server's gateway; a quarter at a time doesn't. A year already cached whole is used.
  const whole = `${stem}.${year}.txt`
  const chunks = existsSync(new URL(whole, CACHE))
    ? [{ from: 0, to: steps - 1, name: whole }]
    : quarters(stem, year, steps)
  for (const { from, to, name } of chunks) {
    const slice = `%5B${from}:1:${to}%5D%5B${ROWS[0]}:1:${ROWS[1]}%5D%5B${COLUMNS[0]}:1:${COLUMNS[1]}%5D`
    const text = (await cached(name, () => download(`${file}.ascii?${variable}${slice}`))).toString()
    for (const line of text.split("\n")) {
      const match = /^\[(\d+)\]\[(\d+)\],\s*(.+)$/.exec(line.trim())
      if (match) {
        const [a, b] = match[3].split(",").map(Number)
        values[from + Number(match[1])][Number(match[2])] = [a, b].map((value) =>
          Math.abs(value) > 1e30 ? NaN : value
        )
      }
    }
  }
  return { start: Date.UTC(year, 0, 1), values }
}

/** A year's steps in four requests, each cached on its own. */
function quarters(stem, year, steps) {
  const size = Math.ceil(steps / 4)
  return [0, 1, 2, 3].map((quarter) => ({
    from: quarter * size,
    to: Math.min(steps, (quarter + 1) * size) - 1,
    name: `${stem}.${year}.q${quarter + 1}.txt`
  }))
}

/** Bilinear interpolation to Fleury from the four grid points. */
function atFleury([[southWest, southEast], [northWest, northEast]]) {
  const south = southWest + (southEast - southWest) * FRACTION.east
  const north = northWest + (northEast - northWest) * FRACTION.east
  return south + (north - south) * FRACTION.north
}

/** NOAA's server takes minutes over each year of a field, so several are fetched at once. */
const PARALLEL = 3

async function reanalysis() {
  const jobs = Object.keys(FIELDS).flatMap((key) => [1914, 1915, 1916, 1917, 1918].map((year) => ({ key, year })))
  const results = Array.from({ length: jobs.length })
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++
      const { key, year } = jobs[index]
      results[index] = await reanalysisYear(key, year)
      print(`20CRv3 ${key} ${year}: ${results[index].values.length} steps`)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  const series = Object.fromEntries(Object.keys(FIELDS).map((key) => [key, new Map()]))
  jobs.forEach(({ key }, index) => {
    const { start, values } = results[index]
    values.forEach((grid, step) => series[key].set(start + step * STEP_HOURS * HOUR, atFleury(grid)))
  })
  return series
}

/** Parses a Météo-France daily CSV: rows for the wanted stations, by station and day (UTC ms of the date). */
function parseStations(csv, wanted, columns) {
  const lines = csv.split("\n")
  const header = lines[0].split(";")
  const index = Object.fromEntries(columns.map((name) => [name, header.indexOf(name)]))
  const rows = new Map()
  for (const line of lines.slice(1)) {
    const cells = line.split(";")
    if (!wanted.includes(cells[0])) {
      continue
    }
    const date = cells[5]
    const year = Number(date.slice(0, 4))
    if (year < 1914 || year > 1918) {
      continue
    }
    const day = Date.UTC(year, Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)))
    const values = Object.fromEntries(
      columns.map((name) => [name, cells[index[name]] === "" ? NaN : Number(cells[index[name]])])
    )
    rows.set(`${cells[0]} ${day}`, { ...values, altitude: Number(cells[4]) })
  }
  return rows
}

async function stations() {
  const daily = new Map()
  const snow = new Map()
  for (const department of DEPARTMENTS) {
    const main = gunzipSync(
      await cached(`Q_${department}.csv.gz`, () =>
        download(`${STATIONS_URL}/Q_${department}_avant-1949_RR-T-Vent.csv.gz`)
      )
    ).toString()
    for (const [key, value] of parseStations(main, [...TEMPERATURE_STATIONS, ...RAIN_STATIONS], ["RR", "TN", "TX"])) {
      daily.set(key, value)
    }
    const other = gunzipSync(
      await cached(`A_${department}.csv.gz`, () =>
        download(`${STATIONS_URL}/Q_${department}_avant-1949_autres-parametres.csv.gz`)
      )
    ).toString()
    for (const [key, value] of parseStations(other, SNOW_STATIONS, ["NEIG"])) {
      snow.set(key, value)
    }
  }
  print(`Météo-France: ${daily.size} station-days of rain and temperature, ${snow.size} of snow flags`)
  return { daily, snow }
}

function mean(values) {
  const known = values.filter((value) => Number.isFinite(value))
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) / known.length : NaN
}

/** The day's lowest and highest temperatures at Fleury from the stations, corrected for height, or NaN. */
function stationTemperatures(daily, day) {
  const lows = []
  const highs = []
  for (const station of TEMPERATURE_STATIONS) {
    const row = daily.get(`${station} ${day}`)
    if (row) {
      const lapse = LAPSE * (FLEURY.elevation - row.altitude)
      lows.push(row.TN - lapse)
      highs.push(row.TX - lapse)
    }
  }
  return { low: mean(lows), high: mean(highs) }
}

/** Rain from 06:00 UTC that day to 06:00 the next, in mm, as French stations measure it. */
function stationRain(daily, day) {
  return mean(RAIN_STATIONS.map((station) => daily.get(`${station} ${day}`)?.RR))
}

function sawSnow(snow, day) {
  return SNOW_STATIONS.some((station) => snow.get(`${station} ${day}`)?.NEIG === 1)
}

async function build() {
  const series = await reanalysis()
  const { daily, snow } = await stations()
  const times = []
  for (let time = START; time < END; time += STEP_HOURS * HOUR) {
    times.push(time)
  }
  const field = (key, time) => series[key].get(time) ?? NaN
  const temperature = times.map((time) => field("air", time) - 273.15)
  const precipitation = times.map((time) => Math.max(0, field("prate", time) * 3600))

  // Stretch each day's temperatures to the stations' lowest and highest.
  let stretched = 0
  for (let day = START; day < END; day += DAY) {
    const { low, high } = stationTemperatures(daily, day)
    const steps = times.flatMap((time, index) => (time >= day && time < day + DAY ? [index] : []))
    const values = steps.map((index) => temperature[index])
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (Number.isFinite(low) && Number.isFinite(high) && high > low && max > min) {
      steps.forEach((index) => {
        temperature[index] = low + ((temperature[index] - min) / (max - min)) * (high - low)
      })
      stretched++
    }
  }

  // Rain: none on days the stations stayed dry, and the stations' totals on days they didn't.
  let corrected = 0
  for (let day = START; day < END; day += DAY) {
    const total = stationRain(daily, day)
    if (!Number.isFinite(total)) {
      continue
    }
    const steps = times.flatMap((time, index) => (time >= day + 6 * HOUR && time < day + 30 * HOUR ? [index] : []))
    const modelled = steps.reduce((sum, index) => sum + precipitation[index] * STEP_HOURS, 0)
    steps.forEach((index) => {
      if (total < 0.1) {
        precipitation[index] = 0
      } else if (modelled > 0.01) {
        precipitation[index] *= total / modelled
      } else {
        precipitation[index] = total / (steps.length * STEP_HOURS)
      }
    })
    corrected++
  }

  const snowFraction = times.map((time, index) => {
    const frozen = field("cpofp", time)
    const byTemperature = Math.min(1, Math.max(0, (1.5 - temperature[index]) / 1.5))
    const fromModel = Number.isFinite(frozen) && frozen >= 0 ? frozen / 100 : byTemperature
    const day = Math.floor(time / DAY) * DAY
    return sawSnow(snow, day) && temperature[index] < 2 ? Math.max(fromModel, byTemperature, 0.5) : fromModel
  })

  const round = (value, scale) => (Number.isFinite(value) ? Math.round(value * scale) : 0)
  const table = {
    source:
      "NOAA-CIRES-DOE 20th Century Reanalysis v3 (CC-BY 4.0) corrected with Météo-France daily station records " +
      "(Licence Ouverte 2.0); built by scripts/build-historical-weather.mjs",
    location: FLEURY,
    start: START,
    stepHours: STEP_HOURS,
    temperature: temperature.map((value) => round(value, 10)),
    cloud: times.map((time) => round(field("tcdc", time), 1)),
    precipitation: precipitation.map((value) => round(value, 100)),
    snow: snowFraction.map((value) => round(value, 100)),
    windX: times.map((time) => round(field("uwnd", time) * NEAR_GROUND, 10)),
    windZ: times.map((time) => round(field("vwnd", time) * NEAR_GROUND, 10)),
    humidity: times.map((time) => round(field("rhum", time), 1)),
    fogs: FOGS
  }
  await writeFile(OUTPUT, `${JSON.stringify(table)}\n`)
  const total = precipitation.reduce((sum, value) => sum + value * STEP_HOURS, 0) / ((END - START) / (365.25 * DAY))
  print(`${times.length} steps, ${stretched} days' temperatures and ${corrected} days' rain from the stations`)
  print(`About ${Math.round(total)} mm of rain a year; written ${OUTPUT.pathname}`)
}

await build()
