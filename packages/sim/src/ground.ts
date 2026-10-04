import { Surface } from "@verdun/map"
import type { Simulation } from "./simulation.ts"
import { isInTrench } from "./stance.ts"
import { surfaceAt } from "./terrain.ts"

/**
 * Ground up to this wet goes as usual; the surfaces' own paces already allow for Verdun's ordinary mud. Fair weather
 * leaves the ground about this damp, so a fair day changes nothing.
 */
export const WET_GROUND = 0.3
/** Below this temperature, in °C, wet ground is frozen hard and goes like dry. */
const FROZEN = -2
/**
 * How much of their pace sodden ground takes from men, by what they walk on: mud and shell-churned ground turn to a
 * bog that sucks boots off; a trench floods to the knee; grass and chalk only turn slippery.
 */
const BOGGING = { soft: 0.45, trench: 0.25, firm: 0.15 } as const
/** Snow lying this deep, in millimetres of water (about ten times that in snow), takes a quarter off the pace. */
const DEEP_SNOW = 20
/** In sodden soft ground, a shell buries itself before it bursts: this much of its reach is smothered. */
const SMOTHERING = 0.3

function isSoft(surface: Surface): boolean {
  return surface === Surface.Mud || surface === Surface.Churned
}

/** How sodden the ground is beyond ordinary going, from 0 to 1: rain of the last few days, unless it is frozen. */
export function sodden(sim: Simulation): number {
  const { wetness, temperature } = sim.environment.weather
  return temperature < FROZEN ? 0 : Math.max(0, (wetness - WET_GROUND) / (1 - WET_GROUND))
}

/** How deep snow lies, from 0 (none) to 1 (deep enough to slow men most). */
export function snowDepth(sim: Simulation): number {
  return Math.min(1, sim.environment.weather.snowCover / DEEP_SNOW)
}

/**
 * Pace on the ground at a point in this weather, as a fraction of its usual going: mud after rain, a flooded trench,
 * snow lying. 1 in fair weather.
 */
export function weatherPace(sim: Simulation, x: number, z: number): number {
  const wet = sodden(sim)
  const snow = 1 - 0.25 * snowDepth(sim)
  if (wet === 0) {
    return snow
  }
  return (1 - bogging(sim, x, z) * wet) * snow
}

function bogging(sim: Simulation, x: number, z: number): number {
  if (isInTrench(sim.map, x, z)) {
    return BOGGING.trench
  }
  return isSoft(surfaceAt(sim.map, x, z)) ? BOGGING.soft : BOGGING.firm
}

/**
 * How much of a ground burst's reach survives the ground it lands in: in sodden mud a shell plunges deep before it
 * bursts and the mud swallows its fragments, as men at Verdun and Passchendaele found. 1 on firm or frozen ground.
 */
export function burstReach(sim: Simulation, x: number, z: number): number {
  return isSoft(surfaceAt(sim.map, x, z)) ? 1 - SMOTHERING * sodden(sim) : 1
}
