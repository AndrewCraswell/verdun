// Builds the historical weather of the Western Front's battle regions from the outbreak of war to the armistice,
// 3-hourly, as the simulation's `records` forecast reads it (packages/sim/src/records.ts): one table a region, in
// packages/sim/data/<region>-weather-1914-1918.json.
//
// Two sources, as docs/research/notes/weather/historical_weather_1916.md recommends:
//
// - NOAA-CIRES-DOE 20th Century Reanalysis v3 (20CRv3), the ensemble mean on its 1° grid, every 3 hours: temperature,
//   humidity, cloud, rain or snow, and wind, interpolated to the region's place. CC-BY 4.0. Support for the Twentieth
//   Century Reanalysis Project version 3 dataset is provided by the U.S. Department of Energy, Office of Science
//   Biological and Environmental Research (BER), by the National Oceanic and Atmospheric Administration Climate Program
//   Office, and by the NOAA Earth System Research Laboratory Physical Sciences Laboratory.
// - Météo-France's daily station records (Licence Ouverte 2.0): the day's lowest and highest temperatures, its rain,
//   and the days snow was seen, at stations near the region. They correct the reanalysis, which runs cool on hot days
//   and drizzles almost every day. Fleury's stations were chosen by hand; other regions take the nearest stations with
//   most of the war's days recorded, since many near the front fell silent or behind German lines.
//
// Neither records fog; the forecast infers it from humidity, wind and the hour, with overrides for fogs and snowfalls
// history records (each region's `fogs` and `snows`).
//
// Downloads are cached in .asset-cache/weather/. Usage: pnpm weather:build [--region somme]

import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { gunzipSync } from "node:zlib"

/** Writes a line of the report. */
const print = (line) => process.stdout.write(`${line}\n`)

/** The table covers the war on the Western Front: 1 August 1914 to 30 November 1918, UTC. */
const START = Date.UTC(1914, 7, 1)
const END = Date.UTC(1918, 11, 1)
const STEP_HOURS = 3
const HOUR = 3_600_000
const DAY = 24 * HOUR
const YEARS = [1914, 1915, 1916, 1917, 1918]
const CACHE = new URL("../.asset-cache/weather/", import.meta.url)
const DATA = new URL("../packages/sim/data/", import.meta.url)

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
/**
 * Boxes of the 1° grid fetched from NOAA: rows are latitude + 90, columns degrees east. Fleury's 2×2 box round 49–50° N,
 * 5–6° E was fetched first and keeps its cache; the wide box covers the other regions, from Artois to Champagne.
 */
const BOXES = {
  fleury: { rows: [139, 140], columns: [5, 6], suffix: "" },
  wide: { rows: [139, 141], columns: [2, 5], suffix: ".wide" }
}

const STATIONS_URL = "https://meteofrance.s3.sbg.io.cloud.ovh.net/data/synchro_ftp/BASE/QUOT"

/**
 * The regions, each with its place (latitude, longitude, height in metres), its grid box, the departments its stations
 * are drawn from, any stations chosen by hand (by measure; the rest are chosen by coverage), and the weather history
 * records that the sources miss, each [first hour, last hour (UTC), value]:
 * - `fogs`, visibility in metres;
 * - `snows` and `rains`, millimetres of water an hour at least;
 * - `clears`, dry and mostly clear (the value unused).
 * Each is sourced in docs/research/notes/weather/historical_weather_1916.md.
 */
const REGIONS = {
  // Verdun: the right bank's sectors, the left bank, the Argonne and Les Éparges all lie within its grid cell.
  fleury: {
    place: { latitude: 49.1935, longitude: 5.433, elevation: 330 },
    box: "fleury",
    departments: ["51", "54", "55", "57"],
    stations: {
      temperature: ["57463001", "54395003"], // Metz-Les Récollets, Nancy-Faculté
      rain: ["51507002", "55029001", "57463001"], // Sainte-Menehould, Bar-le-Duc, Metz
      snow: ["51507002", "55029001", "55150001", "51272001"]
    },
    fogs: [
      // 24 October 1916: the French retook Fort Douaumont under thick fog that a strengthening wind cleared toward 14:00.
      [Date.UTC(1916, 9, 24, 0), Date.UTC(1916, 9, 24, 13), 100],
      // 26 September 1918: the Meuse-Argonne offensive, 25 km west, opened at 05:30 in heavy fog through the morning.
      [Date.UTC(1918, 8, 26, 0), Date.UTC(1918, 8, 26, 9), 80]
    ],
    // 21 February 1916: the Germans advanced on Verdun over snow-covered ground after a week of blizzards.
    snows: [[Date.UTC(1916, 1, 20, 16), Date.UTC(1916, 1, 21, 4), 0.5]],
    rains: [],
    clears: []
  },
  // Champagne: Souain and Perthes, the offensives of 1915.
  champagne: {
    place: { latitude: 49.18, longitude: 4.55, elevation: 170 },
    box: "wide",
    departments: ["51", "08", "10", "02"],
    fogs: [],
    snows: [],
    rains: [],
    clears: []
  },
  // The Aisne: the Chemin des Dames at Craonne, with Malmaison, the 1914 crossings and the Marne of 1918 near enough.
  aisne: {
    place: { latitude: 49.44, longitude: 3.79, elevation: 180 },
    box: "wide",
    departments: ["02", "51", "60", "77", "75"],
    fogs: [
      // 13–14 September 1914: the Aisne crossed in dense fog by night; the mist burned off under a bright morning sun.
      [Date.UTC(1914, 8, 13, 20), Date.UTC(1914, 8, 14, 7), 100],
      // 16 April 1917: the Nivelle offensive's first morning on the Chemin des Dames dawned misty and overcast.
      [Date.UTC(1917, 3, 16, 3), Date.UTC(1917, 3, 16, 8), 800]
    ],
    snows: [],
    // 11–12 September 1914: torrents of rain on the march to the Aisne, turning the roads to mud (Official History).
    rains: [[Date.UTC(1914, 8, 11, 12), Date.UTC(1914, 8, 12, 21), 2.5]],
    clears: []
  },
  // The Somme: Albert and Thiepval, the battle of 1916.
  somme: {
    place: { latitude: 50.03, longitude: 2.7, elevation: 130 },
    box: "wide",
    departments: ["80", "60", "62", "59", "02", "27", "95", "75"],
    // Inland stations for the day's heat: Dunkirk's sea air would cool the Somme's summer.
    stations: { temperature: ["27284001", "75114001"] }, // Gisors, Paris-Montsouris
    fogs: [],
    snows: [],
    rains: [],
    clears: []
  },
  // Artois: Vimy and Arras, 1915 and 1917.
  artois: {
    place: { latitude: 50.37, longitude: 2.78, elevation: 140 },
    box: "wide",
    departments: ["62", "59", "80", "02", "27"],
    fogs: [],
    // 9 April 1917: the attack at Arras and Vimy went in at 05:30 through squalls of snow and sleet.
    snows: [[Date.UTC(1917, 3, 9, 3), Date.UTC(1917, 3, 9, 12), 1]],
    rains: [],
    // 9 May 1915: the French attack at Vimy went in in bright, dry weather.
    clears: [[Date.UTC(1915, 4, 9, 0), Date.UTC(1915, 4, 9, 21), 0]]
  }
}

/** Temperature falls this much per metre of height. */
const LAPSE = 0.0065
/** The wind at a man's height is about three quarters of the 10 m wind. */
const NEAR_GROUND = 0.75
/**
 * Stations chosen by coverage: the war has about 1,580 days; these many with values make a station worth using. Near
 * the front few stations kept records through the war (none in the Somme, Oise or Pas-de-Calais), so the reach is
 * wide: a day's highs and lows and its wet or dry spells are much the same across a hundred kilometres of northern
 * France, though the totals aren't.
 */
const COVERAGE = { temperature: 900, rain: 800, snow: 300 }
/** ...within these distances of the region's place, in km, nearest first, and this many of each. */
const REACH = { temperature: 150, rain: 120, snow: 90 }
const COUNT = { temperature: 2, rain: 3, snow: 4 }

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

/** One 20CRv3 field for one year over a box: { start (UTC ms), values [step][row][column] }. */
async function reanalysisYear(key, year, box) {
  const [folder, stem, variable] = FIELDS[key]
  const file = `${REANALYSIS}/${folder}/${stem}.${year}.nc`
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY
  const steps = days * 8
  const rows = box.rows[1] - box.rows[0] + 1
  const columns = box.columns[1] - box.columns[0] + 1
  const values = Array.from({ length: steps }, () =>
    Array.from({ length: rows }, () => Array.from({ length: columns }, () => NaN))
  )
  // A year at once outlasts the server's gateway; a quarter at a time doesn't. A year already cached whole is used.
  const whole = `${stem}.${year}${box.suffix}.txt`
  const chunks = existsSync(new URL(whole, CACHE))
    ? [{ from: 0, to: steps - 1, name: whole }]
    : quarters(`${stem}.${year}`, box.suffix, steps)
  for (const { from, to, name } of chunks) {
    const slice = `%5B${from}:1:${to}%5D%5B${box.rows[0]}:1:${box.rows[1]}%5D%5B${box.columns[0]}:1:${box.columns[1]}%5D`
    const text = (await cached(name, () => download(`${file}.ascii?${variable}${slice}`))).toString()
    for (const line of text.split("\n")) {
      const match = /^\[(\d+)\]\[(\d+)\],\s*(.+)$/.exec(line.trim())
      if (match) {
        values[from + Number(match[1])][Number(match[2])] = match[3]
          .split(",")
          .map(Number)
          .map((value) => (Math.abs(value) > 1e30 ? NaN : value))
      }
    }
  }
  return { start: Date.UTC(year, 0, 1), values }
}

/** A year's steps in four requests, each cached on its own. */
function quarters(stem, suffix, steps) {
  const size = Math.ceil(steps / 4)
  return [0, 1, 2, 3].map((quarter) => ({
    from: quarter * size,
    to: Math.min(steps, (quarter + 1) * size) - 1,
    name: `${stem}.q${quarter + 1}${suffix}.txt`
  }))
}

/** NOAA's server takes minutes over each year of a field, so several are fetched at once. */
const PARALLEL = 3

/** Every field over a box, every year: by field, a map from time (UTC ms) to the grid [row][column] then. */
async function reanalysis(boxName) {
  const box = BOXES[boxName]
  const jobs = Object.keys(FIELDS).flatMap((key) => YEARS.map((year) => ({ key, year })))
  const results = Array.from({ length: jobs.length })
  let next = 0
  const worker = async () => {
    while (next < jobs.length) {
      const index = next++
      const { key, year } = jobs[index]
      results[index] = await reanalysisYear(key, year, box)
      print(`20CRv3 ${boxName} ${key} ${year}: ${results[index].values.length} steps`)
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker))
  const series = Object.fromEntries(Object.keys(FIELDS).map((key) => [key, new Map()]))
  jobs.forEach(({ key }, index) => {
    const { start, values } = results[index]
    values.forEach((grid, step) => series[key].set(start + step * STEP_HOURS * HOUR, grid))
  })
  return { box, series }
}

/** Bilinear interpolation to a place from the four grid points round it. */
function interpolator(box, place) {
  const row = Math.floor(place.latitude) + 90 - box.rows[0]
  const column = Math.floor(place.longitude) - box.columns[0]
  const north = place.latitude - Math.floor(place.latitude)
  const east = place.longitude - Math.floor(place.longitude)
  return (grid) => {
    const southWest = grid[row][column]
    const southEast = grid[row][column + 1]
    const northWest = grid[row + 1][column]
    const northEast = grid[row + 1][column + 1]
    const south = southWest + (southEast - southWest) * east
    const northern = northWest + (northEast - northWest) * east
    return south + (northern - south) * north
  }
}

/** Parses a Météo-France daily CSV: every station's rows in the war, by station and day (UTC ms of the date). */
function parseStations(csv, columns) {
  const lines = csv.split("\n")
  const header = lines[0].split(";")
  const index = Object.fromEntries(columns.map((name) => [name, header.indexOf(name)]))
  const rows = new Map()
  const places = new Map()
  for (const line of lines.slice(1)) {
    const cells = line.split(";")
    const date = cells[5]
    const year = Number(date?.slice(0, 4))
    if (!(year >= 1914 && year <= 1918)) {
      continue
    }
    const day = Date.UTC(year, Number(date.slice(4, 6)) - 1, Number(date.slice(6, 8)))
    const values = Object.fromEntries(
      columns.map((name) => [name, cells[index[name]] === "" ? NaN : Number(cells[index[name]])])
    )
    rows.set(`${cells[0]} ${day}`, { ...values, altitude: Number(cells[4]) })
    if (!places.has(cells[0])) {
      places.set(cells[0], { name: cells[1], latitude: Number(cells[2]), longitude: Number(cells[3]) })
    }
  }
  return { rows, places }
}

/** Kilometres between two places, near enough over a hundred kilometres. */
function distance(a, b) {
  const north = (a.latitude - b.latitude) * 111.2
  const east = (a.longitude - b.longitude) * 111.2 * Math.cos((a.latitude * Math.PI) / 180)
  return Math.sqrt(north * north + east * east)
}

/** The nearest stations with enough of the war's days recorded for a measure, up to `count` within `reach` km. */
function choose(rows, places, place, has, { coverage, reach, count }) {
  const days = new Map()
  for (const [key, row] of rows) {
    if (has(row)) {
      const station = key.split(" ")[0]
      days.set(station, (days.get(station) ?? 0) + 1)
    }
  }
  return [...days.entries()]
    .filter(([station, recorded]) => recorded >= coverage && places.has(station))
    .map(([station]) => ({ station, km: distance(place, places.get(station)) }))
    .filter(({ km }) => km <= reach)
    .sort((a, b) => a.km - b.km)
    .slice(0, count)
    .map(({ station }) => station)
}

async function stations(region) {
  const daily = new Map()
  const snow = new Map()
  const places = new Map()
  for (const department of region.departments) {
    const main = parseStations(
      gunzipSync(
        await cached(`Q_${department}.csv.gz`, () =>
          download(`${STATIONS_URL}/Q_${department}_avant-1949_RR-T-Vent.csv.gz`)
        )
      ).toString(),
      ["RR", "TN", "TX"]
    )
    main.rows.forEach((value, key) => daily.set(key, value))
    main.places.forEach((value, key) => places.set(key, value))
    const other = parseStations(
      gunzipSync(
        await cached(`A_${department}.csv.gz`, () =>
          download(`${STATIONS_URL}/Q_${department}_avant-1949_autres-parametres.csv.gz`)
        )
      ).toString(),
      ["NEIG"]
    )
    other.rows.forEach((value, key) => snow.set(key, value))
    other.places.forEach((value, key) => places.set(key, value))
  }
  const pick = (rows, has, measure) =>
    choose(rows, places, region.place, has, {
      coverage: COVERAGE[measure],
      reach: REACH[measure],
      count: COUNT[measure]
    })
  const chosen = {
    temperature:
      region.stations?.temperature ??
      pick(daily, (row) => Number.isFinite(row.TN) && Number.isFinite(row.TX), "temperature"),
    rain: region.stations?.rain ?? pick(daily, (row) => Number.isFinite(row.RR), "rain"),
    snow: region.stations?.snow ?? pick(snow, (row) => Number.isFinite(row.NEIG), "snow")
  }
  const named = (list) => list.map((station) => places.get(station)?.name ?? station).join(", ") || "none"
  print(`  temperature: ${named(chosen.temperature)}`)
  print(`  rain: ${named(chosen.rain)}`)
  print(`  snow: ${named(chosen.snow)}`)
  return { daily, snow, chosen }
}

function mean(values) {
  const known = values.filter((value) => Number.isFinite(value))
  return known.length > 0 ? known.reduce((sum, value) => sum + value, 0) / known.length : NaN
}

async function buildRegion(name, region, grids) {
  print(`${name}:`)
  const { daily, snow, chosen } = await stations(region)
  const at = interpolator(grids.box, region.place)
  const times = []
  for (let time = START; time < END; time += STEP_HOURS * HOUR) {
    times.push(time)
  }
  const field = (key, time) => {
    const grid = grids.series[key].get(time)
    return grid ? at(grid) : NaN
  }
  const temperature = times.map((time) => field("air", time) - 273.15)
  const precipitation = times.map((time) => Math.max(0, field("prate", time) * 3600))

  // Stretch each day's temperatures to the stations' lowest and highest, corrected for height.
  let stretched = 0
  for (let day = START; day < END; day += DAY) {
    const lows = []
    const highs = []
    for (const station of chosen.temperature) {
      const row = daily.get(`${station} ${day}`)
      if (row) {
        const lapse = LAPSE * (region.place.elevation - row.altitude)
        lows.push(row.TN - lapse)
        highs.push(row.TX - lapse)
      }
    }
    const low = mean(lows)
    const high = mean(highs)
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

  // Rain, from 06:00 UTC that day to 06:00 the next as French stations measure it: none on days the stations stayed
  // dry, and the stations' totals on days they didn't.
  let corrected = 0
  for (let day = START; day < END; day += DAY) {
    const total = mean(chosen.rain.map((station) => daily.get(`${station} ${day}`)?.RR))
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

  // On days the stations saw snow, what falls below 2 °C falls as snow.
  const snowFraction = times.map((time, index) => {
    const frozen = field("cpofp", time)
    const byTemperature = Math.min(1, Math.max(0, (1.5 - temperature[index]) / 1.5))
    const fromModel = Number.isFinite(frozen) && frozen >= 0 ? frozen / 100 : byTemperature
    const day = Math.floor(time / DAY) * DAY
    const sawSnow = chosen.snow.some((station) => snow.get(`${station} ${day}`)?.NEIG === 1)
    return sawSnow && temperature[index] < 2 ? Math.max(fromModel, byTemperature, 0.5) : fromModel
  })

  // History's own snowfalls, rain and fair spells, where the sources missed them.
  const cloud = times.map((time) => field("tcdc", time))
  const within = (time, [from, to]) => time >= from && time <= to
  times.forEach((time, index) => {
    for (const span of region.snows) {
      if (within(time, span)) {
        precipitation[index] = Math.max(precipitation[index], span[2])
        snowFraction[index] = 1
      }
    }
    for (const span of region.rains) {
      if (within(time, span)) {
        precipitation[index] = Math.max(precipitation[index], span[2])
        snowFraction[index] = 0
        cloud[index] = Math.max(cloud[index], 95)
      }
    }
    for (const span of region.clears) {
      if (within(time, span)) {
        precipitation[index] = 0
        cloud[index] = Math.min(cloud[index], 30)
      }
    }
  })

  const round = (value, scale) => (Number.isFinite(value) ? Math.round(value * scale) : 0)
  const table = {
    source:
      "NOAA-CIRES-DOE 20th Century Reanalysis v3 (CC-BY 4.0) corrected with Météo-France daily station records " +
      "(Licence Ouverte 2.0); built by scripts/build-historical-weather.mjs",
    location: region.place,
    start: START,
    stepHours: STEP_HOURS,
    temperature: temperature.map((value) => round(value, 10)),
    cloud: cloud.map((value) => round(value, 1)),
    precipitation: precipitation.map((value) => round(value, 100)),
    snow: snowFraction.map((value) => round(value, 100)),
    windX: times.map((time) => round(field("uwnd", time) * NEAR_GROUND, 10)),
    windZ: times.map((time) => round(field("vwnd", time) * NEAR_GROUND, 10)),
    humidity: times.map((time) => round(field("rhum", time), 1)),
    fogs: region.fogs
  }
  const output = new URL(`${name}-weather-1914-1918.json`, DATA)
  await writeFile(output, `${JSON.stringify(table)}\n`)
  const total = precipitation.reduce((sum, value) => sum + value * STEP_HOURS, 0) / ((END - START) / (365.25 * DAY))
  print(`  ${times.length} steps, ${stretched} days' temperatures and ${corrected} days' rain from the stations`)
  print(`  about ${Math.round(total)} mm of rain a year; written ${output.pathname}`)
}

async function build() {
  const only = process.argv.includes("--region") ? process.argv[process.argv.indexOf("--region") + 1] : null
  const names = Object.keys(REGIONS).filter((name) => only === null || name === only)
  if (names.length === 0) {
    throw new Error(`No region ${only}; the regions are ${Object.keys(REGIONS).join(", ")}`)
  }
  const grids = new Map()
  for (const name of names) {
    const region = REGIONS[name]
    if (!grids.has(region.box)) {
      grids.set(region.box, await reanalysis(region.box))
    }
    await buildRegion(name, region, grids.get(region.box))
  }
}

await build()
