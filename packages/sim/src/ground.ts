import { Surface } from "@verdun/map"
import { isFrozen, sodden } from "./climate.ts"
import type { Simulation } from "./simulation.ts"
import { isInTrench } from "./stance.ts"
import { surfaceAt } from "./terrain.ts"

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
 * Frozen ground throws a shell's fragments this much further: it bursts on the hard surface instead of burying itself,
 * as the winters of 1916-17 showed.
 */
const FROZEN_REACH = 1.15

/**
 * How much of a ground burst's reach survives the ground it lands in: in sodden mud a shell plunges deep before it
 * bursts and the mud swallows its fragments, as men at Verdun and Passchendaele found; on frozen ground it bursts on
 * the surface and reaches further. 1 on firm ground.
 */
export function burstReach(sim: Simulation, x: number, z: number): number {
  if (isFrozen(sim)) {
    return FROZEN_REACH
  }
  return isSoft(surfaceAt(sim.map, x, z)) ? 1 - SMOTHERING * sodden(sim) : 1
}
