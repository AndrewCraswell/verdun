import { pointsAlong, type Trench } from "@verdun/map"
import type { EntityId } from "bitecs"
import { toWeapon, Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import { clampToMap, type Simulation, spawnSoldier, TICK_RATE } from "./simulation.ts"
import { soldiersNear } from "./spatial.ts"
import { isAlive, type Squad } from "./squads.ts"

/** Men in a full squad. A wiped squad comes back at this strength while the pool can spare them. */
export const FULL_SQUAD = 8
/**
 * When the pool is empty a player's squad still comes back, with however many men can be scraped together from cooks,
 * runners and the lightly wounded. Nobody is ever refused a squad; they get a smaller one.
 */
export const SCRAPED_SQUAD = 3
/**
 * Seconds from a squad being wiped out to its replacement reaching the rear trench while the pool is full. Kept in
 * seconds and converted where used: this module and simulation.ts import each other.
 */
export const REDEPLOY_SECONDS = 30
/** Extra seconds, on top, once the pool is empty: replacements are slower to find as the reserves run down. */
const EMPTY_POOL_EXTRA_SECONDS = 60
/**
 * Below this share of its starting pool a side stops replacing bot squads and keeps what's left for the squads players
 * lead, so attrition shows: the line thins as the reserves run out.
 */
const BOT_RESERVE_SHARE = 0.25
/** Spacing of the replacements along the trench they arrive in, in metres. */
const ARRIVAL_SPACING = 3

/** A wiped-out squad's replacement, on its way up. */
export interface Arrival {
  readonly squad: number
  /** The step the replacements reach the rear trench. */
  readonly at: number
  /** Men coming up, already taken from the pool. */
  readonly men: number
  /** Where along the front they come up to, when the squad has no men left to say: one taken over by a player. */
  readonly x?: number
}

/** Each side's reinforcements for the sector: men held back to replace losses, and squads on their way up. */
export interface ReinforcementState {
  /**
   * Men still available behind the sector to refill squads. Fractional: an evacuated wounded man puts back half a man,
   * the chance he recovers in time to fight again.
   */
  readonly pool: Record<Side, number>
  /** Each side's pool at the start, to judge how far it has run down. */
  readonly full: Record<Side, number>
  /** Replacements on their way up, in the order squads were wiped out. */
  readonly arrivals: Arrival[]
}

/** A wiped-out player's squad taking over a bot squad's men, for the HUD and the battle log. */
export interface SquadTakenOverEvent {
  readonly type: "squad-taken-over"
  readonly side: Side
  /** The player's squad, which now has the men. */
  readonly squad: number
  /** The bot squad they came from, now empty and waiting for replacements. */
  readonly from: number
  readonly men: number
}

/** Replacements reaching the rear trench, for the battle log and for sound. */
export interface ReinforcementEvent {
  readonly type: "reinforcement"
  readonly side: Side
  readonly squad: number
  /** Men in the new squad. */
  readonly men: number
}

export function createReinforcements(pool: Partial<Record<Side, number>> = {}): ReinforcementState {
  const french = Math.max(0, pool[Side.French] ?? 0)
  const german = Math.max(0, pool[Side.German] ?? 0)
  return {
    pool: { [Side.French]: french, [Side.German]: german },
    full: { [Side.French]: french, [Side.German]: german },
    arrivals: []
  }
}

/**
 * Gives a side men to replace its losses, as the war map's daily allocation will. The pool after it is the mark the
 * side's reserves are judged against: full until losses draw it down again.
 */
export function allotReinforcements(sim: Simulation, side: Side, men: number): void {
  const state = sim.reinforcements
  state.pool[side] += Math.max(0, men)
  state.full[side] = state.pool[side]
}

/** Puts men back in a side's pool: the wounded carried back who will recover. */
export function returnToPool(sim: Simulation, side: Side, men: number): void {
  sim.reinforcements.pool[side] += Math.max(0, men)
}

/** Whether every member of a squad has fallen or been taken prisoner. */
export function isWipedOut(sim: Simulation, squad: Squad): boolean {
  return squad.members.every((member) => !isAlive(sim, member))
}

/** How far a side's pool has run down: 1 while it's full, 0 once it's empty. */
function poolShare(state: ReinforcementState, side: Side): number {
  const full = state.full[side]
  return full > 0 ? Math.min(1, state.pool[side] / full) : 0
}

/** Seconds until a wiped squad's replacement arrives, growing as the pool runs down. */
export function redeploySeconds(state: ReinforcementState, side: Side): number {
  return REDEPLOY_SECONDS + EMPTY_POOL_EXTRA_SECONDS * (1 - poolShare(state, side))
}

/** The step a squad's replacement arrives on, or -1 if none is on its way. */
export function arrivalOf(sim: Simulation, squad: Squad): number {
  return sim.reinforcements.arrivals.find((arrival) => arrival.squad === squad.id)?.at ?? -1
}

/**
 * How many men a side sends to replace a wiped squad, or 0 for none. A side that started with no pool never sends any,
 * so battles without reinforcements play as before. Squads players lead are always replaced, scraped together if the
 * pool is empty; bot squads only while the pool is healthy.
 */
function replacementSize(state: ReinforcementState, squad: Squad): number {
  if (state.full[squad.side] === 0) {
    return 0
  }
  const available = Math.min(FULL_SQUAD, Math.floor(state.pool[squad.side]))
  if (squad.controller === "player") {
    return available > 0 ? available : SCRAPED_SQUAD
  }
  return poolShare(state, squad.side) > BOT_RESERVE_SHARE ? available : 0
}

/** A side's rearmost fire trench facing the enemy: where replacements come up to, out of sight of the enemy's guns. */
function rearLine(trenches: readonly Trench[], side: Side): Trench | null {
  const facing = side === Side.French ? "north" : "south"
  const middle = (trench: Trench) => trench.points.reduce((sum, [, z]) => sum + z, 0) / trench.points.length
  const lines = trenches
    .filter((trench) => trench.kind === "fire" && trench.facing === facing)
    .sort((a, b) => (side === Side.French ? middle(a) - middle(b) : middle(b) - middle(a)))
  return lines[0] ?? null
}

/** Where the members of the squad were last, east to west: its replacements come up behind that stretch of front. */
function squadX(sim: Simulation, squad: Squad): number {
  const xs = squad.members.map((member) => sim.soldiers.position.x[member])
  return xs.length > 0 ? xs.reduce((sum, x) => sum + x, 0) / xs.length : 0
}

/**
 * Places for `count` men in the side's rear trench, nearest to `x`. Without a trench to come up to, they arrive at the
 * side's edge of the map.
 */
function arrivalPositions(sim: Simulation, side: Side, x: number, count: number): { x: number; z: number }[] {
  const trench = rearLine(sim.map.trenches, side)
  if (!trench) {
    const edge = side === Side.French ? ARRIVAL_SPACING : sim.map.rows * sim.map.cellSize - ARRIVAL_SPACING
    return Array.from({ length: count }, (_, slot) =>
      clampToMap(sim, x + (slot - (count - 1) / 2) * ARRIVAL_SPACING, edge)
    )
  }
  const rearZ = trench.points.reduce((sum, [, z]) => sum + z, 0) / trench.points.length
  return pointsAlong(trench, ARRIVAL_SPACING)
    .map(([px, pz], index) => ({ px, pz, index, distance: (px - x) ** 2 + (pz - rearZ) ** 2 }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, count)
    .sort((a, b) => a.index - b.index)
    .map(({ px, pz }) => ({ x: px, z: pz }))
}

/** Refills a wiped squad with `men` fresh men in its side's rear trench, keeping each slot's weapon. */
function bringUp(sim: Simulation, squad: Squad, men: number, x = squadX(sim, squad)): void {
  const weapons = squad.members.map((member) => sim.soldiers.weapon.kind[member])
  const recruits: EntityId[] = arrivalPositions(sim, squad.side, x, men).map(({ x, z }, slot) =>
    spawnSoldier(sim, {
      side: squad.side,
      x,
      z,
      weapon: toWeapon(weapons[slot] ?? Weapon.Rifle)
    })
  )
  for (const recruit of recruits) {
    sim.soldiers.squad.id[recruit] = squad.id
  }
  // The fallen give up their slots to the men replacing them; they still lie where they fell.
  squad.members.splice(0, squad.members.length, ...recruits)
  squad.leader = recruits[0] ?? -1
  // A player's squad waits for orders where it arrives. A bot squad goes below as a reserve, ready for a counter-attack.
  squad.order = squad.controller === "player" ? { kind: "hold" } : { kind: "reserve" }
  sim.events.push({ type: "reinforcement", side: squad.side, squad: squad.id, men })
}

/**
 * Replaces wiped-out squads from their side's pool. A squad is sent for the moment its last man falls or surrenders: its
 * men leave the pool then, so squads wiped out together can't all draw on the same men. They arrive in the side's rear
 * trench after a delay that grows as the pool runs down, then walk up like everyone else.
 */
export function reinforcementSystem(sim: Simulation): void {
  const state = sim.reinforcements
  for (const squad of sim.squads) {
    if (arrivalOf(sim, squad) >= 0 || !isWipedOut(sim, squad)) {
      continue
    }
    const men = replacementSize(state, squad)
    if (men > 0) {
      const at = sim.tick + Math.round(redeploySeconds(state, squad.side) * TICK_RATE)
      state.pool[squad.side] = Math.max(0, state.pool[squad.side] - Math.min(men, Math.floor(state.pool[squad.side])))
      state.arrivals.push({ squad: squad.id, at, men })
    }
  }
  for (let index = 0; index < state.arrivals.length;) {
    const arrival = state.arrivals[index]!
    const squad = sim.squads[arrival.squad]
    if (arrival.at > sim.tick) {
      index++
      continue
    }
    state.arrivals.splice(index, 1)
    if (squad && isWipedOut(sim, squad)) {
      bringUp(sim, squad, arrival.men, arrival.x)
    }
  }
}

/** A squad a player can take over must have at least this many men standing... */
export const TAKE_OVER_MIN_MEN = 4
/** ...and no enemy within this many metres of any of them: nobody takes over a fight in progress. */
export const TAKE_OVER_CLEAR = 30

/** Where a squad is: the middle of its men, standing or fallen. */
function squadMiddle(sim: Simulation, squad: Squad): { x: number; z: number } {
  const { x, z } = sim.soldiers.position
  const count = Math.max(1, squad.members.length)
  return {
    x: squad.members.reduce((sum, member) => sum + x[member], 0) / count,
    z: squad.members.reduce((sum, member) => sum + z[member], 0) / count
  }
}

/** Whether any enemy of a squad's side stands within `TAKE_OVER_CLEAR` of its living men. */
function inContact(sim: Simulation, squad: Squad, living: readonly EntityId[]): boolean {
  const { position, side } = sim.soldiers
  return living.some((member) =>
    soldiersNear(sim, position.x[member], position.z[member], TAKE_OVER_CLEAR).some((other) => {
      const dx = position.x[other] - position.x[member]
      const dz = position.z[other] - position.z[member]
      return (
        side.value[other] !== squad.side &&
        isAlive(sim, other) &&
        dx * dx + dz * dz <= TAKE_OVER_CLEAR * TAKE_OVER_CLEAR
      )
    })
  )
}

/**
 * The bot squads a wiped-out player's squad can take over, nearest first: its own side's, with at least four men
 * standing and none of them in contact. Taking one over is instant, so a player is back in the fight in seconds, not
 * after the walk up from the rear.
 */
export function takeOverCandidates(sim: Simulation, squad: Squad): Squad[] {
  if (squad.controller !== "player" || !isWipedOut(sim, squad)) {
    return []
  }
  const from = squadMiddle(sim, squad)
  const distance = (other: Squad) => {
    const middle = squadMiddle(sim, other)
    return (middle.x - from.x) ** 2 + (middle.z - from.z) ** 2
  }
  return sim.squads
    .filter((other) => {
      if (other === squad || other.side !== squad.side || other.controller !== "ai") {
        return false
      }
      const living = other.members.filter((member) => isAlive(sim, member))
      return living.length >= TAKE_OVER_MIN_MEN && !inContact(sim, other, living)
    })
    .sort((a, b) => distance(a) - distance(b) || a.id - b.id)
}

/**
 * Moves a bot squad's living men into a wiped-out player's squad: the player commands them from now on, under the
 * order they already had. The bot squad is left empty and is replaced from the pool like any wiped-out bot squad. Any
 * replacements already on their way to the player's squad go back to the pool. Returns whether it happened.
 */
export function takeOverSquad(sim: Simulation, squad: Squad, from: Squad): boolean {
  if (!takeOverCandidates(sim, squad).includes(from)) {
    return false
  }
  const state = sim.reinforcements
  const arrival = state.arrivals.findIndex((candidate) => candidate.squad === squad.id)
  if (arrival >= 0) {
    state.pool[squad.side] += state.arrivals[arrival]!.men
    state.arrivals.splice(arrival, 1)
  }
  const living = from.members.filter((member) => isAlive(sim, member))
  for (const member of living) {
    sim.soldiers.squad.id[member] = squad.id
  }
  squad.members.splice(0, squad.members.length, ...living)
  squad.leader = living[0] ?? -1
  squad.order = from.order
  // The bot squad is sent replacements behind the stretch it held, as if it had been wiped out there.
  const held = squadMiddle(sim, from)
  from.members.splice(0, from.members.length)
  from.leader = -1
  const men = replacementSize(state, from)
  if (men > 0) {
    const at = sim.tick + Math.round(redeploySeconds(state, from.side) * TICK_RATE)
    state.pool[from.side] = Math.max(0, state.pool[from.side] - Math.min(men, Math.floor(state.pool[from.side])))
    state.arrivals.push({ squad: from.id, at, men, x: held.x })
  }
  sim.events.push({ type: "squad-taken-over", side: squad.side, squad: squad.id, from: from.id, men: living.length })
  return true
}
