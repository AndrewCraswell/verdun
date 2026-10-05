import { hasComponent } from "bitecs"
import { Side, Stance } from "./components.ts"
import type { SimEvent, Simulation } from "./simulation.ts"
import { soldiersNear } from "./spatial.ts"
import { isAlive } from "./squads.ts"
import { isInTrench, isSheltering } from "./stance.ts"

/**
 * A Very light (Verey light): a flare shot from a pistol over no man's land. Both armies fired them all night to see
 * what was moving in front of the wire: a hard white glare drifting down on its parachute, under which anything
 * standing could be seen and shot, and anyone caught in the open froze or dropped flat.
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

/**
 * How a flare flies and burns. Fired from a pistol at a steep angle, it climbs to about 90 m in three seconds, slowing
 * all the way as gravity and the air take its speed; at the top a small parachute opens, and it sinks at under 4 m/s,
 * carried by the wind aloft and burning with a hard white magnesium light until a few metres up, when it sputters and
 * goes out. About 26 seconds from shot to darkness.
 */
export const FLARE = {
  riseSeconds: 3,
  height: 90,
  sinkRate: 3.6,
  /** The wind aloft carries the parachute faster than the wind men feel on the ground. */
  drift: 1.2,
  burnSeconds: 26,
  /** Seconds the flare takes to catch, and to sputter out at the end. */
  igniteSeconds: 0.3,
  sputterSeconds: 4.5,
  /** Luminous intensity burning steadily, in candela: a magnesium star of a few tens of thousands. */
  candela: 25_000,
  /** Ground light below this many lux is left out: no use to the eye beside the dark. */
  faintest: 0.01
} as const

/** Below this much light on the ground, in lux, it is dark enough to send up flares: past civil twilight. */
export const DARK_LUX = 3
/** A point lit this brightly by flares needs no new flare over it, in lux. */
const ALREADY_LIT = 1
/** How far sentries fire flares out in front of them, in metres, and how far either side. */
const REACH = { min: 60, max: 160, across: 40 } as const
/** How far a sentry hears men moving in front of him, in metres; men crawling, much closer. */
const HEARING = { walking: 150, crawling: 40 } as const
/**
 * Seconds between a side's flares through the night, on average: a quiet line keeps a flare up now and then; a nervous
 * one, after shots or with men heard out in front, keeps the ground lit. Never closer than `gap` seconds, except over
 * men heard moving. A line is nervous for `nervousAfter` seconds after any of its men fires.
 */
const CADENCE = { quiet: 40, nervous: 12, gap: 8, nervousAfter: 30 } as const
/** At most this many of a side's flares in the air at once. */
const MAX_IN_AIR = 5
/** Sentries look and listen this often, in ticks: once a second. */
const CHECK_INTERVAL = 20
const TICKS_PER_SECOND = 20

/** A flare's place at a tick (fractional ticks for smooth drawing): `y` is its height above the ground, in metres. */
export function flarePosition(flare: Flare, tick: number): { x: number; y: number; z: number } {
  const age = Math.max(0, (tick - flare.firedAt) / TICKS_PER_SECOND)
  if (age < FLARE.riseSeconds) {
    // Slowing all the way up, as if under gravity and drag: fastest leaving the pistol, still at the top.
    const along = 1 - (1 - age / FLARE.riseSeconds) ** 2
    return {
      x: flare.fromX + (flare.x - flare.fromX) * along,
      y: FLARE.height * along,
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

/**
 * How brightly a flare burns at a tick, from 0 to 1: catching as it leaves the pistol, burning steadily, then
 * sputtering out over its last seconds. Steady here; the renderer adds the flicker.
 */
export function flareBrightness(flare: Flare, tick: number): number {
  const age = (tick - flare.firedAt) / TICKS_PER_SECOND
  const left = (flare.burnsOutAt - tick) / TICKS_PER_SECOND
  if (age < 0 || left <= 0) {
    return 0
  }
  const caught = Math.min(1, 0.4 + (0.6 * age) / FLARE.igniteSeconds)
  const sputter = Math.min(1, left / FLARE.sputterSeconds) ** 0.7
  return caught * sputter
}

/**
 * Light flares add to a ground point now, in lux: each flare's intensity times the cosine of its height over the
 * distance cubed, the inverse-square law on level ground. A high flare lights a wide pool dimly; as it sinks the pool
 * shrinks and brightens.
 */
export function flareLight(sim: Simulation, x: number, z: number): number {
  let lux = 0
  for (const flare of sim.flares) {
    const brightness = flareBrightness(flare, sim.tick)
    if (brightness <= 0) {
      continue
    }
    const at = flarePosition(flare, sim.tick)
    const height = Math.max(1, at.y)
    const squared = (at.x - x) ** 2 + (at.z - z) ** 2 + height * height
    const lit = (FLARE.candela * brightness * height) / (squared * Math.sqrt(squared))
    if (lit >= FLARE.faintest) {
      lux += lit
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

/**
 * Sends a flare up now from one ground point to hang over another: a sentry's, or a dev tool's by the `flare` command,
 * which pnpm perf uses to light the same ground on every run.
 */
export function sendUpFlare(sim: Simulation, side: Side, fromX: number, fromZ: number, x: number, z: number): void {
  sim.flares.push({
    side,
    fromX,
    fromZ,
    x,
    z,
    vx: sim.wind.x * FLARE.drift,
    vz: sim.wind.z * FLARE.drift,
    firedAt: sim.tick,
    burnsOutAt: sim.tick + FLARE.burnSeconds * TICKS_PER_SECOND
  })
  const event: SimEvent = { type: "flare", side, x, z }
  sim.events.push(event)
}

function fire(sim: Simulation, sentry: number, x: number, z: number): void {
  const side = sim.soldiers.side.value[sentry] === Side.German ? Side.German : Side.French
  sendUpFlare(sim, side, sim.soldiers.position.x[sentry], sim.soldiers.position.z[sentry], x, z)
}

/** Whether a side's line is nervous: men heard out in front, or shots fired from it lately. */
function isNervous(sim: Simulation, side: Side, heardAny: boolean): boolean {
  if (heardAny) {
    return true
  }
  const recently = sim.tick - CADENCE.nervousAfter * TICKS_PER_SECOND
  return sim.squads.some(
    (squad) => squad.side === side && squad.members.some((member) => sim.soldiers.weapon.firedAt[member] >= recently)
  )
}

/** Sends a flare up over the ground in front of a sentry chosen at random: the night's routine watch on the wire. */
function watchTheWire(sim: Simulation, watching: readonly number[]): void {
  const sentry = watching[Math.floor(sim.rng.next() * watching.length)]!
  const out = REACH.min + sim.rng.next() * (REACH.max - REACH.min)
  const across = (sim.rng.next() * 2 - 1) * REACH.across
  const facingX = sim.soldiers.facing.x[sentry]
  const facingZ = sim.soldiers.facing.z[sentry]
  fire(
    sim,
    sentry,
    sim.soldiers.position.x[sentry] + facingX * out - facingZ * across,
    sim.soldiers.position.z[sentry] + facingZ * out + facingX * across
  )
}

/**
 * Night along the line. Each second, each side's sentries listen: a sentry who hears men moving in front of the wire
 * sends a flare up over them, unless one already lights them. Between times each side keeps a flare going up at
 * intervals, about every 40 seconds on a quiet night and every 12 when the line is nervous, never two within 8 seconds.
 * Burnt-out flares fall away. By day nothing happens and no random numbers are drawn.
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
    if (watching.length === 0) {
      continue
    }
    const ours = () => sim.flares.filter((flare) => flare.side === side)
    let heardAny = false
    for (const sentry of watching) {
      const enemy = heard(sim, sentry)
      if (enemy < 0) {
        continue
      }
      heardAny = true
      const x = sim.soldiers.position.x[enemy]
      const z = sim.soldiers.position.z[enemy]
      if (ours().length < MAX_IN_AIR && flareLight(sim, x, z) < ALREADY_LIT) {
        fire(sim, sentry, x, z)
      }
    }
    const latest = Math.max(-Infinity, ...ours().map((flare) => flare.firedAt))
    const spaced = sim.tick - latest >= CADENCE.gap * TICKS_PER_SECOND
    const interval = isNervous(sim, side, heardAny) ? CADENCE.nervous : CADENCE.quiet
    if (spaced && ours().length < MAX_IN_AIR && sim.rng.next() < 1 / interval) {
      watchTheWire(sim, watching)
    }
  }
}
