import type { BattlefieldMap } from "@verdun/map"
import { type EntityId, hasComponent } from "bitecs"
import { barrageLine } from "./artillery.ts"
import { clearOfScenery, Climbing, Obstacle, wayAhead } from "./body.ts"
import { BROKEN_MORALE } from "./combat.ts"
import { applyCommand } from "./commands.ts"
import { Side } from "./components.ts"
import { coverNear } from "./cover.ts"
import { inCover } from "./hollows.ts"
import { type NavGoal, nextWaypoint } from "./navigation.ts"
import { clampToMap, type Simulation } from "./simulation.ts"
import { isInTrench } from "./stance.ts"
import { FIRE_STEP_MIDDLE, nearestTrench, onFireStep, placeOn, pointAlong } from "./trench-lines.ts"
import { acrossFence, fenceAhead, startVault, vaultLanding } from "./vault.ts"

/** A point on the ground. */
interface Place {
  readonly x: number
  readonly z: number
}

/** A walking stride in a step, in metres: 1.4 m/s at twenty steps a second, how far ahead a man looks for a wall. */
const WALKING_STRIDE = 1.4 / 20

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
  /**
   * Move to a point and spread out in a line there; or, `trench`, file there along the trenches, below the parapet, and
   * take places along the trench at it, as men moved up behind their own line.
   */
  | { readonly kind: "advance"; readonly x: number; readonly z: number; readonly trench?: boolean }
  /** Get to a point fast: everyone runs while his breath lasts, no bounds, and spreads out in a line there. */
  | { readonly kind: "run-to"; readonly x: number; readonly z: number }
  /**
   * Fire on an area where they stand: every man who can see it shoots into it at a steady rate whether or not he sees
   * anyone there, keeping a gun or a bay's heads down while others move.
   */
  | { readonly kind: "suppress"; readonly x: number; readonly z: number }
  /** Fall back at a run to a trench of their own behind them (see `withdrawPoint`), and hold it. */
  | { readonly kind: "withdraw"; readonly x: number; readonly z: number }
  /** Go to ground in the best cover a few metres around a point, in a line, and keep low until told otherwise. */
  | { readonly kind: "dig-in"; readonly x: number; readonly z: number }
  /**
   * Close up on the leader: shaken and broken men near him get up and steady much faster, at his voice. They stay
   * closed up on him until given another order.
   */
  | { readonly kind: "rally" }
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

/**
 * Where a man boxed into a corner steps to, `SIDESTEP` metres off: the free way round that heads most nearly `toward`
 * (a unit vector) where he's going, or, failing that, the freest way back. Null where every way is walled in.
 */
export function wayOut(
  map: BattlefieldMap,
  x: number,
  z: number,
  toward: { readonly x: number; readonly z: number }
): Place | null {
  let best: Place | null = null
  let bestScore = 0
  for (let index = 0; index < SIDESTEP_WAYS; index++) {
    const angle = (index * 2 * Math.PI) / SIDESTEP_WAYS
    const ax = Math.cos(angle)
    const az = Math.sin(angle)
    const free = wayAhead(map, x, z, ax, az, WALKING_STRIDE, Climbing.Ordered)
    const freeShare = Math.sqrt(free.x * free.x + free.z * free.z)
    // Heading on counts most, but backing off a little beats standing boxed in.
    const score = freeShare * (1.5 + ax * toward.x + az * toward.z)
    if (freeShare > 0.5 && score > bestScore) {
      bestScore = score
      best = clearOfScenery(map, x + ax * SIDESTEP, z + az * SIDESTEP)
    }
  }
  return best
}

/** Men file along a trench this far apart, in metres: the way trench traffic went, one behind another. */
const FILE_SPACING = 2

/**
 * Where each follower should stand. In a trench they file along it from the leader, a man every `FILE_SPACING`, on
 * whichever side of him they are now, and up on the fire step if he is: a 2.2 m trench has no room for ranks, and places
 * laid out across it put every man on the parapet or the parados. In the open they fan out in ranks behind him: behind
 * the way he's walking or, standing, the way they've come up on him; never the way he aims, or turning to look about
 * would swing the squad round behind him. In a trench places are taken nearest first, so nobody pushes past anyone.
 */
function followSlots(sim: Simulation, leader: EntityId, followers: readonly EntityId[]): Map<EntityId, Place> {
  const { position, steer, facing } = sim.soldiers
  const lx = position.x[leader]
  const lz = position.z[leader]
  const places = new Map<EntityId, Place>()
  let centreX = 0
  let centreZ = 0
  for (const member of followers) {
    centreX += position.x[member] / followers.length
    centreZ += position.z[member] / followers.length
  }
  const trench = isInTrench(sim.map, lx, lz) ? nearestTrench(sim.map, lx, lz) : null
  if (trench) {
    const back = (placeOn(trench.trench, centreX, centreZ)?.along ?? trench.along) <= trench.along ? -1 : 1
    const step = onFireStep(trench) ? FIRE_STEP_MIDDLE : 0
    const along = (member: EntityId) =>
      Math.abs((placeOn(trench.trench, position.x[member], position.z[member])?.along ?? trench.along) - trench.along)
    const inFile = [...followers].sort((a, b) => along(a) - along(b) || a - b)
    inFile.forEach((member, index) => {
      const point = pointAlong(trench.trench, trench.along + back * (index + 1) * FILE_SPACING)
      places.set(member, { x: point.x + point.frontX * step, z: point.z + point.frontZ * step })
    })
    return places
  }
  // Behind the way he walks; standing, behind him from where the squad is; or, all on top of him, behind his facing.
  let backX = -facing.x[leader]
  let backZ = -facing.z[leader]
  const steering = hasComponent(sim.world, leader, steer) ? Math.sqrt(steer.x[leader] ** 2 + steer.z[leader] ** 2) : 0
  const fromSquad = Math.sqrt((centreX - lx) ** 2 + (centreZ - lz) ** 2)
  if (steering > 0) {
    backX = -steer.x[leader] / steering
    backZ = -steer.z[leader] / steering
  } else if (fromSquad > FORMATION_SPACING) {
    backX = (centreX - lx) / fromSquad
    backZ = (centreZ - lz) / fromSquad
  }
  // The right hand of a man walking away from the squad.
  const rightX = -backZ
  const rightZ = backX
  followers.forEach((member, slot) => {
    const x = position.x[member]
    const z = position.z[member]
    if (steering === 0 && (x - lx) ** 2 + (z - lz) ** 2 <= HALT_NEAR * HALT_NEAR) {
      // He's stopped, and this man is close by: he halts where he is rather than shuffle into a rank.
      places.set(member, { x, z })
      return
    }
    // Each rank centred on the leader's track, the last one too, so the squad's middle stays behind him.
    const rank = Math.floor(slot / FORMATION_WIDTH)
    const inRank = Math.min(FORMATION_WIDTH, followers.length - rank * FORMATION_WIDTH)
    const lateral = ((slot % FORMATION_WIDTH) - (inRank - 1) / 2) * FORMATION_SPACING
    const behind = FORMATION_SPACING * (1 + rank)
    const place = clampToMap(sim, lx + rightX * lateral + backX * behind, lz + rightZ * lateral + backZ * behind)
    places.set(member, clearOfScenery(sim.map, place.x, place.z))
  })
  return places
}

/**
 * Followers closer than this to their place, in metres, stay put: closer than other orders keep, since a place on the
 * fire step lies only 0.7 m from the floor below it.
 */
const FOLLOW_TOLERANCE = 0.4
/** When the leader stops, followers this close to him, in metres, halt where they are. */
const HALT_NEAR = 10

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
 * Where a member should be after an advance by the trenches: his place in a file along the trench at the target, a man
 * every `FILE_SPACING`, up on the fire step of a fire trench; or, with no trench there, his place in a line.
 */
function trenchSlot(
  sim: Simulation,
  order: { x: number; z: number },
  slot: number,
  count: number
): { x: number; z: number } {
  const trench = nearestTrench(sim.map, order.x, order.z)
  if (!trench) {
    return advanceSlot(sim, order, slot, count)
  }
  const point = pointAlong(trench.trench, trench.along + (slot - (count - 1) / 2) * FILE_SPACING)
  return { x: point.x + point.frontX * FIRE_STEP_MIDDLE, z: point.z + point.frontZ * FIRE_STEP_MIDDLE }
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

/**
 * Following a creeping barrage, men cross no man's land by rushes from shell hole to shell hole: lines every this many
 * metres across it, fixed to the ground, each rush ending in the best cover on the next line once their place behind
 * the barrage has passed it. So the barrage's lifts set the pace, and between rushes the men lie in the craters rather
 * than walk in the open.
 */
const RUSH_LINES = 12
/** A man this near a rush line, in metres, has reached it: the cover found on it may lie a little short. */
const RUSH_ARRIVED = 3
/**
 * Men run their rushes only with this much breath left (of 100), and walk them otherwise: run all the way, they came to
 * the enemy's wire too blown to charge it, and the guns had them.
 */
const RUSH_BREATH = 70

/** The first rush line beyond `z`, going `direction`. */
function nextRushLine(z: number, direction: number): number {
  return direction > 0
    ? (Math.floor((z + RUSH_ARRIVED) / RUSH_LINES) + 1) * RUSH_LINES
    : (Math.ceil((z - RUSH_ARRIVED) / RUSH_LINES) - 1) * RUSH_LINES
}

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
  run = false,
  tolerance = SLOT_TOLERANCE
): void {
  const { position } = sim.soldiers
  const dx = target.x - position.x[soldier]
  const dz = target.z - position.z[soldier]
  if (dx * dx + dz * dz > tolerance * tolerance) {
    // Round ruins and pools and through gaps in the wire, rather than straight through them.
    const via = nextWaypoint(sim, soldier, target, goal)
    if (via && !overOrAround(sim, soldier, via, target)) {
      applyCommand(sim, { type: "move-to", soldier, x: via.x, z: via.z, run })
    }
  }
}

/** A climb must bring him at least this much nearer where he's going, in metres: a fence is barely a metre deep. */
const VAULT_GAIN = 0.5
/** His way must lead across a fence he's up against at least this squarely (a cosine) for him to climb it head-on. */
const SQUARE_ENOUGH = 0.2
/** A man boxed in sidesteps this far, in metres... */
const SIDESTEP = 2
/** ...trying this many ways round. */
const SIDESTEP_WAYS = 16
/** His way counts as blocked when walls leave him less than this share of his stride toward it. */
const BLOCKED = 0.25

/**
 * When a man's way to `via` runs into a wooden fence or low wall, or a trench wall he'd otherwise scramble up, he climbs
 * it as a player does with Space, if that gets him nearer `target`. Barbed wire he never climbs: his route takes him
 * through a gap, or he wades it. Boxed into a corner, he sidesteps the free way that
 * heads most nearly where he's going. Whether he did either, which takes the place of his move order this time.
 */
export function overOrAround(sim: Simulation, soldier: EntityId, via: Place, target: Place): boolean {
  const { position, vault } = sim.soldiers
  if (hasComponent(sim.world, soldier, vault)) {
    return true
  }
  const x = position.x[soldier]
  const z = position.z[soldier]
  const dx = via.x - x
  const dz = via.z - z
  const distance = Math.sqrt(dx * dx + dz * dz)
  if (distance < 0.3) {
    return false
  }
  const toward = { x: dx / distance, z: dz / distance }
  const way = wayAhead(sim.map, x, z, toward.x, toward.z, WALKING_STRIDE, Climbing.Ordered)
  const kept = Math.sqrt(way.x * way.x + way.z * way.z)
  const from = Math.sqrt((target.x - x) ** 2 + (target.z - z) ** 2)
  /** Climbs the way `heading` goes if that brings him at least `gain` nearer where he's going. */
  const climbs = (heading: Place, gain: number) => {
    const landing = vaultLanding(sim, soldier, heading)
    return (
      landing !== null &&
      Math.sqrt((target.x - landing.x) ** 2 + (target.z - landing.z) ** 2) < from - gain &&
      startVault(sim, soldier, heading)
    )
  }
  if (fenceAhead(sim, soldier, toward) || (way.met === Obstacle.Wall && way.climbing) || kept < BLOCKED) {
    if (climbs(toward, VAULT_GAIN)) {
      return true
    }
  }
  // Up against a fence or low wall with his way on the far side of it, too slantwise to climb as he heads: straight
  // over it instead, as a man pressed along one into the angle where two fences meet would.
  const across = acrossFence(sim, x, z)
  const over = across ? across.x * toward.x + across.z * toward.z : 0
  if (across && Math.abs(over) >= SQUARE_ENOUGH) {
    const side = Math.sign(over)
    // Any nearer will do: straight across, he gains little on a place well along the far side.
    if (climbs({ x: across.x * side, z: across.z * side }, 0)) {
      return true
    }
  }
  if (kept >= BLOCKED) {
    return false
  }
  const best = wayOut(sim.map, x, z, toward)
  if (!best) {
    return false
  }
  applyCommand(sim, { type: "move-to", soldier, x: best.x, z: best.z })
  return true
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
    const order = squad.order
    if (squad.leader < 0 || order.kind === "hold" || order.kind === "reserve" || order.kind === "suppress") {
      continue
    }
    // In an advance an AI squad's leader goes too; a player's leader goes where the player steers. Rallying, the others
    // close on him where he stands.
    const leaderMoves = order.kind !== "follow" && order.kind !== "rally" && squad.controller === "ai"
    const followers = squad.members.filter((member) => (leaderMoves || member !== squad.leader) && isAlive(sim, member))
    const bounding =
      order.kind === "advance" &&
      order.trench !== true &&
      squad.controller === "ai" &&
      followers.some((member) => sim.soldiers.suppression.value[member] >= UNDER_FIRE)
    // Which half is on the move: they change about every bound, by the clock, so every squad keeps the same rhythm.
    const movingHalf = Math.floor(sim.tick / BOUND.steps) % 2
    const following =
      order.kind === "follow" || order.kind === "rally" ? followSlots(sim, squad.leader, followers) : null
    followers.forEach((member, slot) => {
      const followPlace = following?.get(member) ?? {
        x: sim.soldiers.position.x[member],
        z: sim.soldiers.position.z[member]
      }
      if (order.kind === "rally") {
        // Broken men too: at his voice they get up and come in to him.
        const { x, z } = sim.soldiers.position
        orderMoveTo(sim, member, followPlace, {
          kind: "point",
          x: x[squad.leader],
          z: z[squad.leader],
          radius: FOLLOW_GOAL_RADIUS
        })
        return
      }
      if (sim.soldiers.morale.value[member] < BROKEN_MORALE) {
        // Broken soldiers go to ground where they are.
        const { x, z } = sim.soldiers.position
        applyCommand(sim, { type: "move-to", soldier: member, x: x[member], z: z[member] })
        return
      }
      if (order.kind === "creep") {
        const target = creepSlot(sim, order, slot, followers.length)
        const { x, z } = sim.soldiers.position
        const direction = Math.sign(order.objectiveZ - z[member]) || 1
        // Never fall back: a soldier already ahead of their slot waits there for the barrage to move on.
        if ((target.z - z[member]) * direction < 0) {
          return
        }
        const goal: NavGoal = { kind: "line", z: target.z, direction }
        // Once the barrage has lifted off the objective, they run for it.
        if (barrageLifted(sim, order)) {
          orderMoveTo(sim, member, target, goal, true)
          return
        }
        // The next rush ends in the best cover on the next line, or, where their place falls short of it, in their place
        // itself: lagging a line behind it, they'd be the further off when the barrage lifts off the objective.
        const line = nextRushLine(z[member], direction)
        const next = (target.z - line) * direction < 0 ? target : coverNear(sim, target.x, line)
        const away = (next.x - x[member]) ** 2 + (next.z - z[member]) ** 2 > SLOT_TOLERANCE * SLOT_TOLERANCE
        if (away && slot % 2 !== movingHalf && inCover(sim, x[member], z[member])) {
          // Down in his hole while the other half rush.
          applyCommand(sim, { type: "move-to", soldier: member, x: x[member], z: z[member] })
          return
        }
        orderMoveTo(sim, member, next, goal, sim.soldiers.stamina.value[member] >= RUSH_BREATH)
        return
      }
      if (order.kind === "follow") {
        const { x, z } = sim.soldiers.position
        // Snapped to a coarse grid, so a moving leader doesn't call for a new route every few steps.
        orderMoveTo(
          sim,
          member,
          followPlace,
          {
            kind: "point",
            x: Math.round(x[squad.leader] / FOLLOW_GOAL_SNAP) * FOLLOW_GOAL_SNAP,
            z: Math.round(z[squad.leader] / FOLLOW_GOAL_SNAP) * FOLLOW_GOAL_SNAP,
            radius: FOLLOW_GOAL_RADIUS
          },
          false,
          FOLLOW_TOLERANCE
        )
        return
      }
      const goal = order.kind === "raid" ? raidGoal(order) : order
      const byTrench = order.kind === "advance" && order.trench === true
      const navGoal: NavGoal = { kind: "point", x: goal.x, z: goal.z, radius: ADVANCE_GOAL_RADIUS, trench: byTrench }
      const place = byTrench
        ? trenchSlot(sim, goal, slot, followers.length)
        : advanceSlot(sim, goal, slot, followers.length)
      if (order.kind === "run-to" || order.kind === "withdraw") {
        orderMoveTo(sim, member, place, navGoal, true)
        return
      }
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

/** A squad falls back to a trench at least this far behind where it stands, in metres... */
const WITHDRAW_BEYOND = 8
/** ...looking along its trenches at points this far apart. */
const WITHDRAW_STEP = 4
/** Members below this morale are shaken: a rally steadies them. */
export const SHAKEN_MORALE = 0.6

/** Where a squad's living men are on average, or null if none are left. */
function squadCentre(sim: Simulation, squad: Squad): { x: number; z: number } | null {
  let x = 0
  let z = 0
  let count = 0
  for (const member of squad.members) {
    if (isAlive(sim, member)) {
      x += sim.soldiers.position.x[member]
      z += sim.soldiers.position.z[member]
      count++
    }
  }
  return count === 0 ? null : { x: x / count, z: z / count }
}

/**
 * Where a squad would withdraw to: the nearest point on one of its side's fire trenches behind it, toward its own lines;
 * null if it has none behind it.
 */
export function withdrawPoint(sim: Simulation, squad: Squad): { x: number; z: number } | null {
  const centre = squadCentre(sim, squad)
  if (centre === null) {
    return null
  }
  const facing = squad.side === Side.French ? "north" : "south"
  const rearward = squad.side === Side.French ? -1 : 1
  let best: { x: number; z: number } | null = null
  let bestDistance = Infinity
  for (const trench of sim.map.trenches) {
    if (trench.kind !== "fire" || trench.facing !== facing) {
      continue
    }
    for (let index = 1; index < trench.points.length; index++) {
      const [ax, az] = trench.points[index - 1]!
      const [bx, bz] = trench.points[index]!
      const steps = Math.max(1, Math.ceil(Math.sqrt((bx - ax) ** 2 + (bz - az) ** 2) / WITHDRAW_STEP))
      for (let step = 0; step <= steps; step++) {
        const x = ax + ((bx - ax) * step) / steps
        const z = az + ((bz - az) * step) / steps
        const distance = (x - centre.x) ** 2 + (z - centre.z) ** 2
        if ((z - centre.z) * rearward >= WITHDRAW_BEYOND && distance < bestDistance) {
          best = { x, z }
          bestDistance = distance
        }
      }
    }
  }
  return best
}

/** The orders a squad can be given. */
export type SquadOrderKind = SquadOrder["kind"]

/**
 * Why a squad can't take an order now, in a few words for the player, or null if it can: nobody left to give it to, no
 * trench of theirs behind them to withdraw to, nobody shaken to rally.
 */
export function orderRefusal(sim: Simulation, squad: Squad, kind: SquadOrderKind): string | null {
  const living = squad.members.filter((member) => isAlive(sim, member))
  if (living.length === 0) {
    return "Nobody left"
  }
  if (kind === "withdraw" && withdrawPoint(sim, squad) === null) {
    return "No trench of ours behind them"
  }
  if (kind === "rally" && !living.some((member) => sim.soldiers.morale.value[member] < SHAKEN_MORALE)) {
    return "Nobody is shaken"
  }
  return null
}
