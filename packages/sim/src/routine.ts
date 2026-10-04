import type { EntityId } from "bitecs"
import { clockMoment } from "./environment.ts"
import { isDark } from "./flares.ts"
import type { Simulation } from "./simulation.ts"
import { skyAt } from "./sky.ts"

/**
 * The trench routine of night and day. Both armies stood to at dawn and at dusk, every man on the fire step with
 * bayonet fixed, because those were the hours attacks came: light enough to move, too dark to be seen far. At night
 * most of the garrison slept in the dugouts while sentries watched the wire, and patrols, raiders and wiring parties
 * went out.
 */

/** Stand-to lasts while the sun is between these altitudes, in degrees: from first light to just after sunrise, and the
 * same at dusk. About an hour of game time each. */
const STAND_TO = { from: -10, to: 2 } as const
/** Besides the sentry, this many men of a squad stay awake on the fire step at night. */
const AWAKE = 1

/** Whether it is stand-to: dawn or dusk, every man up. */
export function isStandTo(sim: Simulation): boolean {
  const { altitude } = sim.environment.sky.sun
  return altitude >= STAND_TO.from && altitude <= STAND_TO.to
}

/**
 * Whether the dawn stand-to begins within `hours` of game time: a night with first light close. Through the night the
 * sun climbs toward the horizon, so one look ahead tells.
 */
export function dawnWithin(sim: Simulation, hours: number): boolean {
  if (!isNight(sim)) {
    return false
  }
  const { clock, location } = sim.environment
  return skyAt(clockMoment(clock) + hours * 3_600_000, location).sun.altitude >= STAND_TO.from
}

/** Whether it is night proper: dark, and not stand-to. */
export function isNight(sim: Simulation): boolean {
  return isDark(sim) && !isStandTo(sim)
}

/**
 * Whether a soldier would be asleep in a dugout tonight: a man of a bot squad holding its trench, not its sentry nor
 * the man awake with him, in the dark hours between the stand-tos. A player's squad stays up.
 */
export function restsTonight(sim: Simulation, soldier: EntityId): boolean {
  const squad = sim.squads[sim.soldiers.squad.id[soldier]]
  if (!squad || squad.controller !== "ai" || squad.order.kind !== "hold" || !isNight(sim)) {
    return false
  }
  const awake = squad.members.filter((member) => member !== squad.leader).slice(0, AWAKE)
  return soldier !== squad.leader && !awake.includes(soldier)
}
