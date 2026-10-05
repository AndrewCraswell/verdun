import {
  type FireMissionPlan,
  fireMissionAt,
  gasShootAt,
  isAlive,
  SHELLS,
  type Side,
  type Simulation,
  soldierIds
} from "@verdun/sim"

/**
 * A call for fire before it's made (H10 in docs/design/interface.md): while V or X is held, where the shells would fall
 * round the pointer, how long they'd take to come and how long they'd fire, and whether any of our men are in the
 * beaten zone. The plan is the simulation's own (fireMissionAt, gasShootAt), so the preview is where they will fall.
 */

export type CallKind = "fire" | "gas"

export interface CallPreview {
  readonly kind: CallKind
  /** The ground the rounds fall on, as its corners: west and east, near and far. */
  readonly fromX: number
  readonly toX: number
  readonly nearZ: number
  readonly farZ: number
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

/**
 * The men of a side alive inside a plan's beaten zone, its reach included, and for gas anywhere along its drift: the
 * zone swept downwind by `drift`.
 */
export function menInBeatenZone(
  sim: Simulation,
  side: Side,
  plan: FireMissionPlan,
  reach: number,
  drift: { readonly x: number; readonly z: number } = { x: 0, z: 0 }
): number {
  const { x, z } = sim.soldiers.position
  const half = plan.band / 2
  const west = plan.fromX - reach + Math.min(0, drift.x)
  const east = plan.toX + reach + Math.max(0, drift.x)
  const south = plan.z - half - reach + Math.min(0, drift.z)
  const north = plan.z + half + reach + Math.max(0, drift.z)
  let count = 0
  for (const soldier of soldierIds(sim)) {
    if (sim.soldiers.side.value[soldier] !== side || !isAlive(sim, soldier)) {
      continue
    }
    if (x[soldier] >= west && x[soldier] <= east && z[soldier] >= south && z[soldier] <= north) {
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
  return {
    kind,
    fromX: plan.fromX,
    toX: plan.toX,
    nearZ: plan.z - plan.band / 2,
    farZ: plan.z + plan.band / 2,
    reach,
    delay: plan.delay,
    duration: plan.duration,
    ourMen: menInBeatenZone(sim, side, plan, reach, drift),
    drift
  }
}

/** Whether calling there would put our own men under it: the call then wants a second press. */
export function callEndangers(sim: Simulation, side: Side, kind: CallKind, at: { x: number; z: number }): boolean {
  return callPreview(sim, side, kind, at).ourMen > 0
}
