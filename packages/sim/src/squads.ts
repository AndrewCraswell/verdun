import { type EntityId, hasComponent } from "bitecs"
import { barrageLine } from "./artillery.ts"
import { BROKEN_MORALE } from "./combat.ts"
import { applyCommand } from "./commands.ts"
import type { Side } from "./components.ts"
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

export interface Squad {
  readonly id: number
  readonly side: Side
  /** Members in slot order: slot 1 first. Fallen members stay listed. */
  readonly members: readonly EntityId[]
  /** The soldier the squad forms on; for the player's squad, the one they control. -1 once everyone has fallen. */
  leader: EntityId
  order: SquadOrder
  /** Who moves the leader: a player steering them, or the squad's own orders (the leader joins an advance). */
  readonly controller: "player" | "ai"
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
 * Where a member should stand after an advance: a line running east-west across the target, parallel to the front.
 * Fixed to the front rather than to the direction of travel, so the line stays put as soldiers arrive.
 */
function advanceSlot(
  sim: Simulation,
  order: { x: number; z: number },
  slot: number,
  count: number
): { x: number; z: number } {
  const lateral = (slot - (count - 1) / 2) * FORMATION_SPACING
  return clampToMap(sim, order.x + lateral, order.z)
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

/** Whether a creeping barrage has lifted past a squad's objective, or finished. */
function barrageLifted(sim: Simulation, order: { mission: number; objectiveZ: number }): boolean {
  const line = barrageLine(sim, order.mission)
  const start = sim.artillery.missions[order.mission]?.z ?? order.objectiveZ
  const direction = Math.sign(order.objectiveZ - start) || 1
  return line === null || (line - order.objectiveZ) * direction > 0
}

/**
 * Sends a soldier to a point unless they're already close. Applied directly rather than queued: commands are for input
 * from outside the simulation, and squad decisions are made inside it.
 */
function orderMoveTo(sim: Simulation, soldier: EntityId, target: { x: number; z: number }, run = false): void {
  const { position } = sim.soldiers
  const dx = target.x - position.x[soldier]
  const dz = target.z - position.z[soldier]
  if (dx * dx + dz * dz > SLOT_TOLERANCE * SLOT_TOLERANCE) {
    applyCommand(sim, { type: "move-to", soldier, x: target.x, z: target.z, run })
  }
}

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
          orderMoveTo(sim, member, target, barrageLifted(sim, order))
        }
        return
      }
      orderMoveTo(
        sim,
        member,
        order.kind === "follow" ? followSlot(sim, squad.leader, slot) : advanceSlot(sim, order, slot, followers.length)
      )
    })
  }
}
