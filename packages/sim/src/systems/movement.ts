import { type EntityId, hasComponent, query, removeComponent } from "bitecs"
import { canBeShoved, clearOfScenery, Climbing, wayAhead } from "../body.ts"
import { recoveryFactor } from "../climate.ts"
import { BROKEN_MORALE, PINNED } from "../combat.ts"
import { MaskState, Stance } from "../components.ts"
import { weatherPace } from "../ground.ts"
import { clampToMap, FULL_STAMINA, type Simulation, soldierIds } from "../simulation.ts"
import { soldiersNear } from "../spatial.ts"
import { CRAWL_FACTOR, CROUCH_FACTOR, isInTrench } from "../stance.ts"
import { climbLimit, groundPace } from "../terrain.ts"
import { vaultPace } from "../vault.ts"
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

/** How far a soldier gets in a step heading along (dx, dz), a unit vector, and whether he's running and over what. */
interface Pace {
  readonly stride: number
  readonly running: boolean
  /** The ground's pace under him (`groundPace`): below 1 for mud, churned ground and slopes. */
  readonly ground: number
}

function paceOf(sim: Simulation, soldier: EntityId, dx: number, dz: number, run: boolean, stepSeconds: number): Pace {
  const { position, speed, stance, mask, stamina } = sim.soldiers
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
  return { stride: Math.min(walk, climb) * stepSeconds, running, ground }
}

/** A player's steering: a direction on the ground plane, whose length (up to 1) is the fraction of walking pace. */
export interface Steering {
  readonly x: number
  readonly z: number
  readonly run: boolean
}

/**
 * Where a soldier steered by a player gets to in one step, without taking it: the movement system's own arithmetic, so a
 * client can move the soldier its player controls before the server's word comes back (client-side prediction), and
 * land where the server will. The caller leaves out a man climbing a fence, who goes over whatever the steering.
 */
export function steeredPosition(
  sim: Simulation,
  soldier: EntityId,
  steering: Steering,
  stepSeconds: number
): { readonly x: number; readonly z: number } {
  const { x, z } = sim.soldiers.position
  // Steering as the `steer` command keeps it: no longer than 1, in the steer component's 32-bit floats.
  const given = Math.sqrt(steering.x * steering.x + steering.z * steering.z)
  if (!(given > 0)) {
    return { x: x[soldier], z: z[soldier] }
  }
  const scale = given > 1 ? 1 / given : 1
  const sx = Math.fround(steering.x * scale)
  const sz = Math.fround(steering.z * scale)
  const length = Math.sqrt(sx * sx + sz * sz)
  const { x: toX, z: toZ } = stepAlong(
    sim,
    soldier,
    sx / length,
    sz / length,
    length,
    steering.run,
    stepSeconds,
    Climbing.Steered
  )
  return { x: toX, z: toZ }
}

/** A step a soldier takes: where it gets him, how it went, and the way he went (a unit vector). */
interface Step {
  readonly x: number
  readonly z: number
  /** His pace along the way he went, or null where a wall or a corner stopped him. */
  readonly pace: Pace | null
  readonly stride: number
  readonly wayX: number
  readonly wayZ: number
  /** Whether he went the way he meant to, with nothing turning him along a wall. */
  readonly straight: boolean
}

/**
 * Where a soldier gets to in a step heading along (dx, dz), a unit vector, at `share` of his pace (a player's steering
 * can ask for less than all of it): along any wall or ledge in his way he won't climb (body.ts), and round any scenery
 * he can't walk through. Takes nothing; the movement system and a client's prediction share it, so they agree.
 */
function stepAlong(
  sim: Simulation,
  soldier: EntityId,
  dx: number,
  dz: number,
  share: number,
  run: boolean,
  stepSeconds: number,
  climbing: Climbing
): Step {
  const x = sim.soldiers.position.x[soldier]
  const z = sim.soldiers.position.z[soldier]
  const meant = paceOf(sim, soldier, dx, dz, run, stepSeconds)
  const way = wayAhead(sim.map, x, z, dx, dz, meant.stride * share, climbing)
  const kept = Math.sqrt(way.x * way.x + way.z * way.z)
  if (!(kept > 1e-6)) {
    return { x, z, pace: null, stride: 0, wayX: dx, wayZ: dz, straight: false }
  }
  const straight = way.x === dx && way.z === dz
  const wayX = straight ? dx : way.x / kept
  const wayZ = straight ? dz : way.z / kept
  const pace = straight ? meant : paceOf(sim, soldier, wayX, wayZ, run, stepSeconds)
  const stride = pace.stride * kept * share
  const clear = clearOfScenery(sim.map, x + wayX * stride, z + wayZ * stride)
  const next = clampToMap(sim, clear.x, clear.z)
  return { x: next.x, z: next.z, pace, stride, wayX, wayZ, straight }
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
  const { position, moveOrder, facing, steer, stance, suppression, mask, morale, stamina, vault } = sim.soldiers
  const activity = new Map<EntityId, Activity>()
  /** Notes what a man did this step, for his breath: walked, ran, crawled, or nothing, stopped by a wall. */
  const went = (soldier: EntityId, pace: Pace | null): void => {
    if (!pace) {
      return
    }
    if (pace.running) {
      activity.set(soldier, Activity.Running)
      // Hard going costs breath as well as pace.
      stamina.value[soldier] += STAMINA.run * stepSeconds * (Math.min(HARD_GOING, 1 / pace.ground) - 1)
    } else {
      activity.set(soldier, stance.value[soldier] === Stance.Prone ? Activity.Crawling : Activity.Walking)
    }
  }
  const leftTrench = (soldier: EntityId, wasInTrench: boolean) => {
    if (wasInTrench && !isInTrench(sim.map, position.x[soldier], position.z[soldier])) {
      stamina.value[soldier] -= CLIMB_OUT
    }
  }
  const arrived: EntityId[] = []
  const landed: EntityId[] = []

  // Climbing a fence: straight over at the climb's pace, whatever the wire, the steering or his orders.
  for (const soldier of query(sim.world, [position, vault])) {
    const dx = vault.x[soldier] - position.x[soldier]
    const dz = vault.z[soldier] - position.z[soldier]
    const distance = Math.sqrt(dx * dx + dz * dz)
    const stride = vaultPace(sim, position.x[soldier], position.z[soldier]) * stepSeconds
    activity.set(soldier, Activity.Walking)
    if (distance <= stride) {
      position.x[soldier] = vault.x[soldier]
      position.z[soldier] = vault.z[soldier]
      landed.push(soldier)
      continue
    }
    position.x[soldier] += (dx / distance) * stride
    position.z[soldier] += (dz / distance) * stride
    facing.x[soldier] = dx / distance
    facing.z[soldier] = dz / distance
  }

  for (const soldier of query(sim.world, [position, steer])) {
    if (hasComponent(sim.world, soldier, vault)) {
      continue
    }
    const length = Math.sqrt(steer.x[soldier] ** 2 + steer.z[soldier] ** 2)
    if (!(length > 0)) {
      continue
    }
    const wasInTrench = isInTrench(sim.map, position.x[soldier], position.z[soldier])
    const step = stepAlong(
      sim,
      soldier,
      steer.x[soldier] / length,
      steer.z[soldier] / length,
      length,
      steer.run[soldier] === 1,
      stepSeconds,
      Climbing.Steered
    )
    went(soldier, step.pace)
    position.x[soldier] = step.x
    position.z[soldier] = step.z
    leftTrench(soldier, wasInTrench)
  }

  for (const soldier of query(sim.world, [position, moveOrder])) {
    if (
      suppression.value[soldier] >= PINNED ||
      stance.value[soldier] === Stance.Sheltering ||
      hasComponent(sim.world, soldier, vault)
    ) {
      continue
    }
    const dx = moveOrder.x[soldier] - position.x[soldier]
    const dz = moveOrder.z[soldier] - position.z[soldier]
    // Math.sqrt is correctly rounded on every engine; Math.hypot is not, which would break determinism.
    const distance = Math.sqrt(dx * dx + dz * dz)
    const wasInTrench = isInTrench(sim.map, position.x[soldier], position.z[soldier])
    const step =
      distance > 0
        ? stepAlong(
            sim,
            soldier,
            dx / distance,
            dz / distance,
            1,
            moveOrder.run[soldier] === 1,
            stepSeconds,
            Climbing.Ordered
          )
        : null
    went(soldier, step?.pace ?? null)

    if (!step || (step.straight && distance <= step.stride)) {
      position.x[soldier] = moveOrder.x[soldier]
      position.z[soldier] = moveOrder.z[soldier]
      arrived.push(soldier)
    } else {
      position.x[soldier] = step.x
      position.z[soldier] = step.z
    }
    if (step) {
      // The way he walks: along a wall that turns him, not into it.
      facing.x[soldier] = step.wayX
      facing.z[soldier] = step.wayZ
    }
    leftTrench(soldier, wasInTrench)
  }

  // Removing components while iterating a query would skip entities, so orders are cleared afterwards.
  for (const soldier of arrived) {
    removeComponent(sim.world, soldier, moveOrder)
  }
  for (const soldier of landed) {
    removeComponent(sim.world, soldier, vault)
  }
  makeRoom(sim)

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

/** Men keep at least this far apart, in metres: shoulder to shoulder, not one inside another. */
const ROOM = 0.6
/** The share of the overlap made up each step: men ease apart over a few steps rather than jump. */
const EASE_APART = 0.3

/**
 * Men standing closer than `ROOM` ease apart, so a squad sent into one shell hole spreads round it and a file in a
 * trench doesn't walk through itself. A player's man is never shoved: the bot steps aside. Nobody is shoved up a wall or
 * into a ruin, and men down a dugout or climbing a fence are left alone. Pairs are taken in id order, so it's the same
 * every time.
 */
function makeRoom(sim: Simulation): void {
  const { position, stance, vault } = sim.soldiers
  const steered = new Set<EntityId>()
  for (const squad of sim.squads) {
    if (squad.controller === "player" && squad.leader >= 0) {
      steered.add(squad.leader)
    }
  }
  const settled = (soldier: EntityId) =>
    stance.value[soldier] === Stance.Sheltering || hasComponent(sim.world, soldier, vault)
  for (const soldier of soldierIds(sim)) {
    if (settled(soldier)) {
      continue
    }
    for (const other of soldiersNear(sim, position.x[soldier], position.z[soldier], ROOM)) {
      if (other <= soldier || settled(other) || !isFighting(sim, other)) {
        continue
      }
      let dx = position.x[other] - position.x[soldier]
      let dz = position.z[other] - position.z[soldier]
      let distance = Math.sqrt(dx * dx + dz * dz)
      if (distance >= ROOM) {
        continue
      }
      if (distance < 1e-6) {
        // On the very spot: apart east and west, the same way every time.
        dx = 1
        dz = 0
        distance = 1
        position.x[other] += 1e-3
      }
      const push = (ROOM - Math.min(distance, ROOM)) * EASE_APART
      // The share of the shove the first man takes: none if a player steers him, all of it if the other is steered.
      let share = 0.5
      if (steered.has(soldier)) {
        share = 0
      } else if (steered.has(other)) {
        share = 1
      }
      shove(sim, soldier, (-dx / distance) * push * share, (-dz / distance) * push * share)
      shove(sim, other, (dx / distance) * push * (1 - share), (dz / distance) * push * (1 - share))
    }
  }
}

/** Whether a soldier is still in the fight: neither fallen nor taken. */
function isFighting(sim: Simulation, soldier: EntityId): boolean {
  return (
    !hasComponent(sim.world, soldier, sim.soldiers.dead) && !hasComponent(sim.world, soldier, sim.soldiers.captured)
  )
}

/** Moves a man by a little, unless that would put him up a wall or in a ruin. */
function shove(sim: Simulation, soldier: EntityId, dx: number, dz: number): void {
  if (dx === 0 && dz === 0) {
    return
  }
  const { position } = sim.soldiers
  const x = position.x[soldier]
  const z = position.z[soldier]
  const to = clampToMap(sim, x + dx, z + dz)
  if (canBeShoved(sim.map, x, z, to.x, to.z)) {
    position.x[soldier] = to.x
    position.z[soldier] = to.z
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
