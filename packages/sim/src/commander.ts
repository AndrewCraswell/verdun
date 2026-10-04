import { mapWidth } from "@verdun/map"
import { frontLineZ, Shell } from "./artillery.ts"
import { applyCommand } from "./commands.ts"
import { Side } from "./components.ts"
import { type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"

/**
 * Each side's commander takes stock of its front line this often, in seconds. Kept in seconds and converted where
 * used: this module and simulation.ts import each other, so simulation.ts's constants aren't ready at load time.
 */
const CHECK_SECONDS = 5
/** The front line is lost once at least this many enemies are in it... */
const LOST_ENEMIES = 8
/** ...outnumbering what's left of its garrison by this much. */
const LOST_RATIO = 3
/** Soldiers within this distance of the front line's z hold it, in metres: its bays, traverses and the ground around. */
const FRONT_BAND = 15
/**
 * Seconds from losing the front line to counter-attacking it. German doctrine at Verdun was the immediate counter-attack
 * (Gegenstoß) by the reserves close behind, before the attackers could dig in: runners back, the reserves formed up,
 * the guns laid on the lost trench. Minutes, not hours.
 */
export const COUNTER_ATTACK_DELAY = 180
/** The counter-attack goes in behind its own creeping barrage, as the attack did. */
const COUNTER_BARRAGE = { openAhead: 70, lift: 50, interval: 90, standoff: 70, roundsPerMinute: 120, standing: 40 }
/**
 * Before the reserves go in, the guns pound the lost trench for this long, in seconds, with field guns and heavies at
 * these rates: the attackers in it are as exposed now as its garrison was.
 */
const PREPARATION = { seconds: 120, fieldRoundsPerMinute: 120, heavyRoundsPerMinute: 24 } as const

/** What a side's commander has done about its front line. */
export interface CommanderState {
  /** The step the front line was found lost, or -1. */
  lostAt: number
  /** The step the counter-attack began, with the guns shelling the lost trench, or -1. */
  counterAttackedAt: number
  /** The step the reserves leave their dugouts and go in, or -1 once they have (or before it's planned). */
  assaultAt: number
}

/** A counter-attack going in, for renderers and battle reports. */
export interface CounterAttackEvent {
  readonly type: "counter-attack"
  readonly side: Side
}

export function createCommanders(): Record<Side, CommanderState> {
  return {
    [Side.French]: { lostAt: -1, counterAttackedAt: -1, assaultAt: -1 },
    [Side.German]: { lostAt: -1, counterAttackedAt: -1, assaultAt: -1 }
  }
}

/** Whether the enemy holds a side's front line: enough of them in it, and few of its own men left. */
function frontLost(sim: Simulation, side: Side, frontZ: number): boolean {
  let own = 0
  let enemies = 0
  for (const soldier of soldierIds(sim)) {
    if (Math.abs(sim.soldiers.position.z[soldier] - frontZ) > FRONT_BAND) {
      continue
    }
    if (sim.soldiers.side.value[soldier] === side) {
      own++
    } else {
      enemies++
    }
  }
  return enemies >= LOST_ENEMIES && enemies >= own * LOST_RATIO
}

function reservesOf(sim: Simulation, side: Side) {
  return sim.squads.filter((squad) => squad.side === side && squad.order.kind === "reserve" && squad.leader >= 0)
}

/** Opens the counter-attack: the guns pound the lost trench while the reserves wait below. */
function prepareCounterAttack(sim: Simulation, side: Side, frontZ: number): void {
  const lostTrench = {
    side,
    fromX: 0,
    toX: mapWidth(sim.map),
    z: frontZ,
    band: 20,
    delay: 0,
    duration: PREPARATION.seconds
  }
  applyCommand(sim, {
    type: "fire-mission",
    plan: { ...lostTrench, shell: Shell.FieldHighExplosive, roundsPerMinute: PREPARATION.fieldRoundsPerMinute }
  })
  applyCommand(sim, {
    type: "fire-mission",
    plan: { ...lostTrench, shell: Shell.HeavyHighExplosive, roundsPerMinute: PREPARATION.heavyRoundsPerMinute }
  })
  sim.events.push({ type: "counter-attack", side })
}

/** Sends a side's reserves out of their dugouts to retake its lost front line behind a creeping barrage. */
function assault(sim: Simulation, side: Side, frontZ: number): void {
  const reserves = reservesOf(sim, side)
  if (reserves.length === 0) {
    return
  }
  const towardEnemy = side === Side.French ? 1 : -1
  const reserveZ = reserves.reduce((sum, squad) => sum + sim.soldiers.position.z[squad.leader], 0) / reserves.length
  const toFront = Math.abs(frontZ - reserveZ)
  applyCommand(sim, {
    type: "barrage-attack",
    side,
    fromX: 0,
    toX: mapWidth(sim.map),
    startZ: reserveZ + towardEnemy * Math.min(COUNTER_BARRAGE.openAhead, toFront),
    objectiveZ: frontZ,
    roundsPerMinute: COUNTER_BARRAGE.roundsPerMinute,
    lift: COUNTER_BARRAGE.lift,
    interval: COUNTER_BARRAGE.interval,
    standoff: COUNTER_BARRAGE.standoff,
    delay: 0,
    standingRoundsPerMinute: COUNTER_BARRAGE.standing,
    squads: reserves.map((squad) => squad.id)
  })
}

/**
 * The commanders on both sides, every few seconds: a side that finds its front line lost sends its reserves to retake
 * it once they've had time to organise, after two minutes of shelling it. One counter-attack per side.
 */
export function commanderSystem(sim: Simulation): void {
  if (sim.tick % (CHECK_SECONDS * TICK_RATE) !== 0) {
    return
  }
  for (const side of [Side.French, Side.German]) {
    const state = sim.commanders[side]
    const frontZ = frontLineZ(sim.map.trenches, side)
    if (frontZ === null) {
      continue
    }
    if (state.assaultAt >= 0 && sim.tick >= state.assaultAt) {
      state.assaultAt = -1
      assault(sim, side, frontZ)
      continue
    }
    if (state.counterAttackedAt >= 0) {
      continue
    }
    if (state.lostAt < 0) {
      if (frontLost(sim, side, frontZ)) {
        state.lostAt = sim.tick
      }
      continue
    }
    if (sim.tick - state.lostAt >= COUNTER_ATTACK_DELAY * TICK_RATE && reservesOf(sim, side).length > 0) {
      state.counterAttackedAt = sim.tick
      state.assaultAt = sim.tick + PREPARATION.seconds * TICK_RATE
      prepareCounterAttack(sim, side, frontZ)
    }
  }
}
