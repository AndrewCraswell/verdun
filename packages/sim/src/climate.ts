import type { Simulation } from "./simulation.ts"

/**
 * What the weather does to men and their weapons, beyond what they can see and how fast they can walk (sight.ts,
 * ground.ts). Mud and rain foul rifles; cold and heat wear men down; the cold kills the wounded left out in it.
 *
 * It imports nothing but types: the systems read it, and anything it imported that led back to them would leave a
 * module half-evaluated when they load.
 */

/**
 * Ground up to this wet goes as usual; the surfaces' own paces already allow for Verdun's ordinary mud. Fair weather
 * leaves the ground about this damp, so a fair day changes nothing.
 */
export const WET_GROUND = 0.3
/** Below this temperature, in °C, wet ground is frozen hard and goes like dry. */
const FROZEN = -2

/** How sodden the ground is beyond ordinary going, from 0 to 1: rain of the last few days, unless it is frozen. */
export function sodden(sim: Simulation): number {
  const { wetness, temperature } = sim.environment.weather
  return temperature < FROZEN ? 0 : Math.max(0, (wetness - WET_GROUND) / (1 - WET_GROUND))
}

/** Whether the ground is frozen hard: wet ground goes like dry, and shells burst on its surface. */
export function isFrozen(sim: Simulation): boolean {
  return sim.environment.weather.temperature < FROZEN
}

/** Rain this hard, in mm an hour, or sodden ground, fouls a weapon as much as it gets: more mud in the bolt, wet ammunition. */
const HEAVY_RAIN = 4
/**
 * How much longer a weapon takes between shots when fouled. A rifle's bolt clogged with mud had to be worked free; the
 * Lebel's tube magazine and the Gewehr 98's charger guides both suffered. A water-cooled machine gun on its sledge,
 * fed from belts kept in boxes, much less.
 */
const FOULING = { rifle: 0.35, machineGun: 0.15 } as const
/** Below this temperature, in °C, the cold starts to tell; at `bitter` it tells most. */
const COLD = { from: 0, bitter: -12 } as const
/** Above this temperature, in °C, the heat starts to tell; at `scorching` it tells most. Mild: men drank what they had. */
const HEAT = { from: 26, scorching: 34 } as const
/** In the bitterest cold, men get their breath back this much slower; in the worst heat, this much. */
const RECOVERY_LOSS = { cold: 0.35, heat: 0.2 } as const
/** In the bitterest cold, wounded men left out die this many times faster than in mild weather. */
const EXPOSURE = 2.5

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/** How fouled weapons are by the weather, from 0 (dry) to 1: sodden ground or heavy rain. Snow and frost keep them dry. */
export function fouling(sim: Simulation): number {
  const { precipitation, snowFraction } = sim.environment.weather
  return Math.max(sodden(sim), Math.min(1, (precipitation * (1 - snowFraction)) / HEAVY_RAIN))
}

/** How many times as long as usual a weapon takes between shots in this weather: up to 1.35 for a rifle in mud. */
export function reloadFactor(sim: Simulation, machineGun: boolean): number {
  return 1 + (machineGun ? FOULING.machineGun : FOULING.rifle) * fouling(sim)
}

/** How cold it is, from 0 (above freezing) to 1 (bitter, −12 °C and below). */
export function coldness(sim: Simulation): number {
  return smoothstep(COLD.from, COLD.bitter, sim.environment.weather.temperature)
}

/** How hot it is, from 0 (26 °C and under) to 1 (34 °C and over). */
export function heat(sim: Simulation): number {
  return smoothstep(HEAT.from, HEAT.scorching, sim.environment.weather.temperature)
}

/** A man's breath comes back this much as fast as in mild weather: slower in the cold and, less, in the heat. */
export function recoveryFactor(sim: Simulation): number {
  return (1 - RECOVERY_LOSS.cold * coldness(sim)) * (1 - RECOVERY_LOSS.heat * heat(sim))
}

/** Wounded men left out die this many times as fast as in mild weather: faster in the cold. */
export function exposureFactor(sim: Simulation): number {
  return 1 + (EXPOSURE - 1) * coldness(sim)
}

/** In frozen ground a shell digs only this much of its usual crater: it can't bite into the ground. */
const FROZEN_CRATER = 0.6

/** How much of a crater's usual depth a shell digs in this weather. */
export function craterDepthFactor(sim: Simulation): number {
  return isFrozen(sim) ? FROZEN_CRATER : 1
}
