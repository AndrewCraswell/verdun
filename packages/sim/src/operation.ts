import { mapWidth } from "@verdun/map"
import { frontLineSpan, frontLineZ, lineSpanBetween, type LineSpan, Shell } from "./artillery.ts"
import { Weapon } from "./combat.ts"
import { menInEnemyLine, type Stretch, stretchLost } from "./commander.ts"
import { Side } from "./components.ts"
import { joinSquad } from "./reinforcements.ts"
import { enqueueCommand, type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"
import { isAlive, type Squad } from "./squads.ts"
import { wireStanding } from "./wire.ts"
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

/** An attack's shells fall this far beyond each end of its stretch, in metres. */
const FLANK = 20

/** The ground a fire plan covers: the whole front, or a stretch and a little beyond each end; and its share of the front. */
function fireFront(sim: Simulation, stretch?: Stretch): { fromX: number; toX: number; share: number } {
  const width = mapWidth(sim.map)
  if (!stretch) {
    return { fromX: 0, toX: width, share: 1 }
  }
  const fromX = Math.max(0, stretch.fromX - FLANK)
  const toX = Math.min(width, stretch.toX + FLANK)
  return { fromX, toX, share: (toX - fromX) / width }
}

/**
 * Both front lines as seen from one side, along a stretch or the whole front: how deep each runs, and the enemy's
 * middle.
 */
function lines(
  sim: Simulation,
  side: Side,
  stretch?: Stretch
): { own: LineSpan; enemy: LineSpan; enemyMiddle: number } | null {
  const enemySide = enemyOf(side)
  const { trenches } = sim.map
  if (stretch) {
    const own = lineSpanBetween(trenches, side, stretch.fromX, stretch.toX)
    const enemy = lineSpanBetween(trenches, enemySide, stretch.fromX, stretch.toX)
    return own === null || enemy === null ? null : { own, enemy, enemyMiddle: (enemy.forward + enemy.rear) / 2 }
  }
  const own = frontLineSpan(trenches, side)
  const enemy = frontLineSpan(trenches, enemySide)
  const enemyMiddle = frontLineZ(trenches, enemySide)
  return own === null || enemy === null || enemyMiddle === null ? null : { own, enemy, enemyMiddle }
}

/**
 * The whistle: a side goes over the top behind a creeping barrage, which opens at once. Without a stretch, the whole
 * side along the whole front; with one, the barrage covers that stretch at the same weight of fire per metre, and only
 * the squads given go.
 */
export function attackBehindBarrage(sim: Simulation, side: Side, stretch?: Stretch, squads?: readonly number[]): void {
  const front = lines(sim, side, stretch)
  if (!front) {
    return
  }
  const { fromX, toX, share } = fireFront(sim, stretch)
  const direction = Math.sign(front.enemy.forward - front.own.forward)
  enqueueCommand(sim, {
    type: "barrage-attack",
    side,
    fromX,
    toX,
    // Opens ahead of our own most forward bays; the objective is the whole depth of the enemy's line.
    startZ: front.own.forward + direction * CREEPING_BARRAGE.openAhead,
    objectiveZ: front.enemy.rear,
    objectiveDepth: Math.abs(front.enemy.rear - front.enemy.forward),
    roundsPerMinute: CREEPING_BARRAGE.roundsPerMinute * share,
    lift: CREEPING_BARRAGE.lift,
    interval: CREEPING_BARRAGE.interval,
    standoff: CREEPING_BARRAGE.standoff,
    standingRoundsPerMinute: CREEPING_BARRAGE.standingRoundsPerMinute * share,
    delay: 0,
    ...(squads ? { squads } : {})
  })
}

/**
 * A preparatory bombardment of the enemy front line, along a stretch or the whole front: heavy howitzers to smash the
 * trench, field guns to keep the defenders down and to cut lanes through the wire in front of it, for two minutes. Real
 * bombardments lasted days; this is the last, most intense stretch.
 */
export function bombardEnemyLine(sim: Simulation, side: Side, stretch?: Stretch): void {
  const front = lines(sim, side, stretch)
  if (!front) {
    return
  }
  const { fromX, toX, share } = fireFront(sim, stretch)
  const depth = Math.abs(front.enemy.rear - front.enemy.forward)
  const target = {
    side,
    fromX,
    toX,
    z: front.enemyMiddle,
    band: depth + 20,
    delay: 5,
    duration: 120
  }
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: { ...target, shell: Shell.HeavyHighExplosive, roundsPerMinute: 30 * share }
  })
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: { ...target, shell: Shell.FieldHighExplosive, roundsPerMinute: 120 * share }
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
      roundsPerMinute: WIRE_BELTS.roundsPerMinute * share
    }
  })
}

/** A scheduled attack: who attacks, where and when, how many bombardments lead up to it and how long it lasts. */
export interface OperationPlan {
  /** The attacking side. */
  readonly side: Side
  /** Seconds from the plan to zero hour. */
  readonly zeroHourIn: number
  /** Preparatory bombardments, fired back to back so the last ends at zero hour. */
  readonly bombardments: number
  /** Seconds from zero hour to the end, when the result is judged. */
  readonly holdSeconds: number
  /** How wide a stretch of the enemy's line to attack, in metres: the whole front if it's as wide as the map. */
  readonly frontage: number
  /** Reserve squads that follow as the second wave, three minutes after zero hour. */
  readonly secondWave: number
}

/**
 * The playtest's operation (docs/design/operations.md, "The playtest operation"): the French attack a 200 m stretch of
 * the German front line eight minutes in, behind three bombardments, with two reserve squads following, and have twenty
 * minutes from zero hour to take it and hold it.
 */
export const PLAYTEST_OPERATION: OperationPlan = {
  side: Side.French,
  zeroHourIn: 480,
  bombardments: 3,
  holdSeconds: 1200,
  frontage: 200,
  secondWave: 2
}

/**
 * How it ended: the stretch of the enemy's front line held, a footing gained in it or on an objective he held there, or
 * thrown back with neither.
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
  /** The stretch of the enemy's line attacked, from west to east, in metres. */
  readonly fromX: number
  readonly toX: number
  /** Preparatory bombardments fired so far. */
  bombardmentsFired: number
  /** Whether zero hour has come and the first wave has gone over. */
  wentOver: boolean
  /** Whether the second wave has gone. */
  secondWaveSent: boolean
  /** The result, once it's over; null until then. */
  result: OperationResult | null
  /** The step it ended, or -1. */
  endedAt: number
  /** The objectives on the stretch the defenders held when it was planned: taking any of them is a footing. */
  readonly defended: readonly string[]
  /** The last step an attacker was out beyond his own front line, from zero hour. */
  lastOutAt: number
  readonly tally: OperationTally
}

/** Zero hour: the first wave goes over. */
export interface ZeroHourEvent {
  readonly type: "zero-hour"
  readonly side: Side
  /** The squads that went. */
  readonly squads: readonly number[]
}

/** The second wave leaves the support line for the stretch. */
export interface SecondWaveEvent {
  readonly type: "second-wave"
  readonly side: Side
  readonly squads: readonly number[]
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
/** The second wave goes this long after zero hour, in seconds. */
const SECOND_WAVE_AFTER = 180
/** Attackers in the stretch of the enemy's line, short of holding it, that make a footing. */
const FOOTING_MEN = 4
/** Candidate stretches are this far apart along the enemy's line, in metres. */
const STRETCH_STEP = 20
/** Squads this far beyond either end of the stretch still go with the first wave, in metres. */
const WAVE_SPARE = 10
/** A squad goes over with at least this many men fit to go. */
const FIT_TO_GO = 4
/** A squad is in its front line within this distance of the line's span along it, in metres. */
const LINE_BAND = 15
/** Each machine gun in the enemy's garrison counts as this many riflemen against the attack. */
const GUN_WEIGHT = 4
/** No man's land this narrow scores best, in metres, and this wide or wider scores nothing. */
const NO_MANS_LAND = { best: 50, worst: 200 } as const
/** How much each consideration weighs in choosing the stretch, and the random nudge on top. */
const WEIGHTS = { value: 2, odds: 2, wire: 1, closeness: 1, nudge: 0.3 } as const
/** The wire scored is in this band in front of the enemy's forward bays, in metres. */
const WIRE_BAND = 60

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

/** The objectives a side holds on a stretch, or close enough to it that their ground reaches it. */
function objectivesOn(sim: Simulation, side: Side, stretch: Stretch): string[] {
  return sim.objectives
    .filter(
      (objective) =>
        objective.holder === side &&
        objective.x + objective.radius >= stretch.fromX &&
        objective.x - objective.radius <= stretch.toX
    )
    .map((objective) => objective.name)
}

/** Whether a ground z lies in a line's span along a stretch, give or take the band. */
function inLine(span: LineSpan, z: number): boolean {
  return z >= Math.min(span.forward, span.rear) - LINE_BAND && z <= Math.max(span.forward, span.rear) + LINE_BAND
}

/** How a stretch of the enemy's line scores as the place to attack: docs/design/operations.md, "Choosing the stretch". */
function scoreStretch(sim: Simulation, side: Side, stretch: Stretch, living: readonly number[]): number | null {
  const front = lines(sim, side, stretch)
  if (front === null) {
    return null
  }
  const value = Math.min(1, objectivesOn(sim, enemyOf(side), stretch).length)
  let own = 0
  let garrison = 0
  for (const soldier of living) {
    const x = sim.soldiers.position.x[soldier]
    const z = sim.soldiers.position.z[soldier]
    if (x < stretch.fromX || x > stretch.toX) {
      continue
    }
    if (sim.soldiers.side.value[soldier] === side) {
      own += inLine(front.own, z) ? 1 : 0
    } else if (inLine(front.enemy, z)) {
      garrison += sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun ? GUN_WEIGHT : 1
    }
  }
  const odds = own + garrison > 0 ? own / (own + garrison) : 0
  const towardUs = Math.sign(front.own.forward - front.enemy.forward)
  const near = front.enemy.forward
  const wire = 1 - wireStanding(sim.wire, stretch.fromX, stretch.toX, near, near + towardUs * WIRE_BAND)
  const across = Math.abs(front.enemy.forward - front.own.forward)
  const closeness = Math.min(1, Math.max(0, (NO_MANS_LAND.worst - across) / (NO_MANS_LAND.worst - NO_MANS_LAND.best)))
  return WEIGHTS.value * value + WEIGHTS.odds * odds + WEIGHTS.wire * wire + WEIGHTS.closeness * closeness
}

/**
 * Where to attack: the stretch of the enemy's front line, `width` metres wide, that scores best, nudged a little at
 * random so the blow doesn't always fall in the same place. The whole front when it's as wide as the map.
 */
export function chooseStretch(sim: Simulation, side: Side, width: number): Stretch {
  const mapSpan = mapWidth(sim.map)
  if (width >= mapSpan) {
    return { fromX: 0, toX: mapSpan }
  }
  const living = soldierIds(sim)
  let best: { stretch: Stretch; score: number } | null = null
  for (let fromX = 0; fromX + width <= mapSpan; fromX += STRETCH_STEP) {
    const stretch = { fromX, toX: fromX + width }
    const score = scoreStretch(sim, side, stretch, living)
    if (score === null) {
      continue
    }
    const nudged = score + WEIGHTS.nudge * sim.rng.next()
    if (best === null || nudged > best.score) {
      best = { stretch, score: nudged }
    }
  }
  return best?.stretch ?? { fromX: 0, toX: mapSpan }
}

/** Where a squad's living men are on average, and how many, or null if none are left. */
function whereSquadIs(sim: Simulation, squad: Squad): { x: number; z: number; fit: number } | null {
  let x = 0
  let z = 0
  let fit = 0
  for (const member of squad.members) {
    if (isAlive(sim, member)) {
      x += sim.soldiers.position.x[member]
      z += sim.soldiers.position.z[member]
      fit++
    }
  }
  return fit === 0 ? null : { x: x / fit, z: z / fit, fit }
}

/**
 * The first wave: every squad of the attacking side in its front line opposite the stretch, a little to spare either
 * side, with enough men fit to go. Worked out as the squads stand now, so takeovers and joins since the plan count.
 */
export function firstWave(sim: Simulation, operation: OperationState): Squad[] {
  const { side } = operation.plan
  const fromX = operation.fromX - WAVE_SPARE
  const toX = operation.toX + WAVE_SPARE
  const own = lineSpanBetween(sim.map.trenches, side, fromX, toX)
  if (own === null) {
    return []
  }
  return sim.squads.filter((squad) => {
    const at = squad.side === side && squad.order.kind !== "reserve" ? whereSquadIs(sim, squad) : null
    return at !== null && at.fit >= FIT_TO_GO && at.x >= fromX && at.x <= toX && inLine(own, at.z)
  })
}

/** The reserve squads nearest the stretch, as many as the plan's second wave, nearest first. */
function secondWave(sim: Simulation, operation: OperationState): Squad[] {
  const middle = (operation.fromX + operation.toX) / 2
  return sim.squads
    .filter((squad) => squad.side === operation.plan.side && squad.order.kind === "reserve" && squad.leader >= 0)
    .map((squad) => ({ squad, away: Math.abs(sim.soldiers.position.x[squad.leader] - middle) }))
    .sort((a, b) => a.away - b.away || a.squad.id - b.squad.id)
    .slice(0, operation.plan.secondWave)
    .map(({ squad }) => squad)
}

/**
 * Puts the player's squad in the first wave: if it isn't opposite the stretch, it swaps men with the squad of the wave
 * nearest the stretch's middle, as a player joining the battle would.
 */
function bringPlayerIn(sim: Simulation, operation: OperationState): void {
  const player = sim.squads.find((squad) => squad.side === operation.plan.side && squad.controller === "player")
  const wave = firstWave(sim, operation)
  if (!player || wave.includes(player)) {
    return
  }
  const middle = (operation.fromX + operation.toX) / 2
  const away = (squad: Squad) => Math.abs((whereSquadIs(sim, squad)?.x ?? Infinity) - middle)
  const nearest = [...wave].sort((a, b) => away(a) - away(b) || a.id - b.id)
  nearest.find((squad) => joinSquad(sim, player, squad))
}

/** Plans an operation from now, replacing any before it: chooses its stretch, and puts the player's squad in it. */
export function planOperation(sim: Simulation, plan: OperationPlan): OperationState {
  const zeroHourAt = sim.tick + Math.round(plan.zeroHourIn * TICK_RATE)
  const stretch = chooseStretch(sim, plan.side, plan.frontage)
  const operation: OperationState = {
    plan,
    plannedAt: sim.tick,
    zeroHourAt,
    endsAt: zeroHourAt + Math.round(plan.holdSeconds * TICK_RATE),
    fromX: stretch.fromX,
    toX: stretch.toX,
    bombardmentsFired: 0,
    wentOver: false,
    secondWaveSent: false,
    result: null,
    endedAt: -1,
    defended: objectivesOn(sim, enemyOf(plan.side), stretch),
    lastOutAt: zeroHourAt,
    tally: freshTally(sim)
  }
  bringPlayerIn(sim, operation)
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

/**
 * How the operation stands at its end: the stretch of the enemy's front line taken, a footing in it or on an objective
 * he held there, or neither.
 */
export function judgeOperation(sim: Simulation, operation: OperationState): OperationResult {
  const { side } = operation.plan
  const stretch = { fromX: operation.fromX, toX: operation.toX }
  if (stretchLost(sim, enemyOf(side), stretch)) {
    return "taken"
  }
  const onObjective = sim.objectives.some(
    (objective) => objective.holder === side && operation.defended.includes(objective.name)
  )
  return onObjective || menInEnemyLine(sim, side, stretch) >= FOOTING_MEN ? "footing" : "repulsed"
}

function end(sim: Simulation, operation: OperationState, result: OperationResult): void {
  operation.result = result
  operation.endedAt = sim.tick
  sim.events.push({ type: "operation-over", result })
}

/** The stretch the fire plan covers: none, for the whole front, when the frontage is as wide as the map. */
function stretchOf(sim: Simulation, operation: OperationState): Stretch | undefined {
  return operation.plan.frontage >= mapWidth(sim.map) ? undefined : { fromX: operation.fromX, toX: operation.toX }
}

/** Zero hour: the first wave goes over behind the barrage on the stretch. */
function goOver(sim: Simulation, operation: OperationState): void {
  const { side } = operation.plan
  const squads = firstWave(sim, operation).map((squad) => squad.id)
  operation.wentOver = true
  attackBehindBarrage(sim, side, stretchOf(sim, operation), squads)
  sim.events.push({ type: "zero-hour", side, squads })
}

/** The second wave leaves the support line and makes for the enemy's line on the stretch. */
function sendSecondWave(sim: Simulation, operation: OperationState): void {
  operation.secondWaveSent = true
  const { side } = operation.plan
  const enemy = lineSpanBetween(sim.map.trenches, enemyOf(side), operation.fromX, operation.toX)
  const squads = enemy === null ? [] : secondWave(sim, operation)
  for (const squad of squads) {
    const x = Math.min(operation.toX, Math.max(operation.fromX, sim.soldiers.position.x[squad.leader]))
    enqueueCommand(sim, {
      type: "squad-order",
      squad: squad.id,
      order: { kind: "advance", x, z: enemy?.forward ?? 0 }
    })
  }
  sim.events.push({ type: "second-wave", side, squads: squads.map((squad) => squad.id) })
}

/**
 * Runs the operation, every step: fires the bombardments on time, sends the first wave over at zero hour and the second
 * after it, counts what it costs, and judges it at the end, or early once the attack is thrown back. Runs after every
 * other system, so it counts the whole step's events.
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
    bombardEnemyLine(sim, plan.side, stretchOf(sim, operation))
    operation.bombardmentsFired++
  }
  if (!operation.wentOver) {
    if (sim.tick >= operation.zeroHourAt) {
      goOver(sim, operation)
    }
    return
  }
  if (!operation.secondWaveSent && sim.tick >= operation.zeroHourAt + SECOND_WAVE_AFTER * TICK_RATE) {
    sendSecondWave(sim, operation)
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
