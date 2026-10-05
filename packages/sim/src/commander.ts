import { mapWidth, type Trench } from "@verdun/map"
import { frontLineSpan, lineSpanBetween, type LineSpan, Shell } from "./artillery.ts"
import { applyCommand } from "./commands.ts"
import { NEVER, Side } from "./components.ts"
import { dawnWithin, isNight } from "./routine.ts"
import { type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"
import { isAlive, raidGoal, type Squad } from "./squads.ts"
import { isInTrench } from "./stance.ts"
import { mendWire, wiringPartyCanReach } from "./wire.ts"

/**
 * Each side's commander takes stock of its front line this often, in seconds. Kept in seconds and converted where
 * used: this module and simulation.ts import each other, so simulation.ts's constants aren't ready at load time.
 */
const CHECK_SECONDS = 5
/** The front line is lost once at least this many enemies are in it... */
const LOST_ENEMIES = 8
/** ...outnumbering what's left of its garrison by this much. */
const LOST_RATIO = 3
/** Soldiers within this distance of the front line's span hold it, in metres: its bays, traverses and the ground around. */
const FRONT_BAND = 15
/** The front line is looked at in windows this wide for a stretch of it lost, in metres... */
const LOST_WINDOW = 100
/** ...moved along it this far at a time. */
const LOST_STEP = 25
/** Reserves within this distance of a lost stretch's ends go in to retake it, in metres; with none so near, all go. */
const RESERVE_REACH = 100
/** The counter-attack's shells fall this far beyond each end of the lost stretch, in metres. */
const FLANK = 20
/**
 * Seconds from losing the front line to counter-attacking it. German doctrine at Verdun was the immediate counter-attack
 * (Gegenstoß) by the reserves close behind, before the attackers could dig in: runners back, the reserves formed up,
 * the guns laid on the lost trench. Minutes, not hours.
 */
export const COUNTER_ATTACK_DELAY = 180
/**
 * A counter-attack ready in the small hours waits for the dawn stand-to if it is this many game hours off or less: dawn
 * was the hour for attacks, light enough to keep direction and find the enemy, too dim for his machine gunners to see far.
 */
const WAIT_FOR_DAWN_HOURS = 2
/** The counter-attack goes in behind its own creeping barrage, as the attack did. */
const COUNTER_BARRAGE = { openAhead: 70, lift: 50, interval: 90, standoff: 70, roundsPerMinute: 120, standing: 40 }
/**
 * Before the reserves go in, the guns pound the lost trench for this long, in seconds, with field guns and heavies at
 * these rates: the attackers in it are as exposed now as its garrison was.
 */
const PREPARATION = { seconds: 120, fieldRoundsPerMinute: 120, heavyRoundsPerMinute: 24 } as const

/**
 * A trench raid: one squad of the front-line garrison, about once a night per side. Each phase gives up after this
 * long, in seconds; the raid turns for home once half the raiders are down.
 */
const RAID = { chancePerCheck: 1 / 40, minimumMen: 4, outSeconds: 900, inSeconds: 60, homeSeconds: 900 } as const
/** Raiders count as at their goal this close to it, in metres. */
const RAID_ARRIVED = 12
/**
 * Gas shelling by night, at most once a night per side: only with a steady wind toward the enemy that won't blow the
 * cloud back or scatter it, and no rain to wash it out. Field-gun gas shells on a stretch of the enemy's front line.
 */
const NIGHT_GAS = {
  chancePerCheck: 1 / 240,
  minimumToward: 1,
  maximumSpeed: 5,
  maximumRain: 0.3,
  width: 200,
  band: 40,
  roundsPerMinute: 40,
  delay: 30,
  seconds: 300
} as const

/** What a side's commander has done about its front line, and by night. */
export interface CommanderState {
  /** The step the front line was found lost, or -1. */
  lostAt: number
  /** Where it was lost: the stretch the enemy holds, from west to east, in metres. */
  lostFromX: number
  lostToX: number
  /** The step the counter-attack began, with the guns shelling the lost trench, or -1. */
  counterAttackedAt: number
  /** The step the reserves leave their dugouts and go in, or -1 once they have (or before it's planned). */
  assaultAt: number
  /** The squad out on a raid, or -1. */
  raidSquad: number
  /** The step the raid's current phase began. */
  raidPhaseAt: number
  /** How many raiders went out. */
  raidStrength: number
  /** The step the last raid went out, and the last gas shelling began. */
  lastRaidAt: number
  lastGasAt: number
}

/** A counter-attack going in, for renderers and battle reports. */
export interface CounterAttackEvent {
  readonly type: "counter-attack"
  readonly side: Side
}

function freshCommander(): CommanderState {
  return {
    lostAt: -1,
    lostFromX: 0,
    lostToX: 0,
    counterAttackedAt: -1,
    assaultAt: -1,
    raidSquad: -1,
    raidPhaseAt: -1,
    raidStrength: 0,
    lastRaidAt: NEVER,
    lastGasAt: NEVER
  }
}

export function createCommanders(): Record<Side, CommanderState> {
  return {
    [Side.French]: freshCommander(),
    [Side.German]: freshCommander()
  }
}

/** A stretch of the front, from west to east, in metres. */
export interface Stretch {
  readonly fromX: number
  readonly toX: number
}

/** A side's men and the enemy's in its front line along a stretch of it, from those in the fight. */
function menInStretch(
  sim: Simulation,
  side: Side,
  stretch: Stretch,
  living: readonly number[] = soldierIds(sim)
): { own: number; enemies: number } {
  const span = lineSpanBetween(sim.map.trenches, side, stretch.fromX, stretch.toX)
  let own = 0
  let enemies = 0
  if (span === null) {
    return { own, enemies }
  }
  const near = Math.min(span.forward, span.rear) - FRONT_BAND
  const far = Math.max(span.forward, span.rear) + FRONT_BAND
  for (const soldier of living) {
    const x = sim.soldiers.position.x[soldier]
    const z = sim.soldiers.position.z[soldier]
    if (x < stretch.fromX || x > stretch.toX || z < near || z > far) {
      continue
    }
    if (sim.soldiers.side.value[soldier] === side) {
      own++
    } else {
      enemies++
    }
  }
  return { own, enemies }
}

/** Whether the enemy holds a stretch of a side's front line: enough of them in it, and few of its own men left. */
export function stretchLost(sim: Simulation, side: Side, stretch: Stretch, living?: readonly number[]): boolean {
  const { own, enemies } = menInStretch(sim, side, stretch, living)
  return enemies >= LOST_ENEMIES && enemies >= own * LOST_RATIO
}

/** How many of a side's men are in the enemy's front line along a stretch of it. */
export function menInEnemyLine(sim: Simulation, side: Side, stretch: Stretch): number {
  return menInStretch(sim, side === Side.French ? Side.German : Side.French, stretch).enemies
}

/**
 * Where the enemy holds a side's front line: every window of it he holds, joined where they touch or overlap, and the
 * longest such stretch returned; null where he holds none.
 */
function lostStretch(sim: Simulation, side: Side): Stretch | null {
  const width = mapWidth(sim.map)
  const living = soldierIds(sim)
  let longest: Stretch | null = null
  let current: { fromX: number; toX: number } | null = null
  const close = () => {
    if (current && (longest === null || current.toX - current.fromX > longest.toX - longest.fromX)) {
      longest = current
    }
    current = null
  }
  for (let fromX = 0; ; fromX += LOST_STEP) {
    const toX = Math.min(width, fromX + LOST_WINDOW)
    if (stretchLost(sim, side, { fromX, toX }, living)) {
      if (current && fromX <= current.toX) {
        current.toX = toX
      } else {
        close()
        current = { fromX, toX }
      }
    }
    if (toX >= width) {
      break
    }
  }
  close()
  return longest
}

/** The ground the counter-attack shells: the lost stretch and a little beyond each end, and its share of the front. */
function counterAttackFront(sim: Simulation, state: CommanderState): { fromX: number; toX: number; share: number } {
  const width = mapWidth(sim.map)
  const fromX = Math.max(0, state.lostFromX - FLANK)
  const toX = Math.min(width, state.lostToX + FLANK)
  return { fromX, toX, share: (toX - fromX) / width }
}

function reservesOf(sim: Simulation, side: Side) {
  return sim.squads.filter((squad) => squad.side === side && squad.order.kind === "reserve" && squad.leader >= 0)
}

/** The lost stretch's own span of trench: its bays there, or the whole line's where it has none. */
function lostSpan(sim: Simulation, side: Side, front: LineSpan, state: CommanderState): LineSpan {
  return lineSpanBetween(sim.map.trenches, side, state.lostFromX, state.lostToX) ?? front
}

/**
 * Opens the counter-attack: the guns pound the lost stretch while the reserves wait below, at the same weight of fire
 * per metre whatever its length.
 */
function prepareCounterAttack(sim: Simulation, side: Side, front: LineSpan, state: CommanderState): void {
  const span = lostSpan(sim, side, front, state)
  const { fromX, toX, share } = counterAttackFront(sim, state)
  const lostTrench = {
    side,
    fromX,
    toX,
    z: (span.forward + span.rear) / 2,
    band: Math.abs(span.forward - span.rear) + 20,
    delay: 0,
    duration: PREPARATION.seconds,
    // A hasty shoot on ground just lost, corrected by observers who can see it, or not.
    observed: true
  }
  applyCommand(sim, {
    type: "fire-mission",
    plan: { ...lostTrench, shell: Shell.FieldHighExplosive, roundsPerMinute: PREPARATION.fieldRoundsPerMinute * share }
  })
  applyCommand(sim, {
    type: "fire-mission",
    plan: { ...lostTrench, shell: Shell.HeavyHighExplosive, roundsPerMinute: PREPARATION.heavyRoundsPerMinute * share }
  })
  sim.events.push({ type: "counter-attack", side })
}

/**
 * Sends a side's reserves out of their dugouts to retake its lost stretch of front line behind a creeping barrage: those
 * near it, or all of them if none are.
 */
function assault(sim: Simulation, side: Side, front: LineSpan, state: CommanderState): void {
  const all = reservesOf(sim, side)
  const near = all.filter((squad) => {
    const x = sim.soldiers.position.x[squad.leader]
    return x >= state.lostFromX - RESERVE_REACH && x <= state.lostToX + RESERVE_REACH
  })
  const reserves = near.length > 0 ? near : all
  if (reserves.length === 0) {
    return
  }
  const span = lostSpan(sim, side, front, state)
  const { fromX, toX, share } = counterAttackFront(sim, state)
  const towardEnemy = side === Side.French ? 1 : -1
  const reserveZ = reserves.reduce((sum, squad) => sum + sim.soldiers.position.z[squad.leader], 0) / reserves.length
  // Coming from behind, the reserves meet the line's rear first and retake it through to its forward bays.
  const toFront = Math.abs(span.rear - reserveZ)
  applyCommand(sim, {
    type: "barrage-attack",
    side,
    fromX,
    toX,
    startZ: reserveZ + towardEnemy * Math.min(COUNTER_BARRAGE.openAhead, toFront),
    objectiveZ: span.forward,
    objectiveDepth: Math.abs(span.forward - span.rear),
    roundsPerMinute: COUNTER_BARRAGE.roundsPerMinute * share,
    lift: COUNTER_BARRAGE.lift,
    interval: COUNTER_BARRAGE.interval,
    standoff: COUNTER_BARRAGE.standoff,
    delay: 0,
    standingRoundsPerMinute: COUNTER_BARRAGE.standing * share,
    squads: reserves.map((squad) => squad.id)
  })
}

/** Steps in one day and night of battle: the cooldown for things done once a night. */
function dayTicks(sim: Simulation): number {
  return sim.environment.clock.minutesPerDay * 60 * TICK_RATE
}

/** The nearest point on the enemy's fire trenches to a point: where raiders go in. */
function nearestEnemyTrench(trenches: readonly Trench[], side: Side, x: number, z: number): { x: number; z: number } {
  const enemyFacing = side === Side.French ? "south" : "north"
  let best = { x, z }
  let bestDistance = Infinity
  for (const trench of trenches) {
    if (trench.kind !== "fire" || trench.facing !== enemyFacing) {
      continue
    }
    for (let index = 1; index < trench.points.length; index++) {
      const [ax, az] = trench.points[index - 1]!
      const [bx, bz] = trench.points[index]!
      const dx = bx - ax
      const dz = bz - az
      const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
      const px = ax + t * dx
      const pz = az + t * dz
      const distance = (px - x) ** 2 + (pz - z) ** 2
      if (distance < bestDistance) {
        best = { x: px, z: pz }
        bestDistance = distance
      }
    }
  }
  return best
}

function livingMembers(sim: Simulation, squad: Squad): number {
  return squad.members.filter((member) => isAlive(sim, member)).length
}

/**
 * Sends a raid out: the bot squad of the front-line garrison nearest the enemy, strong enough to go, crawls out toward
 * the nearest bay of his line.
 */
function startRaid(sim: Simulation, side: Side, state: CommanderState): void {
  const { position } = sim.soldiers
  let chosen: { squad: Squad; target: { x: number; z: number }; distance: number } | null = null
  for (const squad of sim.squads) {
    const leader = squad.leader
    if (
      squad.side !== side ||
      squad.controller !== "ai" ||
      squad.order.kind !== "hold" ||
      !isAlive(sim, leader) ||
      !isInTrench(sim.map, position.x[leader], position.z[leader]) ||
      livingMembers(sim, squad) < RAID.minimumMen
    ) {
      continue
    }
    const target = nearestEnemyTrench(sim.map.trenches, side, position.x[leader], position.z[leader])
    const distance = (target.x - position.x[leader]) ** 2 + (target.z - position.z[leader]) ** 2
    if (distance > 0 && (chosen === null || distance < chosen.distance)) {
      chosen = { squad, target, distance }
    }
  }
  if (chosen === null) {
    return
  }
  const leader = chosen.squad.leader
  chosen.squad.order = {
    kind: "raid",
    x: chosen.target.x,
    z: chosen.target.z,
    homeX: position.x[leader],
    homeZ: position.z[leader],
    phase: "out"
  }
  state.raidSquad = chosen.squad.id
  state.raidPhaseAt = sim.tick
  state.raidStrength = livingMembers(sim, chosen.squad)
  state.lastRaidAt = sim.tick
}

/** Moves a raid on: out to the wire, the rush in, and home, turning back early if it goes badly or takes too long. */
function advanceRaid(sim: Simulation, state: CommanderState): void {
  const squad = sim.squads[state.raidSquad]
  const order = squad?.order
  if (!squad || order?.kind !== "raid" || squad.leader < 0) {
    state.raidSquad = -1
    return
  }
  const seconds = (sim.tick - state.raidPhaseAt) / TICK_RATE
  const goal = raidGoal(order)
  const leader = squad.leader
  const arrived =
    (sim.soldiers.position.x[leader] - goal.x) ** 2 + (sim.soldiers.position.z[leader] - goal.z) ** 2 <=
    RAID_ARRIVED * RAID_ARRIVED
  const mauled = livingMembers(sim, squad) * 2 <= state.raidStrength
  const next = (phase: "in" | "home") => {
    squad.order = { ...order, phase }
    state.raidPhaseAt = sim.tick
  }
  if (order.phase === "out") {
    if (mauled || seconds > RAID.outSeconds) {
      next("home")
    } else if (arrived) {
      next("in")
    }
  } else if (order.phase === "in") {
    if (mauled || seconds > RAID.inSeconds) {
      next("home")
    }
  } else if (arrived || seconds > RAID.homeSeconds) {
    squad.order = { kind: "hold" }
    state.raidSquad = -1
  }
}

/** Whether the wind would carry a side's gas onto the enemy: steady toward him, not too strong, and no rain. */
export function gasWeather(sim: Simulation, side: Side): boolean {
  const { wind, precipitation } = sim.environment.weather
  const toward = (side === Side.French ? 1 : -1) * wind.z
  const speed = Math.sqrt(wind.x * wind.x + wind.z * wind.z)
  return toward >= NIGHT_GAS.minimumToward && speed <= NIGHT_GAS.maximumSpeed && precipitation <= NIGHT_GAS.maximumRain
}

/** Gas shells on a stretch of the enemy's front line, centred on a random point along it. */
function shellWithGas(sim: Simulation, side: Side, enemyFront: LineSpan, state: CommanderState): void {
  const width = mapWidth(sim.map)
  const centre = NIGHT_GAS.width / 2 + sim.rng.next() * Math.max(0, width - NIGHT_GAS.width)
  applyCommand(sim, {
    type: "fire-mission",
    plan: {
      side,
      shell: Shell.FieldGas,
      fromX: centre - NIGHT_GAS.width / 2,
      toX: centre + NIGHT_GAS.width / 2,
      z: (enemyFront.forward + enemyFront.rear) / 2,
      band: NIGHT_GAS.band,
      roundsPerMinute: NIGHT_GAS.roundsPerMinute,
      delay: NIGHT_GAS.delay,
      duration: NIGHT_GAS.seconds
    }
  })
  state.lastGasAt = sim.tick
}

/** A side's work by night: wiring parties, a raid, and gas shelling if the wind serves. */
function nightWork(sim: Simulation, side: Side, front: LineSpan, state: CommanderState): void {
  const enemyFront = frontLineSpan(sim.map.trenches, side === Side.French ? Side.German : Side.French)
  if (enemyFront === null) {
    return
  }
  const midZ = (front.forward + enemyFront.forward) / 2
  mendWire(sim, front.forward, midZ, (x, z) => wiringPartyCanReach(sim, side, x, z))
  if (state.raidSquad >= 0) {
    advanceRaid(sim, state)
  } else if (sim.tick - state.lastRaidAt >= dayTicks(sim) && sim.rng.next() < RAID.chancePerCheck) {
    startRaid(sim, side, state)
  }
  if (
    sim.tick - state.lastGasAt >= dayTicks(sim) &&
    gasWeather(sim, side) &&
    sim.rng.next() < NIGHT_GAS.chancePerCheck
  ) {
    shellWithGas(sim, side, enemyFront, state)
  }
}

/**
 * The commanders on both sides, every few seconds: a side that finds a stretch of its front line lost sends the reserves
 * near it to retake that stretch once they've had time to organise, after two minutes of shelling it, or, in the last
 * hours of the night, at the dawn stand-to. One counter-attack per side. By night they send out wiring parties, a raid,
 * and gas when the wind serves; a raid still out at dawn keeps coming home.
 */
export function commanderSystem(sim: Simulation): void {
  if (sim.tick % (CHECK_SECONDS * TICK_RATE) !== 0) {
    return
  }
  for (const side of [Side.French, Side.German]) {
    const state = sim.commanders[side]
    const front = frontLineSpan(sim.map.trenches, side)
    if (front === null) {
      continue
    }
    if (isNight(sim)) {
      nightWork(sim, side, front, state)
    } else if (state.raidSquad >= 0) {
      advanceRaid(sim, state)
    }
    if (state.assaultAt >= 0 && sim.tick >= state.assaultAt) {
      state.assaultAt = -1
      assault(sim, side, front, state)
      continue
    }
    if (state.counterAttackedAt >= 0) {
      continue
    }
    // The lost stretch, as it stands: it grows while the enemy widens his break-in and the reserves form up.
    const lost = lostStretch(sim, side)
    if (state.lostAt < 0) {
      if (lost) {
        state.lostAt = sim.tick
        state.lostFromX = lost.fromX
        state.lostToX = lost.toX
      }
      continue
    }
    if (lost) {
      state.lostFromX = Math.min(state.lostFromX, lost.fromX)
      state.lostToX = Math.max(state.lostToX, lost.toX)
    }
    if (
      sim.tick - state.lostAt >= COUNTER_ATTACK_DELAY * TICK_RATE &&
      reservesOf(sim, side).length > 0 &&
      !dawnWithin(sim, WAIT_FOR_DAWN_HOURS)
    ) {
      state.counterAttackedAt = sim.tick
      state.assaultAt = sim.tick + PREPARATION.seconds * TICK_RATE
      prepareCounterAttack(sim, side, front, state)
    }
  }
}
