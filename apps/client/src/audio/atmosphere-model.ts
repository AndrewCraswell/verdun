import { type SimEvent, type Simulation, TICK_RATE, WeatherPattern } from "@verdun/sim"
import { type Listener, placeSound, type SoundCall } from "./battle-sound-model.ts"

/** How loud each looping bed is, from 0 to 1, before the mixer's own levels. */
export interface AtmosphereLevels {
  /** Rain on the leaves and the mud. */
  readonly rain: number
  /** Wind gusting across the open. */
  readonly wind: number
  /** The whole front's guns from far off, heard as the camera climbs and as the fighting gets heavier. */
  readonly roar: number
}

/** Rain this heavy, in millimetres an hour, plays the rain bed fully. */
const RAIN_FULL = 6
/** Wind below WIND_CALM metres per second adds nothing; at WIND_FULL the wind bed plays fully. */
const WIND_CALM = 3
const WIND_FULL = 12
/** The roar fades in as the camera climbs from ROAR_FROM to ROAR_FULL metres. */
const ROAR_FROM = 90
const ROAR_FULL = 260
/** How much roar a quiet front still makes: the guns never quite stop. */
const ROAR_QUIET = 0.3
/** Fighting is measured over about this many seconds. */
const INTENSITY_SECONDS = 10
/** Shells bursting this often (per second, shots counting a tenth each) is the heaviest fighting. */
const FULL_FIGHTING = 4
const EVENT_WEIGHTS: Partial<Readonly<Record<SimEvent["type"], number>>> = { burst: 1, shot: 0.1 }
/** In a storm, thunder this often: between THUNDER_GAP[0] and [1] seconds, from 1 to 5 km away. */
const THUNDER_GAP = [8, 30] as const
const THUNDER_RANGE = [1000, 5000] as const

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** The beds' levels for a listener, given how heavy the fighting is (0 to 1). */
export function atmosphereLevels(sim: Simulation, listener: Listener, intensity: number): AtmosphereLevels {
  const { precipitation, snowFraction, wind } = sim.environment.weather
  const zoom = clamp01((listener.height - ROAR_FROM) / (ROAR_FULL - ROAR_FROM))
  return {
    // Snow falls silently.
    rain: clamp01(precipitation / RAIN_FULL) * (1 - snowFraction),
    wind: clamp01((Math.hypot(wind.x, wind.z) - WIND_CALM) / (WIND_FULL - WIND_CALM)),
    roar: zoom * (ROAR_QUIET + (1 - ROAR_QUIET) * intensity)
  }
}

export interface AtmosphereModel {
  /** Reads the step just taken: how heavy the fighting is, and thunder in a storm. Call after every step. */
  step(listener: Listener): SoundCall[]
  /** How heavy the fighting has been lately, from 0 (quiet) to 1. */
  intensity(): number
  levels(listener: Listener): AtmosphereLevels
}

/** A small seeded generator, so thunder never draws on the simulation's own random numbers. */
function generator(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** Weather and the sense of the whole front: what the looping beds play, and thunder in a storm. */
export function createAtmosphereModel(sim: Simulation, seed = 1916): AtmosphereModel {
  const random = generator(seed)
  let fighting = 0
  let untilThunder = THUNDER_GAP[0]
  const smoothing = 1 / (INTENSITY_SECONDS * TICK_RATE)
  const intensity = () => clamp01(fighting / FULL_FIGHTING)

  return {
    step(listener) {
      let weight = 0
      for (const event of sim.events) {
        weight += EVENT_WEIGHTS[event.type] ?? 0
      }
      fighting += (weight * TICK_RATE - fighting) * smoothing
      untilThunder -= 1 / TICK_RATE
      if (sim.environment.weather.pattern !== WeatherPattern.Storm || untilThunder > 0) {
        return []
      }
      untilThunder = THUNDER_GAP[0] + random() * (THUNDER_GAP[1] - THUNDER_GAP[0])
      const bearing = random() * 2 * Math.PI
      const range = THUNDER_RANGE[0] + random() * (THUNDER_RANGE[1] - THUNDER_RANGE[0])
      const call = placeSound(
        listener,
        "thunder",
        listener.x + Math.cos(bearing) * range,
        listener.z + Math.sin(bearing) * range
      )
      return call ? [call] : []
    },
    intensity,
    levels(listener) {
      return atmosphereLevels(sim, listener, intensity())
    }
  }
}
