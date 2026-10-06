import {
  type BeatenZone,
  beatenZone,
  type FireMissionPlan,
  fireMissionAt,
  gasShootAt,
  isAlive,
  SHELLS,
  type Side,
  type Simulation,
  soldierIds
} from "@verdun/sim"
import { grownZone, inZone, shiftedZone } from "./beaten-zone.ts"

/**
 * A call for fire before it's made (H10 in docs/design/interface.md): while V or X is held, where the shells would fall
 * round the pointer, how long they'd take to come and how long they'd fire, and whether any of our men are in the
 * beaten zone. The plan is the simulation's own (fireMissionAt, gasShootAt), and the ground drawn is its beaten zone,
 * spread and all, so the preview is where they will fall.
 */

export type CallKind = "fire" | "gas"

export interface CallPreview {
  readonly kind: CallKind
  /** The ground nine rounds in ten fall on: a circle for a call for fire on a point, a box for a gas shoot. */
  readonly zone: BeatenZone
  /** How far beyond that ground a burst can still kill a man in the open, in metres. */
  readonly reach: number
  /** Seconds until the first rounds land, and seconds of fire after. */
  readonly delay: number
  readonly duration: number
  /** Our men inside the beaten zone, or near enough to it to be hit; for gas, under its drift too. */
  readonly ourMen: number
  /**
   * For gas, how far the wind carries the cloud by the time the shoot ends, in metres east and north: the cloud lies
   * this far downwind of where the shells burst. Nothing for high explosive.
   */
  readonly drift: { readonly x: number; readonly z: number }
}

/** Gas drifts from where its shells burst: men this far outside the area are in it too, in metres. */
const GAS_DRIFT = 15

const PLANS: Readonly<Record<CallKind, (side: Side, x: number, z: number) => FireMissionPlan>> = {
  fire: fireMissionAt,
  gas: gasShootAt
}

/** How far outside a plan's ground its fire reaches a man in the open. */
function reachOf(plan: FireMissionPlan, kind: CallKind): number {
  return kind === "gas" ? GAS_DRIFT : SHELLS[plan.shell].lethalExposed
}

/** Steps along the drift at which gas's swept ground is looked at for our men. */
const DRIFT_STEPS = 8

/**
 * The men of a side alive inside a beaten zone, its reach included, and for gas anywhere along its drift: the zone swept
 * downwind by `drift`.
 */
export function menInBeatenZone(
  sim: Simulation,
  side: Side,
  zone: BeatenZone,
  reach: number,
  drift: { readonly x: number; readonly z: number } = { x: 0, z: 0 }
): number {
  const { x, z } = sim.soldiers.position
  const grown = grownZone(zone, reach)
  const steps = drift.x === 0 && drift.z === 0 ? 0 : DRIFT_STEPS
  const swept = Array.from({ length: steps + 1 }, (_, step) =>
    shiftedZone(grown, (drift.x * step) / Math.max(1, steps), (drift.z * step) / Math.max(1, steps))
  )
  let count = 0
  for (const soldier of soldierIds(sim)) {
    if (sim.soldiers.side.value[soldier] !== side || !isAlive(sim, soldier)) {
      continue
    }
    if (swept.some((part) => inZone(part, x[soldier], z[soldier]))) {
      count++
    }
  }
  return count
}

/** The call a side would make at a point, and what it would do there. */
export function callPreview(sim: Simulation, side: Side, kind: CallKind, at: { x: number; z: number }): CallPreview {
  const plan = PLANS[kind](side, at.x, at.z)
  const reach = reachOf(plan, kind)
  // Gas goes where the wind takes it: the first shells' cloud has travelled this far by the time the last burst.
  const carried = kind === "gas" ? plan.duration : 0
  const drift = { x: sim.wind.x * carried, z: sim.wind.z * carried }
  const zone = beatenZone(plan)
  return {
    kind,
    zone,
    reach,
    delay: plan.delay,
    duration: plan.duration,
    ourMen: menInBeatenZone(sim, side, zone, reach, drift),
    drift
  }
}

/** Whether calling there would put our own men under it: the call then wants a second press. */
export function callEndangers(sim: Simulation, side: Side, kind: CallKind, at: { x: number; z: number }): boolean {
  return callPreview(sim, side, kind, at).ourMen > 0
}
