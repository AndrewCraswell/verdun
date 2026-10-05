import { type EntityId, hasComponent } from "bitecs"
import { barrageLine } from "./artillery.ts"
import { BROKEN_MORALE } from "./combat.ts"
import { applyCommand } from "./commands.ts"
import type { Side } from "./components.ts"
import { coverNear } from "./cover.ts"
import { type NavGoal, nextWaypoint } from "./navigation.ts"
import { clampToMap, type Simulation } from "./simulation.ts"

/** What a squad's soldiers do when the player isn't steering them. */
export type SquadOrder =
  /** Keep formation behind the leader. */
  | { readonly kind: "follow" }
  /** Stay where they are. */
  | { readonly kind: "hold" }
  /**
   * Wait in reserve: stay put and, in a trench, down its dugouts out of harm's way, all but the sentry, until sent in.
   */
  | { readonly kind: "reserve" }
  /** Move to a point and spread out in a line there. */
  | { readonly kind: "advance"; readonly x: number; readonly z: number }
  /**
   * Follow a creeping barrage: keep `standoff` metres behind its line, centred on `x`, never falling back. When the
   * barrage lifts beyond the objective, rush the objective line.
   */
  | {
      readonly kind: "creep"
      readonly mission: number
      readonly x: number
      readonly standoff: number
      readonly objectiveZ: number
    }

  /**
   * A trench raid by night: crawl out to the enemy's wire, rush into his trench at `x, z` to bomb, kill and take
   * prisoners, then crawl home to `homeX, homeZ`. The commander moves the raid from phase to phase.
   */
  | {
      readonly kind: "raid"
      readonly x: number
      readonly z: number
      readonly homeX: number
      readonly homeZ: number
      readonly phase: RaidPhase
    }

/** Out to the enemy's wire, into his trench, and home again. */
export type RaidPhase = "out" | "in" | "home"

/** Raiders wait this far short of the enemy's trench, in metres: at the edge of his wire, before the rush. */
export const RAID_STANDOFF = 25

/** Where a raid is heading in its current phase. */
export function raidGoal(order: Extract<SquadOrder, { kind: "raid" }>): { x: number; z: number } {
  if (order.phase === "home") {
    return { x: order.homeX, z: order.homeZ }
  }
  const direction = Math.sign(order.z - order.homeZ) || 1
  return { x: order.x, z: order.phase === "out" ? order.z - direction * RAID_STANDOFF : order.z }
}

export interface Squad {
  readonly id: number
  readonly side: Side
  /** Members in slot order: slot 1 first. Fallen members stay listed. */
  members: EntityId[]
  /** The soldier the squad forms on; for the player's squad, the one they control. -1 once everyone has fallen. */
  leader: EntityId
  order: SquadOrder
  /**
   * Who moves the leader: a player steering them, or the squad's own orders (the leader joins an advance). Changes as
   * players join and leave (the `squad-controller` command).
   */
  controller: "player" | "ai"
}

/** Spacing between soldiers in a formation, in metres. Close enough to act together, far enough that one shell doesn't kill everyone. */
const FORMATION_SPACING = 3
/** Soldiers in each rank of a follow formation. */
const FORMATION_WIDTH = 4
/** Squads re-plan this often, in steps: four times a second. */
export const SQUAD_THINK_INTERVAL = 5
/** Soldiers within this distance of their slot stay put rather than shuffling. */
const SLOT_TOLERANCE = 1

/** Whether a soldier is still in the fight: neither fallen nor taken prisoner. */
export function isAlive(sim: Simulation, soldier: EntityId): boolean {
  return (
    soldier >= 0 &&
    !hasComponent(sim.world, soldier, sim.soldiers.dead) &&
    !hasComponent(sim.world, soldier, sim.soldiers.captured)
  )
}

/** Forms a squad from soldiers in slot order. The first is its leader; it starts out holding. */
export function createSquad(
  sim: Simulation,
  side: Side,
  members: readonly EntityId[],
  controller: Squad["controller"] = "ai"
): Squad {
  const squad: Squad = {
    id: sim.squads.length,
    side,
    members: [...members],
    leader: members[0] ?? -1,
    order: { kind: "hold" },
    controller
  }
  sim.squads.push(squad)
  for (const member of members) {
    sim.soldiers.squad.id[member] = squad.id
  }
  return squad
}

/** The first living member after `from` in slot order, wrapping around; -1 when everyone has fallen. */
export function nextLivingMember(sim: Simulation, squad: Squad, from: EntityId): EntityId {
  const start = Math.max(0, squad.members.indexOf(from))
  for (let offset = 1; offset <= squad.members.length; offset++) {
    const candidate = squad.members[(start + offset) % squad.members.length]
    if (candidate !== undefined && isAlive(sim, candidate)) {
      return candidate
    }
  }
  return -1
}

/** Where a member should stand: slots fan out in ranks behind the leader, relative to the way the leader faces. */
function followSlot(sim: Simulation, leader: EntityId, slot: number): { x: number; z: number } {
  const { position, facing } = sim.soldiers
  const forwardX = facing.x[leader]
  const forwardZ = facing.z[leader]
  const rightX = forwardZ
  const rightZ = -forwardX
  const lateral = ((slot % FORMATION_WIDTH) - (FORMATION_WIDTH - 1) / 2) * FORMATION_SPACING
  const back = FORMATION_SPACING * (1 + Math.floor(slot / FORMATION_WIDTH))
  return clampToMap(
    sim,
    position.x[leader] + rightX * lateral - forwardX * back,
    position.z[leader] + rightZ * lateral - forwardZ * back
  )
}

/**
 * Where a member should be after an advance: his place in a line running east-west across the target, parallel to the
 * front, or the nearest cover to it (see `coverNear`). Fixed to the front rather than to the direction of travel, so
 * the line stays put as soldiers arrive.
 */
function advanceSlot(
  sim: Simulation,
  order: { x: number; z: number },
  slot: number,
  count: number
): { x: number; z: number } {
  const lateral = (slot - (count - 1) / 2) * FORMATION_SPACING
  const place = clampToMap(sim, order.x + lateral, order.z)
  return coverNear(sim, place.x, place.z)
}

/**
 * Where a member should be while following a creeping barrage: in a line `standoff` metres behind the barrage, or on the
 * objective once the barrage has lifted past it.
 */
function creepSlot(
  sim: Simulation,
  order: { mission: number; x: number; standoff: number; objectiveZ: number },
  slot: number,
  count: number
): { x: number; z: number } {
  const line = barrageLine(sim, order.mission)
  const start = sim.artillery.missions[order.mission]?.z ?? order.objectiveZ
  const direction = Math.sign(order.objectiveZ - start) || 1
  // The moment the barrage lifts off the objective, rush it: every second waiting lets its garrison climb out of their
  // dugouts and man the parapet.
  const behindBarrage =
    line === null || barrageLifted(sim, order) ? order.objectiveZ : line - direction * order.standoff
  // Don't run past the objective while the barrage is still falling beyond it.
  const z = direction > 0 ? Math.min(behindBarrage, order.objectiveZ) : Math.max(behindBarrage, order.objectiveZ)
  return advanceSlot(sim, { x: order.x, z }, slot, count)
}

/**
 * The barrage must be this far past the objective, in metres, before the infantry rush it: its shells fall about 20 m
 * either side of where they're laid, and men running into the objective as it lifted a metre beyond ran into them.
 */
const RUSH_CLEARANCE = 30

/** Whether a creeping barrage has lifted well past a squad's objective, or finished. */
function barrageLifted(sim: Simulation, order: { mission: number; objectiveZ: number }): boolean {
  const line = barrageLine(sim, order.mission)
  const start = sim.artillery.missions[order.mission]?.z ?? order.objectiveZ
  const direction = Math.sign(order.objectiveZ - start) || 1
  return line === null || (line - order.objectiveZ) * direction > RUSH_CLEARANCE
}

/**
 * Sends a soldier to a point unless they're already close. Applied directly rather than queued: commands are for input
 * from outside the simulation, and squad decisions are made inside it.
 */
function orderMoveTo(
  sim: Simulation,
  soldier: EntityId,
  target: { x: number; z: number },
  goal: NavGoal,
  run = false
): void {
  const { position } = sim.soldiers
  const dx = target.x - position.x[soldier]
  const dz = target.z - position.z[soldier]
  if (dx * dx + dz * dz > SLOT_TOLERANCE * SLOT_TOLERANCE) {
    // Round ruins and pools and through gaps in the wire, rather than straight through them.
    const via = nextWaypoint(sim, soldier, target, goal)
    if (via) {
      applyCommand(sim, { type: "move-to", soldier, x: via.x, z: via.z, run })
    }
  }
}

/**
 * A squad advancing under fire goes by bounds: half dash this far on to the nearest cover, in metres, while the other
 * half lie and fire, and then they change about. Fire and movement, as the infantry learned it by 1916.
 */
// Eight seconds of twenty steps; a literal, since importing TICK_RATE here would be circular at load time.
const BOUND = { metres: 15, steps: 8 * 20 } as const
/** Suppression at which a member counts his squad under fire. */
const UNDER_FIRE = 0.15
/** Advancing squads head for a stretch of ground this wide around their point, in metres. */
const ADVANCE_GOAL_RADIUS = 12
/** Squads following their leader head for ground this close to him, in metres, his place snapped to this grid. */
const FOLLOW_GOAL_RADIUS = 8
const FOLLOW_GOAL_SNAP = 8

/**
 * Keeps squads together a few times a second: replaces fallen leaders, then sends members to their place in the
 * current order. A squad's leader is never ordered about; the player (or later, a bot) moves them.
 */
export function squadSystem(sim: Simulation): void {
  for (const squad of sim.squads) {
    if (!isAlive(sim, squad.leader)) {
      squad.leader = nextLivingMember(sim, squad, squad.leader)
    }
  }
  if (sim.tick % SQUAD_THINK_INTERVAL !== 0) {
    return
  }
  for (const squad of sim.squads) {
    if (squad.leader < 0 || squad.order.kind === "hold" || squad.order.kind === "reserve") {
      continue
    }
    const order = squad.order
    // In an advance an AI squad's leader goes too; a player's leader goes where the player steers.
    const leaderMoves = order.kind !== "follow" && squad.controller === "ai"
    const followers = squad.members.filter((member) => (leaderMoves || member !== squad.leader) && isAlive(sim, member))
    const bounding =
      order.kind === "advance" &&
      squad.controller === "ai" &&
      followers.some((member) => sim.soldiers.suppression.value[member] >= UNDER_FIRE)
    // Which half is on the move: they change about every bound, by the clock, so every squad keeps the same rhythm.
    const movingHalf = Math.floor(sim.tick / BOUND.steps) % 2
    followers.forEach((member, slot) => {
      if (sim.soldiers.morale.value[member] < BROKEN_MORALE) {
        // Broken soldiers go to ground where they are.
        const { x, z } = sim.soldiers.position
        applyCommand(sim, { type: "move-to", soldier: member, x: x[member], z: z[member] })
        return
      }
      if (order.kind === "creep") {
        const target = creepSlot(sim, order, slot, followers.length)
        const direction = Math.sign(order.objectiveZ - sim.soldiers.position.z[member])
        // Never fall back: a soldier already ahead of their slot waits there for the barrage to move on. Once the
        // barrage has lifted off the objective, they run for it.
        if ((target.z - sim.soldiers.position.z[member]) * direction >= 0) {
          const goal: NavGoal = { kind: "line", z: target.z, direction: direction || 1 }
          orderMoveTo(sim, member, target, goal, barrageLifted(sim, order))
        }
        return
      }
      if (order.kind === "follow") {
        const { x, z } = sim.soldiers.position
        // Snapped to a coarse grid, so a moving leader doesn't call for a new route every few steps.
        orderMoveTo(sim, member, followSlot(sim, squad.leader, slot), {
          kind: "point",
          x: Math.round(x[squad.leader] / FOLLOW_GOAL_SNAP) * FOLLOW_GOAL_SNAP,
          z: Math.round(z[squad.leader] / FOLLOW_GOAL_SNAP) * FOLLOW_GOAL_SNAP,
          radius: FOLLOW_GOAL_RADIUS
        })
        return
      }
      const goal = order.kind === "raid" ? raidGoal(order) : order
      const navGoal: NavGoal = { kind: "point", x: goal.x, z: goal.z, radius: ADVANCE_GOAL_RADIUS }
      const place = advanceSlot(sim, goal, slot, followers.length)
      if (!bounding) {
        orderMoveTo(sim, member, place, navGoal)
        return
      }
      const { x, z } = sim.soldiers.position
      if (slot % 2 !== movingHalf) {
        // Down where he is, firing, while the others go.
        applyCommand(sim, { type: "move-to", soldier: member, x: x[member], z: z[member] })
        return
      }
      const dx = place.x - x[member]
      const dz = place.z - z[member]
      const distance = Math.sqrt(dx * dx + dz * dz)
      const next =
        distance > BOUND.metres
          ? coverNear(sim, x[member] + (dx / distance) * BOUND.metres, z[member] + (dz / distance) * BOUND.metres)
          : place
      orderMoveTo(sim, member, next, navGoal, true)
    })
  }
}
