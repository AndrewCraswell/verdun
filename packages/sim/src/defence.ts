import { frontLineSpan } from "./artillery.ts"
import { applyCommand } from "./commands.ts"
import { Side } from "./components.ts"
import { type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"
import { isAlive, type Squad } from "./squads.ts"

/**
 * Each side looks at its front line this often, in seconds. Kept in seconds and converted where used: this module and
 * simulation.ts import each other.
 */
const CHECK_SECONDS = 2
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
const ODDS = 1.5
/** At most this many squads go to one break-in in one look: the rest come if it's still needed at the next. */
const SQUADS_PER_LOOK = 2
/** A reserve squad goes only if it has at least this many men standing. */
const FIT_TO_GO = 4
/**
 * When an attack comes (the side calls its SOS barrage), this share of its reserve squads goes up to man the front line
 * at once, each straight up from where it waits; the rest stay below for the counter-thrust.
 */
const ALARM_SHARE = 0.5

/** What each side's defence has done: when it sent reserves up to the front line on the alarm, or -1. */
export interface DefenceState {
  readonly alarmedAt: Record<Side, number>
}

export function createDefence(): DefenceState {
  return { alarmedAt: { [Side.French]: -1, [Side.German]: -1 } }
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
 * Sends half a side's reserves up to its front line, each squad straight up from where it waits, the moment the side
 * calls its SOS barrage: an attack is coming across no man's land and the line needs every rifle.
 */
function reinforceOnAlarm(sim: Simulation, side: Side, lineZ: number): void {
  const state = sim.defence
  if (state.alarmedAt[side] >= 0 || sim.artillery.sosCalledAt[side] < 0) {
    return
  }
  state.alarmedAt[side] = sim.tick
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
 * reserves that are left, and counter-thrusts stop. When an attack comes, half the reserves go up to the line first.
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
