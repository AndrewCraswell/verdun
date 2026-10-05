import { mapWidth } from "@verdun/map"
import { frontLineSpan, frontLineZ, type LineSpan, Shell } from "./artillery.ts"
import { Weapon } from "./combat.ts"
import { frontLost } from "./commander.ts"
import { Side } from "./components.ts"
import { enqueueCommand, type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"
import type { CasualtyKind } from "./wounds.ts"

/**
 * Creeping barrage timing, after French practice at Verdun in late 1916: the barrage opens 70 m out as the infantry go
 * over, then lifts 50 m every 90 s; the infantry keep about 70 m behind it, close enough to be on the enemy's parapet
 * before the garrison is up, far enough that few of their own shells fall among them.
 */
export const CREEPING_BARRAGE = {
  openAhead: 70,
  lift: 50,
  interval: 90,
  standoff: 70,
  // About one field gun per 15-20 m of front, firing 3-4 rounds a minute.
  roundsPerMinute: 150,
  // A standing barrage keeps the enemy trench's garrison down their dugouts until the creeping barrage arrives.
  standingRoundsPerMinute: 60
} as const

/**
 * Where the enemy's wire belts lie in front of its front line, in metres (their middle, and how deep they run), and
 * how hard the field guns work at cutting them. Cutting wire took days of fire and tens of thousands of shells; this
 * two-minute bombardment stands for the end of that, so it fires at the rate that does days' worth of cutting.
 */
const WIRE_BELTS = { middle: 30, depth: 30, roundsPerMinute: 600 } as const

/** Seconds each preparatory bombardment takes, with its 5 s delay and the shells still in the air when it ends. */
export const BOMBARDMENT_SECONDS = 130

/** Both front lines as seen from one side: how deep each runs, and the enemy's middle. */
function lines(sim: Simulation, side: Side): { own: LineSpan; enemy: LineSpan; enemyMiddle: number } | null {
  const enemySide = side === Side.French ? Side.German : Side.French
  const own = frontLineSpan(sim.map.trenches, side)
  const enemy = frontLineSpan(sim.map.trenches, enemySide)
  const enemyMiddle = frontLineZ(sim.map.trenches, enemySide)
  return own === null || enemy === null || enemyMiddle === null ? null : { own, enemy, enemyMiddle }
}

/** The whistle: the whole side goes over the top behind a creeping barrage, which opens at once. */
export function attackBehindBarrage(sim: Simulation, side: Side): void {
  const front = lines(sim, side)
  if (!front) {
    return
  }
  const direction = Math.sign(front.enemy.forward - front.own.forward)
  enqueueCommand(sim, {
    type: "barrage-attack",
    side,
    fromX: 0,
    toX: mapWidth(sim.map),
    // Opens ahead of our own most forward bays; the objective is the whole depth of the enemy's line.
    startZ: front.own.forward + direction * CREEPING_BARRAGE.openAhead,
    objectiveZ: front.enemy.rear,
    objectiveDepth: Math.abs(front.enemy.rear - front.enemy.forward),
    roundsPerMinute: CREEPING_BARRAGE.roundsPerMinute,
    lift: CREEPING_BARRAGE.lift,
    interval: CREEPING_BARRAGE.interval,
    standoff: CREEPING_BARRAGE.standoff,
    standingRoundsPerMinute: CREEPING_BARRAGE.standingRoundsPerMinute,
    delay: 0
  })
}

/**
 * A preparatory bombardment of the enemy front line: heavy howitzers to smash the trench, field guns to keep the
 * defenders down and to cut lanes through the wire in front of it, for two minutes. Real bombardments lasted days; this
 * is the last, most intense stretch.
 */
export function bombardEnemyLine(sim: Simulation, side: Side): void {
  const front = lines(sim, side)
  if (!front) {
    return
  }
  const depth = Math.abs(front.enemy.rear - front.enemy.forward)
  const target = {
    side,
    fromX: 0,
    toX: mapWidth(sim.map),
    z: front.enemyMiddle,
    band: depth + 20,
    delay: 5,
    duration: 120
  }
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: { ...target, shell: Shell.HeavyHighExplosive, roundsPerMinute: 30 }
  })
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: { ...target, shell: Shell.FieldHighExplosive, roundsPerMinute: 120 }
  })
  // Field guns sweep the wire belts in front of the trench to cut lanes for the infantry.
  const towardUs = Math.sign(front.own.forward - front.enemy.forward)
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: {
      ...target,
      z: front.enemy.forward + towardUs * WIRE_BELTS.middle,
      band: WIRE_BELTS.depth,
      shell: Shell.FieldHighExplosive,
      roundsPerMinute: WIRE_BELTS.roundsPerMinute
    }
  })
}

/** A scheduled attack: who attacks, when zero hour falls, how many bombardments lead up to it and how long it lasts. */
export interface OperationPlan {
  /** The attacking side. */
  readonly side: Side
  /** Seconds from the plan to zero hour. */
  readonly zeroHourIn: number
  /** Preparatory bombardments, fired back to back so the last ends at zero hour. */
  readonly bombardments: number
  /** Seconds from zero hour to the end, when the result is judged. */
  readonly holdSeconds: number
}

/**
 * The playtest's operation (docs/design/operations.md, "The playtest operation"): the French attack the German front
 * line eight minutes in, behind three bombardments, and have twenty minutes from zero hour to take it and hold it.
 */
export const PLAYTEST_OPERATION: OperationPlan = {
  side: Side.French,
  zeroHourIn: 480,
  bombardments: 3,
  holdSeconds: 1200
}

/**
 * How it ended: the enemy's front line held, a footing gained on an objective he held, or thrown back with neither.
 */
export type OperationResult = "taken" | "footing" | "repulsed"

/** One side's men put out of the fight since the plan. */
export interface SideTally {
  /** Men in the fight when the plan was made. */
  readonly engaged: number
  killed: number
  /** Wounded and still alive: lying out, carried to the aid post, or back to duty. */
  wounded: number
  /** Of the wounded, those patched up and sent back to the reserves. */
  returned: number
  captured: number
}

/** What a report says of an operation, counted as it goes. */
export interface OperationTally {
  readonly sides: Record<Side, SideTally>
  /** The attackers' killed and wounded by what did it; "own" is their own shells and grenades. */
  readonly causes: Record<CasualtyKind | "own", number>
  /** The defenders' machine gunners put down. */
  gunnersDown: number
  /** Objectives that changed hands, and the step each did. */
  readonly objectives: { readonly name: string; readonly side: Side; readonly at: number }[]
  /** The squads the player led: men they lost, and enemies they shot or bombed down. */
  readonly squad: { lost: number; downed: number }
}

/** An operation under way, or over: its plan, its clock and what it has cost. */
export interface OperationState {
  readonly plan: OperationPlan
  readonly plannedAt: number
  readonly zeroHourAt: number
  readonly endsAt: number
  /** Preparatory bombardments fired so far. */
  bombardmentsFired: number
  /** Whether zero hour has come and the attackers have gone over. */
  wentOver: boolean
  /** The result, once it's over; null until then. */
  result: OperationResult | null
  /** The step it ended, or -1. */
  endedAt: number
  /** The objectives the defenders held when it was planned: taking any of them is a footing. */
  readonly defended: readonly string[]
  /** The last step an attacker was out beyond his own front line, from zero hour. */
  lastOutAt: number
  readonly tally: OperationTally
}

/** Zero hour: the attackers go over. */
export interface ZeroHourEvent {
  readonly type: "zero-hour"
  readonly side: Side
}

/** An operation over, with its result. */
export interface OperationOverEvent {
  readonly type: "operation-over"
  readonly result: OperationResult
}

/** Repulsed, early, once no attacker has been out beyond his own front line for this long, in seconds... */
const REPULSED_QUIET = 60
/** ...counted from this long after zero hour, once the attack has had time to get going. */
const REPULSED_AFTER = 240
/** An attacker this far beyond his own front line's forward bays is out, in metres. */
const OUT_BEYOND = 10
/** Seconds between looks at whether the attack is still out. Converted where used (see objectives.ts). */
const CHECK_SECONDS = 2

function enemyOf(side: Side): Side {
  return side === Side.French ? Side.German : Side.French
}

function freshTally(sim: Simulation): OperationTally {
  const engaged = { [Side.French]: 0, [Side.German]: 0 }
  for (const soldier of soldierIds(sim)) {
    engaged[sim.soldiers.side.value[soldier] === Side.German ? Side.German : Side.French]++
  }
  const side = (count: number): SideTally => ({ engaged: count, killed: 0, wounded: 0, returned: 0, captured: 0 })
  return {
    sides: { [Side.French]: side(engaged[Side.French]), [Side.German]: side(engaged[Side.German]) },
    causes: { "machine-gun": 0, rifle: 0, shell: 0, own: 0, grenade: 0, gas: 0, other: 0 },
    gunnersDown: 0,
    objectives: [],
    squad: { lost: 0, downed: 0 }
  }
}

/** Plans an operation from now, replacing any before it. */
export function planOperation(sim: Simulation, plan: OperationPlan): OperationState {
  const zeroHourAt = sim.tick + Math.round(plan.zeroHourIn * TICK_RATE)
  const defender = enemyOf(plan.side)
  const operation: OperationState = {
    plan,
    plannedAt: sim.tick,
    zeroHourAt,
    endsAt: zeroHourAt + Math.round(plan.holdSeconds * TICK_RATE),
    bombardmentsFired: 0,
    wentOver: false,
    result: null,
    endedAt: -1,
    defended: sim.objectives.filter((objective) => objective.holder === defender).map((objective) => objective.name),
    lastOutAt: zeroHourAt,
    tally: freshTally(sim)
  }
  sim.operation = operation
  return operation
}

/** The step a bombardment opens: back to back, so the last ends as zero hour comes. */
export function bombardmentAt(operation: OperationState, index: number): number {
  const { bombardments } = operation.plan
  return operation.zeroHourAt - (bombardments - index) * BOMBARDMENT_SECONDS * TICK_RATE
}

function sideOf(sim: Simulation, soldier: number): Side {
  return sim.soldiers.side.value[soldier] === Side.German ? Side.German : Side.French
}

/** Whether a soldier is of a squad the player leads. */
function playersMan(sim: Simulation, soldier: number): boolean {
  return sim.squads[sim.soldiers.squad.id[soldier]]?.controller === "player"
}

/** Counts this step's losses, prisoners and objectives into the tally. */
function count(sim: Simulation, operation: OperationState): void {
  const { tally, plan } = operation
  for (const event of sim.events) {
    if (event.type === "fallen") {
      const side = sideOf(sim, event.soldier)
      tally.sides[side][event.killed ? "killed" : "wounded"]++
      const { kind, by, soldier: hitBy } = event.cause
      if (side === plan.side) {
        tally.causes[by === plan.side && (kind === "shell" || kind === "grenade") ? "own" : kind]++
      } else if (sim.soldiers.weapon.kind[event.soldier] === Weapon.MachineGun) {
        tally.gunnersDown++
      }
      if (playersMan(sim, event.soldier)) {
        tally.squad.lost++
      }
      if (hitBy !== undefined && playersMan(sim, hitBy) && sideOf(sim, hitBy) !== side) {
        tally.squad.downed++
      }
    } else if (event.type === "died-of-wounds") {
      const side = tally.sides[sideOf(sim, event.soldier)]
      side.wounded--
      side.killed++
    } else if (event.type === "returned-to-duty") {
      tally.sides[sideOf(sim, event.soldier)].returned++
    } else if (event.type === "capture") {
      tally.sides[sideOf(sim, event.soldier)].captured++
    } else if (event.type === "objective-taken") {
      tally.objectives.push({ name: event.name, side: event.side, at: sim.tick })
    }
  }
}

/** Whether any attacker is out beyond his own front line: still attacking, or holding what he took. */
function attackersOut(sim: Simulation, side: Side): boolean {
  const own = frontLineSpan(sim.map.trenches, side)
  const enemy = frontLineSpan(sim.map.trenches, enemyOf(side))
  if (own === null || enemy === null) {
    return false
  }
  const direction = Math.sign(enemy.forward - own.forward)
  return soldierIds(sim).some(
    (soldier) =>
      sim.soldiers.side.value[soldier] === side &&
      (sim.soldiers.position.z[soldier] - own.forward) * direction > OUT_BEYOND
  )
}

/** How the operation stands at its end: the enemy's front line taken, a footing on his objectives, or neither. */
export function judgeOperation(sim: Simulation, operation: OperationState): OperationResult {
  const { side } = operation.plan
  const defender = enemyOf(side)
  const enemyFront = frontLineSpan(sim.map.trenches, defender)
  if (enemyFront !== null && frontLost(sim, defender, enemyFront)) {
    return "taken"
  }
  const footing = sim.objectives.some(
    (objective) => objective.holder === side && operation.defended.includes(objective.name)
  )
  return footing ? "footing" : "repulsed"
}

function end(sim: Simulation, operation: OperationState, result: OperationResult): void {
  operation.result = result
  operation.endedAt = sim.tick
  sim.events.push({ type: "operation-over", result })
}

/**
 * Runs the operation, every step: fires the bombardments on time, sends the attackers over at zero hour, counts what it
 * costs, and judges it at the end, or early once the attack is thrown back. Runs after every other system, so it counts
 * the whole step's events.
 */
export function operationSystem(sim: Simulation): void {
  const operation = sim.operation
  if (operation === null || operation.result !== null) {
    return
  }
  count(sim, operation)
  const { plan } = operation
  while (
    operation.bombardmentsFired < plan.bombardments &&
    sim.tick >= bombardmentAt(operation, operation.bombardmentsFired)
  ) {
    bombardEnemyLine(sim, plan.side)
    operation.bombardmentsFired++
  }
  if (!operation.wentOver) {
    if (sim.tick >= operation.zeroHourAt) {
      operation.wentOver = true
      attackBehindBarrage(sim, plan.side)
      sim.events.push({ type: "zero-hour", side: plan.side })
    }
    return
  }
  if (sim.tick >= operation.endsAt) {
    end(sim, operation, judgeOperation(sim, operation))
    return
  }
  if (sim.tick % (CHECK_SECONDS * TICK_RATE) !== 0) {
    return
  }
  if (attackersOut(sim, plan.side)) {
    operation.lastOutAt = sim.tick
  } else if (
    sim.tick - operation.zeroHourAt >= REPULSED_AFTER * TICK_RATE &&
    sim.tick - operation.lastOutAt >= REPULSED_QUIET * TICK_RATE
  ) {
    end(sim, operation, "repulsed")
  }
}

/** A deep copy of an operation, for snapshots. */
export function copyOperation(operation: OperationState | null): OperationState | null {
  if (operation === null) {
    return null
  }
  const { tally } = operation
  return {
    ...operation,
    defended: [...operation.defended],
    tally: {
      ...tally,
      sides: { [Side.French]: { ...tally.sides[Side.French] }, [Side.German]: { ...tally.sides[Side.German] } },
      causes: { ...tally.causes },
      objectives: tally.objectives.map((objective) => ({ ...objective })),
      squad: { ...tally.squad }
    }
  }
}
