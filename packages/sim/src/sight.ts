import type { EntityId } from "bitecs"
import { flareLight, isDark } from "./flares.ts"
import type { WorldPoint } from "./line-of-sight.ts"
import { type Simulation, TICK_RATE } from "./simulation.ts"
import { sightRange, snowGlow } from "./sky.ts"
import { seesThroughSmoke } from "./smoke.ts"
import { soldierEye } from "./stance.ts"

/**
 * For this long after firing, a shooter's muzzle flash gives him away in the dark, in seconds: long enough for whoever
 * saw it to fire back at the spot.
 */
export const FLASH_SECONDS = 1.5
/** How far off a muzzle flash is seen at night, in metres: as far as anyone would shoot at it. */
export const FLASH_REACH = 800

/**
 * Light to see by at a point now, in lux: the sky's, through the cloud, and any flares overhead, raised where snow lies
 * (`snowGlow`), since a man shows up against it.
 */
export function lightAt(sim: Simulation, x: number, z: number): number {
  const { illuminance, weather } = sim.environment
  const light = illuminance + (sim.flares.length > 0 ? flareLight(sim, x, z) : 0)
  return weather.snowCover > 0 ? light * snowGlow(weather.snowCover, weather.cloudCover) : light
}

/** Whether a soldier fired so recently that, in the dark, the flash still shows where he is. */
export function isFlashing(sim: Simulation, soldier: EntityId): boolean {
  return sim.tick - sim.soldiers.weapon.firedAt[soldier] <= FLASH_SECONDS * TICK_RATE && isDark(sim)
}

/**
 * How far away a soldier can be made out now, in metres: by the light where he stands (daylight, moonlight, a flare),
 * through the fog, rain or snow, or from much further while his muzzle flash shows.
 */
export function sightReach(sim: Simulation, soldier: EntityId): number {
  const x = sim.soldiers.position.x[soldier]
  const z = sim.soldiers.position.z[soldier]
  const { visibility } = sim.environment.weather
  const byLight = sightRange(lightAt(sim, x, z), visibility)
  return isFlashing(sim, soldier) ? Math.max(byLight, Math.min(FLASH_REACH, visibility)) : byLight
}

/**
 * Whether someone looking from `eye` can make out `soldier`: near enough for the light, with a clear sight line over the
 * ground, and not hidden by smoke. Combat and the player's view both decide sight here.
 */
export function canMakeOut(sim: Simulation, eye: WorldPoint, soldier: EntityId): boolean {
  if (!sim.lineOfSight) {
    return false
  }
  const head = soldierEye(sim, soldier)
  const reach = sightReach(sim, soldier)
  if ((head.x - eye.x) ** 2 + (head.z - eye.z) ** 2 > reach * reach) {
    return false
  }
  return sim.lineOfSight.isClear(eye, head) && seesThroughSmoke(sim, eye, head)
}

/**
 * How well a shot can be aimed by the light on its target, as a factor on the hit chance: 1 by day and in twilight,
 * falling to 0.3 by starlight. A full moon gives about a third; a flare overhead, most of daylight's.
 */
export function aimInLight(sim: Simulation, target: EntityId): number {
  const lux = lightAt(sim, sim.soldiers.position.x[target], sim.soldiers.position.z[target])
  return Math.min(1, Math.max(0.3, (Math.log10(Math.max(lux, 1e-6)) + 1.5) / 2.5))
}
