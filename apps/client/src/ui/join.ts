import { mapDepth, mapWidth } from "@verdun/map"
import { type EntityId, isAlive, type Simulation, type Squad, type SquadOrder, TAKE_OVER_MIN_MEN } from "@verdun/sim"
import { type GroundArea, squareName, trenchOwner } from "./sector/plan.ts"

/**
 * The join screen's choices (S8 in docs/design/interface.md, docs/design/soldier-and-squad.md#joining-the-battle): the
 * squad held for the player, the squads of their side in the line they can take over instead, and the fresh squads in
 * the reserve line, each with its men, order, place and distance from the enemy, and why it can't be taken when it can't.
 *
 * Read from the battle's mirror on the page, so the rules are counted here the way the simulation's `joinRefusal` counts
 * them, without its spatial index.
 */

/** No enemy within this many metres of a squad's men: the simulation's `TAKE_OVER_CLEAR`. */
const CLEAR = 30
/** An objective this close names the place: "near Fleury crossroads". */
const NEAR = 90

export interface JoinChoice {
  readonly squad: number
  /** "Squad 3", by its number on the side's roll. */
  readonly name: string
  readonly men: number
  /** What it's doing: "Holding", "In reserve, in the dugouts". */
  readonly order: string
  /** Where it stands: "near Fleury crossroads", "in square C4". */
  readonly place: string
  /** Metres from its middle to the enemy's nearest fire trench, or null with none on the map. */
  readonly fromEnemy: number | null
  /** Where it stands on the ground: the middle of its men, in metres. */
  readonly at: { readonly x: number; readonly z: number }
  /** Why it can't be taken, in words, or null when it can. */
  readonly refusal: string | null
}

export interface JoinChoices {
  /** The squad held for the player. */
  readonly held: JoinChoice
  /** Squads holding the line. */
  readonly line: readonly JoinChoice[]
  /** Fresh squads waiting in the reserve line. */
  readonly reserve: readonly JoinChoice[]
}

const ORDERS: Readonly<Record<SquadOrder["kind"], string>> = {
  follow: "Following its corporal",
  hold: "Holding its stretch of trench",
  reserve: "In reserve, in the dugouts",
  advance: "Advancing",
  creep: "Following the barrage",
  raid: "Out on a raid"
}

/** Where a point is, in words: near the nearest objective, or in its square. */
export function placeName(sim: Simulation, x: number, z: number): string {
  let nearest: { name: string; distance: number } | null = null
  for (const objective of sim.objectives) {
    const distance = Math.hypot(objective.x - x, objective.z - z)
    if (distance < NEAR && (!nearest || distance < nearest.distance)) {
      nearest = { name: objective.name, distance }
    }
  }
  // "near the mine craters", not "near The mine craters".
  return nearest ? `near ${nearest.name.replace(/^The /, "the ")}` : `in square ${squareName(sim.map, x, z)}`
}

function middleOf(sim: Simulation, members: readonly EntityId[]): { x: number; z: number } {
  const { x, z } = sim.soldiers.position
  const count = Math.max(1, members.length)
  return {
    x: members.reduce((sum, member) => sum + x[member], 0) / count,
    z: members.reduce((sum, member) => sum + z[member], 0) / count
  }
}

/** Metres from a point to the nearest of the enemy's fire trenches. */
function toEnemyLine(sim: Simulation, squad: Squad, point: { x: number; z: number }): number | null {
  let best = Infinity
  for (const trench of sim.map.trenches) {
    if (trenchOwner(trench, squad.side) !== "theirs") {
      continue
    }
    for (let index = 0; index + 1 < trench.points.length; index++) {
      const [ax, az] = trench.points[index]!
      const [bx, bz] = trench.points[index + 1]!
      const dx = bx - ax
      const dz = bz - az
      const length = dx * dx + dz * dz
      const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - ax) * dx + (point.z - az) * dz) / length))
      best = Math.min(best, Math.hypot(point.x - (ax + t * dx), point.z - (az + t * dz)))
    }
  }
  return Number.isFinite(best) ? best : null
}

function inContact(sim: Simulation, squad: Squad, living: readonly EntityId[]): boolean {
  const { position, side } = sim.soldiers
  const enemies: EntityId[] = []
  for (const other of sim.squads) {
    if (other.side !== squad.side) {
      enemies.push(...other.members.filter((member) => isAlive(sim, member)))
    }
  }
  return living.some((member) =>
    enemies.some(
      (enemy) =>
        side.value[enemy] !== squad.side &&
        Math.hypot(position.x[enemy] - position.x[member], position.z[enemy] - position.z[member]) < CLEAR
    )
  )
}

/** The choices of squad for a player joining with `player`, the squad held for them. */
export function joinChoices(sim: Simulation, player: Squad): JoinChoices {
  const ours = sim.squads.filter(
    (squad) => squad.side === player.side && (squad === player || squad.controller === "ai")
  )
  const choice = (squad: Squad, number: number): JoinChoice => {
    const living = squad.members.filter((member) => isAlive(sim, member))
    const middle = middleOf(sim, living.length > 0 ? living : squad.members)
    let refusal: string | null = null
    if (squad !== player) {
      if (living.length < TAKE_OVER_MIN_MEN) {
        refusal = living.length === 0 ? "No men left: replacements are coming up" : `Only ${living.length} men standing`
      } else if (inContact(sim, squad, living)) {
        refusal = "In contact with the enemy"
      }
    }
    return {
      squad: squad.id,
      name: `Squad ${number}`,
      men: living.length,
      order: ORDERS[squad.order.kind],
      place: placeName(sim, middle.x, middle.z),
      fromEnemy: toEnemyLine(sim, player, middle),
      at: middle,
      refusal
    }
  }
  const numbered = ours.map((squad, index) => ({ squad, choice: choice(squad, index + 1) }))
  const held = numbered.find((each) => each.squad === player)?.choice ?? choice(player, 0)
  const others = numbered.filter((each) => each.squad !== player)
  // Nearest the fighting first: that's where most players want to be, and the quiet stretches follow.
  const byFront = (a: JoinChoice, b: JoinChoice) => (a.fromEnemy ?? Infinity) - (b.fromEnemy ?? Infinity)
  return {
    held,
    line: others
      .filter((each) => each.squad.order.kind !== "reserve")
      .map((each) => each.choice)
      .sort(byFront),
    reserve: others
      .filter((each) => each.squad.order.kind === "reserve")
      .map((each) => each.choice)
      .sort(byFront)
  }
}

/** Ground beyond the squads, in metres, that the join map shows round them. */
const AROUND = 40

/**
 * The stretch of ground to show the choices on: every squad, and out to the enemy's nearest line, so the player sees
 * where each stands and what's in front of it, and the pins sit far enough apart to tell.
 */
export function joinArea(sim: Simulation, side: Squad["side"], choices: readonly JoinChoice[]): GroundArea {
  const map = sim.map
  if (choices.length === 0) {
    return { minX: 0, maxX: mapWidth(map), minZ: 0, maxZ: mapDepth(map) }
  }
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const { at } of choices) {
    minX = Math.min(minX, at.x)
    maxX = Math.max(maxX, at.x)
    minZ = Math.min(minZ, at.z)
    maxZ = Math.max(maxZ, at.z)
  }
  // The enemy's line nearest the squads: the one whose middle lies closest to theirs.
  const middle = (minZ + maxZ) / 2
  let nearest: readonly (readonly [number, number])[] | null = null
  let gap = Infinity
  for (const trench of map.trenches) {
    if (trenchOwner(trench, side) !== "theirs" || trench.points.length === 0) {
      continue
    }
    const z = trench.points.reduce((sum, [, pointZ]) => sum + pointZ, 0) / trench.points.length
    if (Math.abs(z - middle) < gap) {
      gap = Math.abs(z - middle)
      nearest = trench.points
    }
  }
  for (const [, z] of nearest ?? []) {
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  return {
    minX: Math.max(0, minX - AROUND),
    maxX: Math.min(mapWidth(map), maxX + AROUND),
    minZ: Math.max(0, minZ - AROUND),
    maxZ: Math.min(mapDepth(map), maxZ + AROUND)
  }
}
