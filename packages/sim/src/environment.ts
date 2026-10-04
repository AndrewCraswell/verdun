import type { Simulation } from "./simulation.ts"
import { FLEURY, type GeoLocation, illuminanceUnder, type Sky, sightRange, skyAt } from "./sky.ts"
import {
  blendWeather,
  createForecast,
  type Forecast,
  type ForecastSpec,
  typicalWeather,
  type Weather,
  WeatherPattern
} from "./weather.ts"

/** A day and a week of game time, in milliseconds. */
export const DAY = 86_400_000
export const WEEK = 7 * DAY

/**
 * Real minutes a whole day and night of battle takes, unless a server or a game mode says otherwise. Under two hours, so
 * an evening's play sees dawn, day, dusk and night, with 30 (June) to 70 (December) minutes of darkness: long enough
 * for a raid, a wiring party or a relief.
 *
 * Not a divisor of the real day: 1440 / 117 leaves 36 minutes over, so night comes about a third of a cycle later each
 * real day, and someone who always plays at 8 pm sees day, dusk and night over three evenings. At 120 (a divisor) night
 * would fall at the same real hours every day; at 110 it would creep only 10 minutes a day; at 115 it would flip
 * between two phases. See docs/time-and-weather.md.
 */
export const DEFAULT_MINUTES_PER_DAY = 117
/**
 * The week of the war beginning Tuesday 20 June 1916, and 07:00 French summer time (06:00 UTC) on its fourth day, the
 * 23rd: the morning of the German attack on Fleury. Weeks of the war run from Tuesdays, counted from 4 August 1914.
 */
export const DEFAULT_WEEK = Date.UTC(1916, 5, 20)
export const DEFAULT_ELAPSED = 3 * DAY + 6 * 3_600_000
/** Ticks between weather and sky updates: once a second. They change slowly, and the sun's place costs a little. */
export const ENVIRONMENT_INTERVAL = 20
/** Game time the weather takes to change when the sky's date jumps: a wrap of the week or a new week. */
const WEATHER_BLEND = 3_600_000

/**
 * The battle's clock: which week of the war it is, and the hour of day. Two clocks, as players see them: the week moves
 * on only at the campaign's daily turn ("Week of 21 February 1916"), while days and nights pass every couple of hours.
 */
export interface WorldClock {
  /** The week of the war being fought: 00:00 UTC on its first day, in milliseconds since 1970 (negative before 1970). */
  week: number
  /**
   * Game time since the week began, in milliseconds. Its remainder in a day is the hour; its whole days step through
   * the week's dates for the sun, moon and weather, starting again after the seventh.
   */
  elapsed: number
  /** Real minutes a whole day and night takes: 1440 runs in real time. */
  minutesPerDay: number
}

/** A weather change in progress: the weather it started from, and when, in the clock's elapsed time. */
interface WeatherBlend {
  readonly from: Weather
  readonly start: number
}

/** The world around the fighting: time, weather and light. Plain data apart from the forecast, which saves as its spec. */
export interface Environment {
  readonly location: GeoLocation
  readonly clock: WorldClock
  /** Where the weather comes from. Replace it to change how weather is decided, without touching anything else. */
  forecast: Forecast
  /** The weather now, as of the last update. */
  weather: Weather
  /** Set while the weather eases from one date's into another's after the sky's date jumped. */
  blend: WeatherBlend | null
  /** The sun and moon now. */
  sky: Sky
  /** Light on open ground now, in lux, through the cloud. */
  illuminance: number
  /** How far a man can be made out now, in metres: night, fog, rain and snow close it in. */
  sightRange: number
}

export interface EnvironmentOptions {
  readonly location?: GeoLocation
  /** The week of the war: 00:00 UTC on its first day. */
  readonly week?: number
  /** Game time into the week, in milliseconds: the hour of the first day, or later. */
  readonly elapsed?: number
  readonly minutesPerDay?: number
  /** Defaults to fair weather held steady, with `wind`. */
  readonly forecast?: ForecastSpec
  readonly wind?: { readonly x: number; readonly z: number }
}

/** The moment the sky and weather show: the week's date for this day of battle, at this hour. */
export function clockMoment(clock: Readonly<WorldClock>): number {
  return clock.week + (((clock.elapsed % WEEK) + WEEK) % WEEK)
}

/** A clock's week and elapsed time for a moment: the week starting that day, at that hour. For tests and dev tools. */
export function clockAt(utc: number): { readonly week: number; readonly elapsed: number } {
  const week = Math.floor(utc / DAY) * DAY
  return { week, elapsed: utc - week }
}

/** Game seconds that pass in one real second. */
export function timeScale(clock: Readonly<WorldClock>): number {
  return (24 * 60) / clock.minutesPerDay
}

export function createEnvironment({
  location = FLEURY,
  week = DEFAULT_WEEK,
  elapsed = DEFAULT_ELAPSED,
  minutesPerDay = DEFAULT_MINUTES_PER_DAY,
  forecast = { kind: "steady", weather: typicalWeather(WeatherPattern.Fair, { x: 2, z: 0.5 }) },
  wind
}: EnvironmentOptions = {}): Environment {
  const spec: ForecastSpec =
    forecast.kind === "steady" && wind ? { kind: "steady", weather: { ...forecast.weather, wind } } : forecast
  const created = createForecast(spec)
  const clock = { week, elapsed, minutesPerDay }
  const moment = clockMoment(clock)
  const environment: Environment = {
    location,
    clock,
    forecast: created,
    weather: created.at(moment),
    blend: null,
    sky: skyAt(moment, location),
    illuminance: 0,
    sightRange: 0
  }
  observe(environment)
  return environment
}

/** Reads the weather and sky at the clock's moment into the environment. */
function observe(environment: Environment): void {
  const { clock, blend } = environment
  const moment = clockMoment(clock)
  const target = environment.forecast.at(moment)
  const progress = blend ? (clock.elapsed - blend.start) / WEATHER_BLEND : 1
  if (blend && progress >= 0 && progress < 1) {
    environment.weather = blendWeather(blend.from, target, progress * progress * (3 - 2 * progress))
  } else {
    environment.weather = target
    environment.blend = null
  }
  environment.sky = skyAt(moment, environment.location)
  environment.illuminance = illuminanceUnder(environment.sky, environment.weather.cloudCover)
  environment.sightRange = sightRange(environment.illuminance, environment.weather.visibility)
}

/** Brings the weather, sky and wind up to the clock now, as after the clock or forecast changed. */
export function updateEnvironment(sim: Simulation): void {
  observe(sim.environment)
  sim.wind.x = sim.environment.weather.wind.x
  sim.wind.z = sim.environment.weather.wind.z
}

/** Eases the weather from what it is now into the next date's, instead of jumping. */
function startBlend(environment: Environment): void {
  environment.blend = { from: copyWeather(environment.weather), start: environment.clock.elapsed }
}

/** Runs the clock on by one step of `seconds`, and once a second reads the weather and the sky. */
export function environmentSystem(sim: Simulation, seconds: number): void {
  const { clock } = sim.environment
  const lap = Math.floor(clock.elapsed / WEEK)
  clock.elapsed += seconds * 1000 * timeScale(clock)
  // Past the seventh day the sky's date starts the week again: let the weather ease back into the first day's.
  if (Math.floor(clock.elapsed / WEEK) !== lap) {
    startBlend(sim.environment)
  }
  if (sim.tick % ENVIRONMENT_INTERVAL === 0) {
    updateEnvironment(sim)
  }
}

/**
 * The campaign's daily turn: the war moves on to another week. The hour of day carries on; the days of battle start
 * again from the new week's first date, and the weather eases into it.
 */
export function startWeek(sim: Simulation, week: number): void {
  const { clock } = sim.environment
  clock.week = week
  clock.elapsed = ((clock.elapsed % DAY) + DAY) % DAY
  startBlend(sim.environment)
  updateEnvironment(sim)
}

/** Holds the weather as it is now, with a new wind. */
export function holdWeather(sim: Simulation, wind: { readonly x: number; readonly z: number }): void {
  const weather = { ...sim.environment.weather, wind: { x: wind.x, z: wind.z } }
  sim.environment.forecast = createForecast({ kind: "steady", weather })
  sim.environment.blend = null
  updateEnvironment(sim)
}

/** The environment as plain data, for saves. Weather and sky are kept as they were read, so a restore resumes exactly. */
export interface EnvironmentState {
  readonly location: GeoLocation
  readonly clock: Readonly<WorldClock>
  readonly forecast: ForecastSpec
  readonly weather: Weather
  readonly blend: WeatherBlend | null
  readonly sky: Sky
  readonly illuminance: number
  readonly sightRange: number
}

function copyWeather(weather: Weather): Weather {
  return { ...weather, wind: { ...weather.wind } }
}

function copySky(sky: Sky): Sky {
  return { ...sky, sun: { ...sky.sun }, moon: { ...sky.moon } }
}

function copyForecast(spec: ForecastSpec): ForecastSpec {
  return spec.kind === "steady" ? { kind: "steady", weather: copyWeather(spec.weather) } : { ...spec }
}

function copyBlend(blend: WeatherBlend | null): WeatherBlend | null {
  return blend ? { from: copyWeather(blend.from), start: blend.start } : null
}

export function saveEnvironment(environment: Environment): EnvironmentState {
  return {
    location: { ...environment.location },
    clock: { ...environment.clock },
    forecast: copyForecast(environment.forecast.spec),
    weather: copyWeather(environment.weather),
    blend: copyBlend(environment.blend),
    sky: copySky(environment.sky),
    illuminance: environment.illuminance,
    sightRange: environment.sightRange
  }
}

/** Options that recreate a saved environment; `resumeEnvironment` then puts back what was last read. */
export function environmentOptions(state: EnvironmentState): EnvironmentOptions {
  return {
    location: { ...state.location },
    week: state.clock.week,
    elapsed: state.clock.elapsed,
    minutesPerDay: state.clock.minutesPerDay,
    forecast: copyForecast(state.forecast)
  }
}

export function resumeEnvironment(environment: Environment, state: EnvironmentState): void {
  environment.weather = copyWeather(state.weather)
  environment.blend = copyBlend(state.blend)
  environment.sky = copySky(state.sky)
  environment.illuminance = state.illuminance
  environment.sightRange = state.sightRange
}
