import type { Simulation } from "./simulation.ts"
import { FLEURY, type GeoLocation, illuminanceUnder, type Sky, sightRange, skyAt } from "./sky.ts"
import {
  createForecast,
  type Forecast,
  type ForecastSpec,
  typicalWeather,
  type Weather,
  WeatherPattern
} from "./weather.ts"

/**
 * Real minutes a whole day and night takes, unless a server or a game mode says otherwise. A day of two hours lets a
 * battle of an evening see dusk, night and dawn, and puts the night at a different hour of the real day each day, so no
 * one plays only in the dark.
 */
export const DEFAULT_MINUTES_PER_DAY = 120
/** 23 June 1916, 07:00 by French summer time (06:00 UTC): the morning of the German attack on Fleury. */
export const DEFAULT_START = Date.UTC(1916, 5, 23, 6, 0)
/** Ticks between weather and sky updates: once a second. They change slowly, and the sun's place costs a little. */
export const ENVIRONMENT_INTERVAL = 20

/** The battle's date and time of day. */
export interface WorldClock {
  /** Milliseconds since 1970, UTC. Negative in 1916. */
  utc: number
  /** Real minutes a whole day takes: 1440 runs in real time, 120 twelve times faster. */
  minutesPerDay: number
}

/** The world around the fighting: time, weather and light. Plain data apart from the forecast, which saves as its spec. */
export interface Environment {
  readonly location: GeoLocation
  readonly clock: WorldClock
  /** Where the weather comes from. Replace it to change how weather is decided, without touching anything else. */
  forecast: Forecast
  /** The weather now, as of the last update. */
  weather: Weather
  /** The sun and moon now. */
  sky: Sky
  /** Light on open ground now, in lux, through the cloud. */
  illuminance: number
  /** How far a man can be made out now, in metres: night, fog, rain and snow close it in. */
  sightRange: number
}

export interface EnvironmentOptions {
  readonly location?: GeoLocation
  /** When the battle starts, in milliseconds since 1970, UTC. */
  readonly start?: number
  readonly minutesPerDay?: number
  /** Defaults to fair weather held steady, with `wind`. */
  readonly forecast?: ForecastSpec
  readonly wind?: { readonly x: number; readonly z: number }
}

export function createEnvironment({
  location = FLEURY,
  start = DEFAULT_START,
  minutesPerDay = DEFAULT_MINUTES_PER_DAY,
  forecast = { kind: "steady", weather: typicalWeather(WeatherPattern.Fair, { x: 2, z: 0.5 }) },
  wind
}: EnvironmentOptions = {}): Environment {
  const spec: ForecastSpec =
    forecast.kind === "steady" && wind ? { kind: "steady", weather: { ...forecast.weather, wind } } : forecast
  const created = createForecast(spec)
  const environment: Environment = {
    location,
    clock: { utc: start, minutesPerDay },
    forecast: created,
    weather: created.at(start),
    sky: skyAt(start, location),
    illuminance: 0,
    sightRange: 0
  }
  observe(environment)
  return environment
}

/** Reads the weather and sky at the clock's time into the environment. */
function observe(environment: Environment): void {
  const { utc } = environment.clock
  environment.weather = environment.forecast.at(utc)
  environment.sky = skyAt(utc, environment.location)
  environment.illuminance = illuminanceUnder(environment.sky, environment.weather.cloudCover)
  environment.sightRange = sightRange(environment.illuminance, environment.weather.visibility)
}

/** Brings the weather, sky and wind up to the clock now, as after the clock or forecast changed. */
export function updateEnvironment(sim: Simulation): void {
  observe(sim.environment)
  sim.wind.x = sim.environment.weather.wind.x
  sim.wind.z = sim.environment.weather.wind.z
}

/** Game seconds that pass in one real second. */
export function timeScale(clock: WorldClock): number {
  return (24 * 60) / clock.minutesPerDay
}

/** Runs the clock on by one step of `seconds`, and once a second reads the weather and the sky. */
export function environmentSystem(sim: Simulation, seconds: number): void {
  const { clock } = sim.environment
  clock.utc += seconds * 1000 * timeScale(clock)
  if (sim.tick % ENVIRONMENT_INTERVAL === 0) {
    updateEnvironment(sim)
  }
}

/** Holds the weather as it is now, with a new wind. */
export function holdWeather(sim: Simulation, wind: { readonly x: number; readonly z: number }): void {
  const weather = { ...sim.environment.weather, wind: { x: wind.x, z: wind.z } }
  sim.environment.forecast = createForecast({ kind: "steady", weather })
  updateEnvironment(sim)
}

/** The environment as plain data, for saves. Weather and sky are kept as they were read, so a restore resumes exactly. */
export interface EnvironmentState {
  readonly location: GeoLocation
  readonly clock: Readonly<WorldClock>
  readonly forecast: ForecastSpec
  readonly weather: Weather
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

export function saveEnvironment(environment: Environment): EnvironmentState {
  return {
    location: { ...environment.location },
    clock: { ...environment.clock },
    forecast: copyForecast(environment.forecast.spec),
    weather: copyWeather(environment.weather),
    sky: copySky(environment.sky),
    illuminance: environment.illuminance,
    sightRange: environment.sightRange
  }
}

/** Options that recreate a saved environment; `resumeEnvironment` then puts back what was last read. */
export function environmentOptions(state: EnvironmentState): EnvironmentOptions {
  return {
    location: { ...state.location },
    start: state.clock.utc,
    minutesPerDay: state.clock.minutesPerDay,
    forecast: copyForecast(state.forecast)
  }
}

export function resumeEnvironment(environment: Environment, state: EnvironmentState): void {
  environment.weather = copyWeather(state.weather)
  environment.sky = copySky(state.sky)
  environment.illuminance = state.illuminance
  environment.sightRange = state.sightRange
}
