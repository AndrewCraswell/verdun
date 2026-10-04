import {
  capturedIds,
  clockMoment,
  type EntityId,
  evacuatedIds,
  fallenIds,
  isStandTo,
  sectorControl,
  Side,
  type Simulation,
  skyAt,
  type Squad,
  WeatherPattern,
  windFrom,
  woundedIds
} from "@verdun/sim"
import { battleHour, hourAt, weekLabel } from "../environment/calendar.ts"

/**
 * The sector as the HUD's top-right corner shows it: the hour, the light, the weather and the wind; who holds each
 * objective; and what each side has left and has lost. Worked out from the simulation and nothing else.
 */

/** Who holds something, from the player's side: ours, theirs or nobody's. */
export type Holder = "ours" | "theirs" | "none"

export type LightPhase = "night" | "dawn" | "day" | "dusk"

/** Weather drawn with its own icon. */
export type Sky = "clear" | "fair" | "overcast" | "fog" | "drizzle" | "rain" | "storm" | "snow"

export interface ClockView {
  /** "07:12", by French civil time. */
  readonly hour: string
  /** "Week of 20 June 1916". */
  readonly week: string
  readonly light: {
    readonly phase: LightPhase
    /** Dawn or dusk: every man up on the fire step. */
    readonly standTo: boolean
    /** The next sunrise or sunset: "Sunset 19:42". Null if the sun doesn't cross the horizon within a day. */
    readonly next: string | null
  }
  readonly weather: {
    readonly sky: Sky
    readonly label: string
    /** Air temperature, °C, rounded. */
    readonly temperature: number
    /** How far one can see when it's short of 2 km, in metres; otherwise null. */
    readonly visibility: number | null
  }
  readonly wind: {
    /** Toward which it blows, x east and z north, in metres per second. */
    readonly x: number
    readonly z: number
    readonly speed: number
    /** Where it blows from, as a compass point: "W", "NE". */
    readonly from: string
  }
}

export interface ObjectiveView {
  readonly name: string
  readonly holder: Holder
  readonly contested: boolean
  readonly x: number
  readonly z: number
  /** Metres from the man under control, or null with nobody under control. */
  readonly distance: number | null
}

export interface SectorView {
  readonly objectives: readonly ObjectiveView[]
  /** The share of the sector's objectives each side holds, from 0 to 1. */
  readonly control: { readonly ours: number; readonly theirs: number }
}

export interface Losses {
  readonly killed: number
  readonly wounded: number
  readonly captured: number
}

export interface StrengthView {
  /** Men left in the side's pool to replace wiped-out squads, and what it held at the start; null without a pool. */
  readonly reserves: { readonly men: number; readonly full: number } | null
  readonly ours: Losses
  readonly theirs: Losses
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const

const SKY_LABELS: Readonly<Record<Sky, string>> = {
  clear: "Clear",
  fair: "Fair",
  overcast: "Overcast",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  storm: "Thunderstorm",
  snow: "Snow"
}

const PATTERN_SKY: Readonly<Record<WeatherPattern, Sky>> = {
  [WeatherPattern.Clear]: "clear",
  [WeatherPattern.Fair]: "fair",
  [WeatherPattern.Overcast]: "overcast",
  [WeatherPattern.Fog]: "fog",
  [WeatherPattern.Drizzle]: "drizzle",
  [WeatherPattern.Rain]: "rain",
  [WeatherPattern.Storm]: "storm"
}

/** The sun's altitude, in degrees, at which its upper edge crosses the horizon (refraction included). */
const HORIZON = -0.833
/** The sun above this is day, between the stand-to's bounds dawn or dusk (packages/sim/src/routine.ts). */
const DAYLIGHT = 2
const MINUTE = 60_000
/** Sunrise and sunset are looked for this often across the next day, then pinned down by halving. */
const SEARCH_STEP = 20 * MINUTE
const SEARCH_SPAN = 24 * 60 * MINUTE

export function holderOf(holder: number, side: Side): Holder {
  if (holder === -1) {
    return "none"
  }
  return holder === side ? "ours" : "theirs"
}

/**
 * The next time the sun's edge crosses the horizon after `from`, and whether it's rising then: sampled across a day,
 * then halved down to the minute. Null in a polar day or night, which Verdun never sees.
 */
export function nextSunCrossing(
  from: number,
  location: Simulation["environment"]["location"]
): { readonly at: number; readonly rising: boolean } | null {
  const above = (utc: number) => skyAt(utc, location).sun.altitude - HORIZON
  let before = from
  let height = above(from)
  for (let at = from + SEARCH_STEP; at <= from + SEARCH_SPAN; at += SEARCH_STEP) {
    const next = above(at)
    if (Math.sign(next) !== Math.sign(height)) {
      let low = before
      let high = at
      while (high - low > MINUTE) {
        const middle = (low + high) / 2
        if (Math.sign(above(middle)) === Math.sign(height)) {
          low = middle
        } else {
          high = middle
        }
      }
      return { at: high, rising: next > 0 }
    }
    before = at
    height = next
  }
  return null
}

/**
 * The light now, and when it next changes. Sunrise and sunset, and whether the sun is climbing, are worked out again
 * every ten minutes of game time: the sky is computed from the stars, too dear to ask ten times a second.
 */
export function createLightReader(): (sim: Simulation) => ClockView["light"] {
  let cachedAt = Number.NaN
  let crossing: ReturnType<typeof nextSunCrossing> = null
  let climbing = true
  return (sim) => {
    const now = clockMoment(sim.environment.clock)
    if (!(Math.abs(now - cachedAt) < 10 * MINUTE) || (crossing !== null && crossing.at <= now)) {
      const { location } = sim.environment
      crossing = nextSunCrossing(now, location)
      climbing = skyAt(now + 5 * MINUTE, location).sun.altitude > skyAt(now, location).sun.altitude
      cachedAt = now
    }
    const altitude = sim.environment.sky.sun.altitude
    const standTo = isStandTo(sim)
    let phase: LightPhase = "night"
    if (altitude > DAYLIGHT) {
      phase = "day"
    } else if (standTo) {
      phase = climbing ? "dawn" : "dusk"
    }
    return {
      phase,
      standTo,
      next: crossing ? `${crossing.rising ? "Sunrise" : "Sunset"} ${hourAt(crossing.at)}` : null
    }
  }
}

export function clockView(sim: Simulation, light: ClockView["light"]): ClockView {
  const { weather } = sim.environment
  const snowing = weather.precipitation > 0.1 && weather.snowFraction > 0.5
  const sky = snowing ? "snow" : PATTERN_SKY[weather.pattern]
  const speed = Math.hypot(weather.wind.x, weather.wind.z)
  return {
    hour: battleHour(sim.environment.clock),
    week: weekLabel(sim.environment.clock.week),
    light,
    weather: {
      sky,
      label: SKY_LABELS[sky],
      temperature: Math.round(weather.temperature),
      visibility: weather.visibility < 2000 ? Math.round(weather.visibility / 10) * 10 : null
    },
    wind: {
      x: weather.wind.x,
      z: weather.wind.z,
      speed,
      from: COMPASS[Math.round(windFrom(weather.wind) / 45) % 8] ?? "N"
    }
  }
}

export function sectorView(
  sim: Simulation,
  side: Side,
  from: { readonly x: number; readonly z: number } | null
): SectorView {
  const control = sectorControl(sim)
  const enemy = side === Side.French ? Side.German : Side.French
  return {
    objectives: sim.objectives.map((objective) => ({
      name: objective.name,
      holder: holderOf(objective.holder, side),
      contested: objective.contested,
      x: objective.x,
      z: objective.z,
      distance: from ? Math.hypot(objective.x - from.x, objective.z - from.z) : null
    })),
    control: { ours: control[side], theirs: control[enemy] }
  }
}

/** Each side's losses: killed (dying of wounds included), wounded (lying out or carried back) and taken prisoner. */
export function strengthView(sim: Simulation, squad: Squad): StrengthView {
  const side = squad.side
  const lying = new Set(woundedIds(sim))
  const killed = fallenIds(sim).filter((id) => !lying.has(id))
  const wounded = [...lying, ...evacuatedIds(sim)]
  const captured = capturedIds(sim)
  const losses = (team: Side): Losses => {
    const count = (ids: readonly EntityId[]) => ids.filter((id) => sim.soldiers.side.value[id] === team).length
    return { killed: count(killed), wounded: count(wounded), captured: count(captured) }
  }
  const enemy = side === Side.French ? Side.German : Side.French
  return {
    reserves:
      sim.reinforcements.full[side] > 0
        ? { men: Math.floor(sim.reinforcements.pool[side]), full: sim.reinforcements.full[side] }
        : null,
    ours: losses(side),
    theirs: losses(enemy)
  }
}
