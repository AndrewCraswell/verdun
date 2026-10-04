import { type EntityId, query, removeComponent } from "bitecs"
import { recoveryFactor } from "../climate.ts"
import { BROKEN_MORALE, PINNED } from "../combat.ts"
import { MaskState, Stance } from "../components.ts"
import { weatherPace } from "../ground.ts"
import { clampToMap, FULL_STAMINA, type Simulation, soldierIds } from "../simulation.ts"
import { CRAWL_FACTOR, CROUCH_FACTOR, isInTrench } from "../stance.ts"
import { climbLimit, groundPace } from "../terrain.ts"
import { wirePace } from "../wire.ts"

/** Walking pace in a gas mask, as a fraction of normal: every breath is drawn through the filter. */
const MASKED_PACE = 0.85
/** Running with 30 kg of kit: a dash at two and a quarter times walking pace, 3.2 m/s on firm ground. */
const RUN_FACTOR = 2.25
/** A spent soldier walks at this fraction of his pace until he has his breath back. */
const SPENT_PACE = 0.75
/** Below this stamina a soldier can't run, and once spent he recovers to it before he walks at full pace again. */
export const WINDED = 25
/**
 * Stamina spent or regained a second. Running costs 1.25 a second, so a rested man runs about a minute on firm ground,
 * some 190 m, and the best part of a minute across a crater field, 60 m or so: enough for a charge across no man's land
 * once the barrage lifts, but not to run all the way from his own trench.
 */
const STAMINA = { run: -1.25, crawl: -1, walk: 2, still: 5, dugout: 8 } as const
/** Climbing out of a trench, over the parapet or up the back wall, costs this much stamina at once. */
const CLIMB_OUT = 15
/**
 * Running across mud, churned ground or uphill costs more breath, by as much as the ground slows him, up to this many
 * times: a little, since the going already slows him. At three times, a crater field winded a man in eight seconds.
 */
const HARD_GOING = 1.25
/** Morale below this (shaken) halves stamina recovery: fear is tiring. */
const SHAKEN_MORALE = 0.6
/**
 * A man in wire goes at the better of its pace where he stands and this many metres ahead: stepping out of a tangle
 * isn't wading through it, and a man who had brushed its edge stood held at a twentieth of his pace for half a minute.
 */
const WIRE_STEP = 0.5
/** Climbing walls prone means getting up on hands and knees: this much slower again. */
const PRONE_CLIMB = 0.5

const Activity = { Walking: 0, Running: 1, Crawling: 2 } as const
type Activity = (typeof Activity)[keyof typeof Activity]
const STAMINA_FOR: Readonly<Record<Activity, number>> = {
  [Activity.Walking]: STAMINA.walk,
  [Activity.Running]: STAMINA.run,
  [Activity.Crawling]: STAMINA.crawl
}
/** Pace at each stance, as a fraction of walking upright. */
const STANCE_PACE: Readonly<Record<number, number>> = {
  [Stance.Prone]: CRAWL_FACTOR,
  [Stance.Crouching]: CROUCH_FACTOR
}

/**
 * Moves soldiers for one step, and spends or restores their breath. Directly steered soldiers walk where the player
 * pushes them, run while the run key is held, crouch-walk or crawl. Soldiers with a move order walk, or run if told to,
 * straight toward the target, face where they walk, and drop the order on arrival; while pinned they go to ground and
 * wait, and men down a dugout stay there. Mud, churned ground and slopes slow everyone, more after days of rain or in
 * deep snow; walls are climbed at a steady rate however hard anyone runs at them; uncut wire all but stops them; and
 * so does breathing through a gas mask. Running costs stamina; a man run out walks slowly until he gets his breath.
 */
export function movementSystem(sim: Simulation, stepSeconds: number): void {
  const { position, speed, moveOrder, facing, steer, stance, suppression, mask, morale, stamina } = sim.soldiers
  const activity = new Map<EntityId, Activity>()
  const strideFor = (soldier: EntityId, dx: number, dz: number, run: boolean): number => {
    const x = position.x[soldier]
    const z = position.z[soldier]
    const posture = stance.value[soldier]
    const running = run && posture === Stance.Standing && canRun(sim, soldier)
    const ground = groundPace(sim.map, x, z, dx, dz)
    const walk =
      speed.value[soldier] *
      (mask.state[soldier] === MaskState.On ? MASKED_PACE : 1) *
      Math.max(wirePace(sim.wire, x, z), wirePace(sim.wire, x + dx * WIRE_STEP, z + dz * WIRE_STEP)) *
      weatherPace(sim, x, z) *
      ground *
      (STANCE_PACE[posture] ?? 1) *
      (stamina.spent[soldier] === 1 ? SPENT_PACE : 1) *
      (running ? RUN_FACTOR : 1)
    const climb = climbLimit(sim.map, x, z, dx, dz) * (posture === Stance.Prone ? PRONE_CLIMB : 1)
    if (running) {
      activity.set(soldier, Activity.Running)
    } else {
      activity.set(soldier, posture === Stance.Prone ? Activity.Crawling : Activity.Walking)
    }
    if (running) {
      // Hard going costs breath as well as pace.
      stamina.value[soldier] += STAMINA.run * stepSeconds * (Math.min(HARD_GOING, 1 / ground) - 1)
    }
    return Math.min(walk, climb) * stepSeconds
  }
  const leftTrench = (soldier: EntityId, wasInTrench: boolean) => {
    if (wasInTrench && !isInTrench(sim.map, position.x[soldier], position.z[soldier])) {
      stamina.value[soldier] -= CLIMB_OUT
    }
  }
  const arrived: EntityId[] = []

  for (const soldier of query(sim.world, [position, steer])) {
    const length = Math.sqrt(steer.x[soldier] ** 2 + steer.z[soldier] ** 2)
    if (!(length > 0)) {
      continue
    }
    const wasInTrench = isInTrench(sim.map, position.x[soldier], position.z[soldier])
    const stride = strideFor(soldier, steer.x[soldier] / length, steer.z[soldier] / length, steer.run[soldier] === 1)
    const next = clampToMap(
      sim,
      position.x[soldier] + steer.x[soldier] * stride,
      position.z[soldier] + steer.z[soldier] * stride
    )
    position.x[soldier] = next.x
    position.z[soldier] = next.z
    leftTrench(soldier, wasInTrench)
  }

  for (const soldier of query(sim.world, [position, moveOrder])) {
    if (suppression.value[soldier] >= PINNED || stance.value[soldier] === Stance.Sheltering) {
      continue
    }
    const dx = moveOrder.x[soldier] - position.x[soldier]
    const dz = moveOrder.z[soldier] - position.z[soldier]
    // Math.sqrt is correctly rounded on every engine; Math.hypot is not, which would break determinism.
    const distance = Math.sqrt(dx * dx + dz * dz)
    const wasInTrench = isInTrench(sim.map, position.x[soldier], position.z[soldier])
    const stride = distance > 0 ? strideFor(soldier, dx / distance, dz / distance, moveOrder.run[soldier] === 1) : 0

    if (distance <= stride) {
      position.x[soldier] = moveOrder.x[soldier]
      position.z[soldier] = moveOrder.z[soldier]
      arrived.push(soldier)
    } else {
      position.x[soldier] += (dx / distance) * stride
      position.z[soldier] += (dz / distance) * stride
    }
    if (distance > 0) {
      facing.x[soldier] = dx / distance
      facing.z[soldier] = dz / distance
    }
    leftTrench(soldier, wasInTrench)
  }

  // Removing components while iterating a query would skip entities, so orders are cleared afterwards.
  for (const soldier of arrived) {
    removeComponent(sim.world, soldier, moveOrder)
  }

  const recovery = recoveryFactor(sim)
  for (const soldier of soldierIds(sim)) {
    const doing = activity.get(soldier)
    let change: number
    if (doing !== undefined) {
      change = STAMINA_FOR[doing]
    } else {
      change = stance.value[soldier] === Stance.Sheltering ? STAMINA.dugout : STAMINA.still
    }
    if (change > 0) {
      // Breathing through a mask is hard work, and so is being afraid; cold and heat wear men down (climate.ts).
      change *=
        (mask.state[soldier] === MaskState.On ? 0.5 : 1) * (morale.value[soldier] < SHAKEN_MORALE ? 0.5 : 1) * recovery
    }
    const value = Math.min(FULL_STAMINA, Math.max(0, stamina.value[soldier] + change * stepSeconds))
    stamina.value[soldier] = value
    if (value <= 0) {
      stamina.spent[soldier] = 1
    } else if (value >= WINDED) {
      stamina.spent[soldier] = 0
    }
  }
}

/** Whether a soldier has the breath and the nerve to run: broken men can't, nor can the winded. */
export function canRun(sim: Simulation, soldier: EntityId): boolean {
  return (
    sim.soldiers.stamina.spent[soldier] === 0 &&
    sim.soldiers.stamina.value[soldier] >= WINDED &&
    sim.soldiers.morale.value[soldier] >= BROKEN_MORALE
  )
}
