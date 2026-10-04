import { concentrationAt, GAS_CELL } from "./gas.ts"
import type { WorldPoint } from "./line-of-sight.ts"
import type { Simulation } from "./simulation.ts"

/**
 * How much a unit of smoke concentration dims a sight line per metre. Calibrated so a field-gun barrage, firing a few
 * rounds a minute per 15 m of front, screens what lies beyond it about as well as men at the time described: shapes
 * glimpsed through the murk, not a wall.
 */
export const SMOKE_EXTINCTION = 0.005
/** Past this optical depth (about 5% of light getting through) nothing can be made out at all. */
const SMOKE_BLIND = 3

/**
 * Optical depth of the smoke and dust between two points: 0 for clear air, 1 where about a third of the light gets
 * through. The smoke lies in a layer near the ground, so sight lines are sampled along the ground track.
 */
export function smokeBetween(sim: Simulation, from: WorldPoint, to: WorldPoint): number {
  if (!sim.smoke.active) {
    return 0
  }
  const dx = to.x - from.x
  const dz = to.z - from.z
  const distance = Math.sqrt(dx * dx + dz * dz)
  const samples = Math.max(1, Math.ceil(distance / GAS_CELL))
  let sum = 0
  for (let sample = 0; sample < samples; sample++) {
    const along = (sample + 0.5) / samples
    sum += concentrationAt(sim.smoke, from.x + dx * along, from.z + dz * along)
  }
  return (SMOKE_EXTINCTION * sum * distance) / samples
}

/** Whether a soldier at `from` can make out anything at `to` through the smoke. */
export function seesThroughSmoke(sim: Simulation, from: WorldPoint, to: WorldPoint): boolean {
  return smokeBetween(sim, from, to) < SMOKE_BLIND
}
