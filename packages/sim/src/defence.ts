import { frontLine, frontLineSpan, type LineSpan } from "./artillery.ts"
import { applyCommand } from "./commands.ts"
import { Side } from "./components.ts"
import { type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"
import { isAlive, type Squad } from "./squads.ts"
import { nearestTrench, placeOn, pointAlong } from "./trench-lines.ts"

/**
 * Each side looks at its front line this often, in seconds. Kept in seconds and converted where used: this module and
 * simulation.ts import each other.
 */
const CHECK_SECONDS = 5
/** Soldiers within this distance of the front line's span are in it, in metres: its bays, traverses and the ground just round them. */
const FRONT_BAND = 15
/** The front line is judged in stretches this wide, in metres: about a company's frontage of bays. */
const STRETCH = 60
/** A stretch with at least this many enemies in it has been broken into. */
const BREAK_IN = 3
/**
 * Defenders sent to a break-in are enough to outnumber the enemies there by this much, counting those still holding the
 * stretch. Each squad counts for its men standing.
 */
const ODDS = 2.5
/** At most this many squads go to one break-in in one look: the rest come if it's still needed at the next. */
const SQUADS_PER_LOOK = 3
/** A reserve squad goes only if it has at least this many men standing. */
const FIT_TO_GO = 4
/**
 * When an attack comes (the side calls its SOS barrage), this share of its reserve squads goes up to man the front line
 * at once; the rest stay below for the counter-thrust. Warned of where it's coming, they are the reserves behind the
 * stretch being shelled, out to `ALARM_BEYOND` either side of it; otherwise every other squad along the front.
 */
const ALARM_SHARE = 0.5
/** Warned of the stretch, the reserves that man the line on the alarm are those this far either side of it, in metres. */
const ALARM_BEYOND = 50
/**
 * A deliberate bombardment of the front line warns of an attack on the stretch it falls on: up to this many reserve
 * squads from elsewhere along the front file through the trenches to wait below behind it, from no further off than
 * `SHIFT_REACH` metres. A long preparation buys the defender the time to gather; a barrage alone gives him none.
 */
const SHIFT_SQUADS = 4
const SHIFT_REACH = 300
/** A squad shifting along the line has arrived when its leader is this close to its place, in metres. */
const SHIFT_ARRIVED = 8
/** Shells falling this far either side of the front line's bays are on it, in metres. */
const ON_THE_LINE = 15

/** The stretch of front line a side's bombardment warns of, east to west. */
export interface Threatened {
  readonly fromX: number
  readonly toX: number
}

/**
 * What each side's defence has done: when it sent reserves up to the front line on the alarm, or -1; when a bombardment
 * of its front line first warned it of an attack, or -1, and the stretch it falls on; and the reserve squads on their
 * way to wait behind that stretch.
 */
export interface DefenceState {
  readonly alarmedAt: Record<Side, number>
  readonly warnedAt: Record<Side, number>
  readonly threatened: Record<Side, Threatened | null>
  readonly shifting: Record<Side, number[]>
}

export function createDefence(): DefenceState {
  return {
    alarmedAt: { [Side.French]: -1, [Side.German]: -1 },
    warnedAt: { [Side.French]: -1, [Side.German]: -1 },
    threatened: { [Side.French]: null, [Side.German]: null },
    shifting: { [Side.French]: [], [Side.German]: [] }
  }
}

/** A copy of a defence state, sharing nothing with it: for snapshots. */
export function copyDefence(state: DefenceState): DefenceState {
  const threatened = (side: Side) => {
    const stretch = state.threatened[side]
    return stretch === null ? null : { ...stretch }
  }
  return {
    alarmedAt: { ...state.alarmedAt },
    warnedAt: { ...state.warnedAt },
    threatened: { [Side.French]: threatened(Side.French), [Side.German]: threatened(Side.German) },
    shifting: { [Side.French]: [...state.shifting[Side.French]], [Side.German]: [...state.shifting[Side.German]] }
  }
}

/** Puts a saved defence state back into a simulation's own. */
export function restoreDefence(target: DefenceState, saved: DefenceState): void {
  const copy = copyDefence(saved)
  Object.assign(target.alarmedAt, copy.alarmedAt)
  Object.assign(target.warnedAt, copy.warnedAt)
  Object.assign(target.threatened, copy.threatened)
  for (const side of [Side.French, Side.German]) {
    target.shifting[side].splice(0, target.shifting[side].length, ...copy.shifting[side])
  }
}

/** A bombardment of a side's front line warning it of an attack, for the battle log. */
export interface WarnedEvent {
  readonly type: "warned"
  readonly side: Side
  readonly fromX: number
  readonly toX: number
  /** Reserve squads sent along the line to wait behind it. */
  readonly squads: number
}

/** Reserves going up to man the front line when an attack comes, for the battle log and sound. */
export interface StandToEvent {
  readonly type: "reserves-up"
  readonly side: Side
  readonly squads: number
}

/** Squads sent in a counter-thrust, for the battle log and sound. */
export interface CounterThrustEvent {
  readonly type: "counter-thrust"
  readonly side: Side
  /** The middle of the stretch broken into, east to west. */
  readonly x: number
  readonly squads: number
}

const enemyOf = (side: Side): Side => (side === Side.French ? Side.German : Side.French)

/** The squads a side keeps back in reserve, fit to go, nearest to `x` first. */
function reservesNear(sim: Simulation, side: Side, x: number): Squad[] {
  const standing = (squad: Squad) => squad.members.filter((member) => isAlive(sim, member)).length
  const distance = (squad: Squad) => Math.abs(sim.soldiers.position.x[squad.leader] - x)
  return sim.squads
    .filter(
      (squad) =>
        squad.side === side &&
        squad.controller === "ai" &&
        squad.order.kind === "reserve" &&
        squad.leader >= 0 &&
        standing(squad) >= FIT_TO_GO
    )
    .sort((a, b) => distance(a) - distance(b) || a.id - b.id)
}

/**
 * The stretch of a side's front line under a deliberate bombardment by the enemy, or null: his missions firing now that
 * fall on the line and cut wire. A creeping barrage passing over, or an SOS barrage, warns of nothing more than is
 * already plain.
 */
function shelledStretch(sim: Simulation, side: Side, front: LineSpan): Threatened | null {
  const near = Math.min(front.forward, front.rear) - ON_THE_LINE
  const far = Math.max(front.forward, front.rear) + ON_THE_LINE
  let fromX = Infinity
  let toX = -Infinity
  for (const mission of sim.artillery.missions) {
    const firing = sim.tick >= mission.startTick + mission.delay * TICK_RATE
    const onLine = mission.lineZ + mission.band / 2 >= near && mission.lineZ - mission.band / 2 <= far
    if (
      mission.side !== side &&
      !mission.finished &&
      firing &&
      mission.creep === undefined &&
      mission.cutsWire !== false &&
      onLine
    ) {
      fromX = Math.min(fromX, mission.fromX)
      toX = Math.max(toX, mission.toX)
    }
  }
  return fromX <= toX ? { fromX, toX } : null
}

/** The point on the trench a squad waits in level with `x`, or null if that trench doesn't reach near it. */
function placeAlongOwnTrench(sim: Simulation, squad: Squad, x: number): { x: number; z: number } | null {
  const lx = sim.soldiers.position.x[squad.leader]
  const lz = sim.soldiers.position.z[squad.leader]
  const own = nearestTrench(sim.map, lx, lz)
  const place = own === null ? null : placeOn(own.trench, x, lz)
  if (own === null || place === null) {
    return null
  }
  const point = pointAlong(own.trench, place.along)
  return Math.abs(point.x - x) <= ALARM_BEYOND ? { x: point.x, z: point.z } : null
}

/**
 * Warned by a bombardment of its front line, a side gathers reserves behind the stretch shelled: squads waiting
 * elsewhere along the front file through the trenches, each along the trench it waits in, to wait below behind it.
 * Those already there stay. Squads on their way go back to waiting when they arrive.
 */
function gatherOnWarning(sim: Simulation, side: Side, front: LineSpan): void {
  const state = sim.defence
  const shifting = state.shifting[side]
  for (let index = shifting.length - 1; index >= 0; index--) {
    const squad = sim.squads[shifting[index] ?? -1]
    const order = squad?.order
    if (!squad || squad.leader < 0 || order?.kind !== "advance") {
      shifting.splice(index, 1)
      continue
    }
    const { x, z } = sim.soldiers.position
    if (Math.hypot(x[squad.leader] - order.x, z[squad.leader] - order.z) <= SHIFT_ARRIVED) {
      squad.order = { kind: "reserve" }
      shifting.splice(index, 1)
    }
  }
  if (sim.artillery.sosCalledAt[side] >= 0) {
    return
  }
  const shelled = shelledStretch(sim, side, front)
  const known = state.threatened[side]
  if (shelled === null || (known !== null && shelled.fromX >= known.fromX && shelled.toX <= known.toX)) {
    return
  }
  const stretch =
    known === null ? shelled : { fromX: Math.min(known.fromX, shelled.fromX), toX: Math.max(known.toX, shelled.toX) }
  state.threatened[side] = stretch
  const first = state.warnedAt[side] < 0
  if (first) {
    state.warnedAt[side] = sim.tick
  }
  const middle = (stretch.fromX + stretch.toX) / 2
  const outside = (squad: Squad) => {
    const x = sim.soldiers.position.x[squad.leader]
    return x < stretch.fromX || x > stretch.toX
  }
  const going = reservesNear(sim, side, middle)
    .filter((squad) => outside(squad) && Math.abs(sim.soldiers.position.x[squad.leader] - middle) <= SHIFT_REACH)
    .slice(0, Math.max(0, SHIFT_SQUADS - shifting.length))
  const width = stretch.toX - stretch.fromX
  let sent = 0
  going.forEach((squad, index) => {
    const place = placeAlongOwnTrench(sim, squad, stretch.fromX + ((index + 0.5) * width) / going.length)
    if (place !== null) {
      applyCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "advance", ...place, trench: true } })
      shifting.push(squad.id)
      sent++
    }
  })
  if (first || sent > 0) {
    sim.events.push({ type: "warned", side, fromX: stretch.fromX, toX: stretch.toX, squads: sent })
  }
}

/**
 * Sends half a side's reserves up to man its front line the moment the side calls its SOS barrage: an attack is coming
 * across no man's land and the line needs every rifle. Warned of the stretch, they are the reserves behind it, and go
 * up by the trenches; unwarned, every other squad along the front goes straight up from where it waits.
 */
function reinforceOnAlarm(sim: Simulation, side: Side, lineZ: number): void {
  const state = sim.defence
  if (state.alarmedAt[side] >= 0 || sim.artillery.sosCalledAt[side] < 0) {
    return
  }
  state.alarmedAt[side] = sim.tick
  const threatened = state.threatened[side]
  const line = frontLine(sim.map.trenches, side)
  if (threatened !== null && line !== null) {
    const middle = (threatened.fromX + threatened.toX) / 2
    const behind = reservesNear(sim, side, middle).filter(
      (squad) =>
        sim.soldiers.position.x[squad.leader] >= threatened.fromX - ALARM_BEYOND &&
        sim.soldiers.position.x[squad.leader] <= threatened.toX + ALARM_BEYOND
    )
    const going = behind.slice(0, Math.ceil(behind.length * ALARM_SHARE))
    for (const squad of going) {
      const point = pointAlong(line, placeOn(line, sim.soldiers.position.x[squad.leader], lineZ)?.along ?? 0)
      applyCommand(sim, {
        type: "squad-order",
        squad: squad.id,
        order: { kind: "advance", x: point.x, z: point.z, trench: true }
      })
    }
    if (going.length > 0) {
      sim.events.push({ type: "reserves-up", side, squads: going.length })
    }
    return
  }
  const reserves = sim.squads.filter(
    (squad) => squad.side === side && squad.controller === "ai" && squad.order.kind === "reserve" && squad.leader >= 0
  )
  // Every other squad, so the ones that go are spread along the front and the ones that stay are too.
  const going = reserves.filter((_, index) => index % Math.round(1 / ALARM_SHARE) === 0)
  for (const squad of going) {
    const x = sim.soldiers.position.x[squad.leader]
    applyCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "advance", x, z: lineZ } })
  }
  if (going.length > 0) {
    sim.events.push({ type: "reserves-up", side, squads: going.length })
  }
}

/**
 * The immediate counter-thrust, the German Gegenstoß and its French equivalent: when the enemy breaks into a stretch of
 * the front line and holds it in strength, the nearest reserves leave their dugouts and go straight up the
 * communication trenches to throw them out, without waiting for the guns, before the enemy can turn the trench round.
 * Once the commander finds the whole front line lost, its deliberate counter-attack, with its own bombardment, takes the
 * reserves that are left, and counter-thrusts stop. Warned by a bombardment, reserves gather behind the stretch shelled;
 * when the attack comes, half the reserves go up to the line first.
 */
export function defenceSystem(sim: Simulation): void {
  if (sim.tick % (CHECK_SECONDS * TICK_RATE) !== 0) {
    return
  }
  for (const side of [Side.French, Side.German]) {
    const front = frontLineSpan(sim.map.trenches, side)
    if (front === null) {
      continue
    }
    const lineZ = (front.forward + front.rear) / 2
    gatherOnWarning(sim, side, front)
    reinforceOnAlarm(sim, side, lineZ)
    if (sim.commanders[side].lostAt >= 0) {
      continue
    }
    const near = Math.min(front.forward, front.rear) - FRONT_BAND
    const far = Math.max(front.forward, front.rear) + FRONT_BAND
    const stretches = Math.ceil((sim.map.columns * sim.map.cellSize) / STRETCH)
    const own = Array.from({ length: stretches }, () => 0)
    const enemy = Array.from({ length: stretches }, () => 0)
    for (const soldier of soldierIds(sim)) {
      const z = sim.soldiers.position.z[soldier]
      if (z < near || z > far) {
        continue
      }
      const stretch = Math.min(stretches - 1, Math.floor(sim.soldiers.position.x[soldier] / STRETCH))
      if (sim.soldiers.side.value[soldier] === side) {
        own[stretch]! += 1
      } else if (sim.soldiers.side.value[soldier] === enemyOf(side)) {
        enemy[stretch]! += 1
      }
    }
    enemy.forEach((intruders, stretch) => {
      const holding = own[stretch]!
      if (intruders < BREAK_IN || holding > intruders) {
        return
      }
      const x = (stretch + 0.5) * STRETCH
      // Men already sent to this stretch and on their way count, or every look would send more after them.
      const onTheirWay = sim.squads
        .filter(
          (squad) =>
            squad.side === side && squad.order.kind === "advance" && squad.order.x === x && squad.order.z === lineZ
        )
        .reduce((men, squad) => men + squad.members.filter((member) => isAlive(sim, member)).length, 0)
      let needed = Math.ceil(intruders * ODDS) - holding - onTheirWay
      let sent = 0
      for (const squad of reservesNear(sim, side, x)) {
        if (needed <= 0 || sent >= SQUADS_PER_LOOK) {
          break
        }
        applyCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "advance", x, z: lineZ } })
        needed -= squad.members.filter((member) => isAlive(sim, member)).length
        sent++
      }
      if (sent > 0) {
        sim.events.push({ type: "counter-thrust", side, x, squads: sent })
      }
    })
  }
}
