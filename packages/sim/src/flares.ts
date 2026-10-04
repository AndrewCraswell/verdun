import { hasComponent } from "bitecs"
import { Side, Stance } from "./components.ts"
import type { SimEvent, Simulation } from "./simulation.ts"
import { soldiersNear } from "./spatial.ts"
import { isAlive } from "./squads.ts"
import { isInTrench, isSheltering } from "./stance.ts"

/**
 * A Very light (Verey light): a flare shot from a pistol over no man's land. Both armies fired them all night to see
 * what was moving in front of the wire: a white glare for a few seconds, under which anything standing could be seen
 * and shot, and anyone caught in the open froze or dropped flat.
 *
 * A flare stores its launch, so its place at any moment, fractional ticks included, comes from `flarePosition`.
 */
export interface Flare {
  readonly side: Side
  /** Where it was fired from. */
  readonly fromX: number
  readonly fromZ: number
  /** The ground point it was fired at, over which it hangs. */
  readonly x: number
  readonly z: number
  /** Drift once it hangs, in metres per second: the wind when it was fired. */
  readonly vx: number
  readonly vz: number
  /** Ticks it was fired and burns out. */
  readonly firedAt: number
  readonly burnsOutAt: number
}

/** A flare going up this step, for sound and a launch puff. */
export interface FlareEvent {
  readonly type: "flare"
  readonly side: Side
  readonly x: number
  readonly z: number
}

/** How a flare flies: a second and a half up to its height, then sinking slowly as it burns, eight seconds in all. */
export const FLARE = {
  riseSeconds: 1.5,
  height: 60,
  sinkRate: 3,
  burnSeconds: 8,
  /** Light it adds to the ground beneath it, in lux: enough to see a standing man by at a few hundred metres. */
  peakLux: 2,
  /** Ground radius it lights, in metres. */
  radius: 70
} as const

/** Below this much light on the ground, in lux, it is dark enough to send up flares: past civil twilight. */
export const DARK_LUX = 3
/** How far sentries fire flares out in front of them, in metres. */
const REACH = { min: 70, max: 140 } as const
/** How far a sentry hears men moving in front of him, in metres; men crawling, much closer. */
const HEARING = { walking: 150, crawling: 40 } as const
/** Routine flares on a quiet night: each sentry sends one up every few minutes on average. */
const ROUTINE_PER_SENTRY_SECOND = 1 / 200
/** At most this many of a side's flares in the air at once. */
const MAX_IN_AIR = 6
/** Sentries look and listen this often, in ticks: once a second. */
const CHECK_INTERVAL = 20
const TICKS_PER_SECOND = 20

/** A flare's place at a tick (fractional ticks for smooth drawing): `y` is its height above the ground, in metres. */
export function flarePosition(flare: Flare, tick: number): { x: number; y: number; z: number } {
  const age = Math.max(0, (tick - flare.firedAt) / TICKS_PER_SECOND)
  if (age < FLARE.riseSeconds) {
    const along = age / FLARE.riseSeconds
    return {
      x: flare.fromX + (flare.x - flare.fromX) * along,
      y: FLARE.height * Math.sin((along * Math.PI) / 2),
      z: flare.fromZ + (flare.z - flare.fromZ) * along
    }
  }
  const hanging = age - FLARE.riseSeconds
  return {
    x: flare.x + flare.vx * hanging,
    y: Math.max(0, FLARE.height - FLARE.sinkRate * hanging),
    z: flare.z + flare.vz * hanging
  }
}

/** Light flares add to a ground point now, in lux. */
export function flareLight(sim: Simulation, x: number, z: number): number {
  let lux = 0
  for (const flare of sim.flares) {
    // Lit once it is up.
    if (sim.tick - flare.firedAt < TICKS_PER_SECOND) {
      continue
    }
    const at = flarePosition(flare, sim.tick)
    const distance = Math.sqrt((at.x - x) ** 2 + (at.z - z) ** 2)
    if (distance < FLARE.radius) {
      lux += FLARE.peakLux * (1 - (distance / FLARE.radius) ** 2)
    }
  }
  return lux
}

/** Whether it is dark enough for flares and muzzle flashes to matter. */
export function isDark(sim: Simulation): boolean {
  return sim.environment.illuminance < DARK_LUX
}

function isMoving(sim: Simulation, soldier: number): boolean {
  return (
    hasComponent(sim.world, soldier, sim.soldiers.steer) || hasComponent(sim.world, soldier, sim.soldiers.moveOrder)
  )
}

/** Sentries of a side: squad leaders up in a trench, the men who watched the wire at night. In squad order. */
function sentries(sim: Simulation, side: Side): number[] {
  return sim.squads
    .filter((squad) => squad.side === side)
    .map((squad) => squad.leader)
    .filter(
      (leader) =>
        isAlive(sim, leader) &&
        !isSheltering(sim, leader) &&
        isInTrench(sim.map, sim.soldiers.position.x[leader], sim.soldiers.position.z[leader])
    )
}

/** The nearest enemy a sentry can hear moving out in front, or -1. */
function heard(sim: Simulation, sentry: number): number {
  const { position, side, stance } = sim.soldiers
  let best = -1
  let bestDistance = Infinity
  for (const other of soldiersNear(sim, position.x[sentry], position.z[sentry], HEARING.walking)) {
    if (side.value[other] === side.value[sentry] || !isAlive(sim, other) || !isMoving(sim, other)) {
      continue
    }
    const distance = Math.sqrt(
      (position.x[other] - position.x[sentry]) ** 2 + (position.z[other] - position.z[sentry]) ** 2
    )
    const hearing = stance.value[other] === Stance.Prone ? HEARING.crawling : HEARING.walking
    if (distance <= hearing && distance < bestDistance) {
      best = other
      bestDistance = distance
    }
  }
  return best
}

function fire(sim: Simulation, sentry: number, x: number, z: number): void {
  const side = sim.soldiers.side.value[sentry] === Side.German ? Side.German : Side.French
  const drift = 0.8
  sim.flares.push({
    side,
    fromX: sim.soldiers.position.x[sentry],
    fromZ: sim.soldiers.position.z[sentry],
    x,
    z,
    vx: sim.wind.x * drift,
    vz: sim.wind.z * drift,
    firedAt: sim.tick,
    burnsOutAt: sim.tick + FLARE.burnSeconds * TICKS_PER_SECOND
  })
  const event: SimEvent = { type: "flare", side, x, z }
  sim.events.push(event)
}

/**
 * Night along the line: sentries send up a flare over anyone they hear moving in front of them, unless a flare already
 * lights them, and now and then over the quiet ground just to look. Burnt-out flares fall away. By day nothing happens
 * and no random numbers are drawn.
 */
export function flareSystem(sim: Simulation): void {
  for (let index = sim.flares.length - 1; index >= 0; index--) {
    if (sim.tick >= sim.flares[index]!.burnsOutAt) {
      sim.flares.splice(index, 1)
    }
  }
  if (sim.tick % CHECK_INTERVAL !== 0 || !isDark(sim)) {
    return
  }
  for (const side of [Side.French, Side.German]) {
    const watching = sentries(sim, side)
    const inAir = () => sim.flares.filter((flare) => flare.side === side).length
    for (const sentry of watching) {
      const enemy = heard(sim, sentry)
      if (enemy < 0 || inAir() >= MAX_IN_AIR) {
        continue
      }
      const x = sim.soldiers.position.x[enemy]
      const z = sim.soldiers.position.z[enemy]
      if (flareLight(sim, x, z) < FLARE.peakLux / 2) {
        fire(sim, sentry, x, z)
      }
    }
    if (watching.length > 0 && inAir() < MAX_IN_AIR && sim.rng.next() < watching.length * ROUTINE_PER_SENTRY_SECOND) {
      const sentry = watching[Math.floor(sim.rng.next() * watching.length)]!
      const out = REACH.min + sim.rng.next() * (REACH.max - REACH.min)
      const across = (sim.rng.next() - 0.5) * 60
      const facingX = sim.soldiers.facing.x[sentry]
      const facingZ = sim.soldiers.facing.z[sentry]
      fire(
        sim,
        sentry,
        sim.soldiers.position.x[sentry] + facingX * out - facingZ * across,
        sim.soldiers.position.z[sentry] + facingZ * out + facingX * across
      )
    }
  }
}
