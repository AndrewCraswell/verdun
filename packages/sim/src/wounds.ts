import { type BattlefieldMap, type GroundPoint, mapDepth, mapWidth } from "@verdun/map"
import { addComponent, type EntityId, hasComponent, removeComponent } from "bitecs"
import { surrender } from "./capture.ts"
import { applyCommand } from "./commands.ts"
import { Side } from "./components.ts"
import { isDark } from "./flares.ts"
import { returnToPool } from "./reinforcements.ts"
import { evacuatedIds, type Simulation, woundedIds } from "./simulation.ts"
import { soldiersNear } from "./spatial.ts"
import { isInTrench } from "./stance.ts"

/**
 * Of men knocked out of the fight, the share killed outright, by what hit them. On the Western Front about three men
 * were wounded for every one killed; gas disabled far more than it killed.
 */
export const KILLED_OUTRIGHT = { bullet: 0.3, shell: 0.25, gas: 0.1 } as const
/** Wounded men left where they fell die at about this rate, per minute. */
const BLEED_PER_MINUTE = 0.01
/** Stretcher-bearer teams per side, each carrying one man at a time. */
export const BEARER_TEAMS = 6
/** Bearers walk out at this pace, in metres per second, and come back no faster with a man on the stretcher. */
const BEARER_PACE = 0.9
/** Seconds to reach a man, dress his wound and lift him. */
const LOADING_SECONDS = 60
/** Bearers won't go where an enemy is this close to the man, in metres. */
const BEARER_DANGER = 40
/** A wounded man is taken prisoner when an enemy is this close and no friend within `BEARER_DANGER`, in metres. */
const CAPTURE_REACH = 5
/**
 * Triage at the aid post: the share patched up and sent back to duty, and the share who die there. The rest go back to
 * hospital; half of them would come back, but not within a battle.
 */
const TRIAGE = { returnToDuty: 0.4, dies: 0.1 } as const
/** Seconds of care a patched-up man needs at the aid post before he rejoins the reserves. */
const TREATMENT_SECONDS = 600
/** Men an aid post treats at once; past this, treatment slows in proportion, and a big attack swamps it. */
export const AID_POST_PLACES = 8
/** A wounded man taken prisoner is helped to the enemy's rear, barely on his feet. */
const WOUNDED_PRISONER_HEALTH = 0.1
/** Wounds are seen to every second (steps per second, as a literal: importing TICK_RATE here would be circular). */
const STEPS_PER_SECOND = 20

/** What knocked a soldier down. */
export type CasualtyKind = "rifle" | "machine-gun" | "shell" | "grenade" | "gas" | "other"

/** What knocked a soldier down, and whose it was: the side that fired it, or -1 when no side can be named (gas). */
export interface CasualtyCause {
  readonly kind: CasualtyKind
  readonly by: Side | -1
}

const UNKNOWN_CAUSE: CasualtyCause = { kind: "other", by: -1 }

/**
 * A soldier put out of the fight, killed or wounded, and what did it: for battle reports, balance runs and the
 * attribution of losses to their causes (own shells among them).
 */
export interface FallenEvent {
  readonly type: "fallen"
  readonly soldier: EntityId
  readonly killed: boolean
  readonly cause: CasualtyCause
}

/** Reports a soldier put out of the fight. Draws no random numbers, so it never changes how a battle plays out. */
export function recordFallen(sim: Simulation, soldier: EntityId, killed: boolean, cause: CasualtyCause): void {
  sim.events.push({ type: "fallen", soldier, killed, cause })
}

/** A soldier knocked out of the fight but still alive, for the battle report and renderers. */
export interface WoundedEvent {
  readonly type: "wounded"
  readonly soldier: EntityId
}

/**
 * A wounded soldier's fate after he fell: carried to the aid post, patched up and back to the reserves, or dead of his
 * wound, where he lay or at the aid post.
 */
export interface CasualtyEvent {
  readonly type: "arrived-at-aid-post" | "returned-to-duty" | "died-of-wounds"
  readonly soldier: EntityId
}

/**
 * A soldier out of the fight: killed outright with the given chance, otherwise wounded, lying where he fell until the
 * stretcher-bearers come for him or his wound kills him. Either way he falls (his squad is shaken as for any loss).
 */
export function casualty(
  sim: Simulation,
  soldier: EntityId,
  killedShare: number,
  cause: CasualtyCause = UNKNOWN_CAUSE
): void {
  if (hasComponent(sim.world, soldier, sim.soldiers.dead)) {
    return
  }
  const killed = sim.rng.next() < killedShare
  applyCommand(sim, { type: "kill", soldier })
  recordFallen(sim, soldier, killed, cause)
  if (!killed) {
    addComponent(sim.world, soldier, sim.soldiers.wounded)
    sim.soldiers.casualty.evacuateAt[soldier] = -1
    sim.events.push({ type: "wounded", soldier })
  }
}

/** Where a side's aid post stands on the ground. */
export interface AidPost {
  readonly x: number
  readonly z: number
}

const aidPostCache = new WeakMap<BattlefieldMap, Readonly<Record<Side, AidPost>>>()

/**
 * Each side's aid post (poste de secours, Truppenverbandplatz): in its support line, the rearmost fire trench facing the
 * enemy, where a communication trench comes up to it. With only one line it's in the front line; with no trenches at
 * all, a little way in from the side's own edge of the map.
 */
export function aidPost(map: BattlefieldMap, side: Side): AidPost {
  let posts = aidPostCache.get(map)
  if (!posts) {
    posts = { [Side.French]: placeAidPost(map, Side.French), [Side.German]: placeAidPost(map, Side.German) }
    aidPostCache.set(map, posts)
  }
  return posts[side]
}

function placeAidPost(map: BattlefieldMap, side: Side): AidPost {
  const facing = side === Side.French ? "north" : "south"
  // Further back is lower z for the French, higher for the Germans.
  const back = side === Side.French ? -1 : 1
  const meanZ = (points: readonly GroundPoint[]) => points.reduce((sum, [, z]) => sum + z, 0) / points.length
  const lines = map.trenches.filter(
    (trench) => trench.kind === "fire" && trench.facing === facing && trench.points.length > 0
  )
  const support = lines.reduce<(typeof lines)[number] | null>(
    (best, line) => (best && meanZ(best.points) * back >= meanZ(line.points) * back ? best : line),
    null
  )
  if (!support) {
    return { x: mapWidth(map) / 2, z: side === Side.French ? 20 : mapDepth(map) - 20 }
  }
  const joins = map.trenches.filter((trench) => trench.kind === "communication").flatMap((trench) => trench.points)
  let post = support.points[Math.floor(support.points.length / 2)] ?? [0, 0]
  let nearest = Infinity
  for (const point of support.points) {
    for (const join of joins) {
      const distance = (point[0] - join[0]) ** 2 + (point[1] - join[1]) ** 2
      if (distance < nearest) {
        nearest = distance
        post = point
      }
    }
  }
  return { x: post[0], z: post[1] }
}

function sideOf(sim: Simulation, soldier: EntityId): Side {
  return sim.soldiers.side.value[soldier] === Side.German ? Side.German : Side.French
}

function friendsAndEnemiesNear(sim: Simulation, soldier: EntityId, range: number) {
  const { position, side } = sim.soldiers
  let friends = 0
  let enemies = 0
  for (const other of soldiersNear(sim, position.x[soldier], position.z[soldier], range)) {
    if (side.value[other] === side.value[soldier]) {
      friends++
    } else {
      enemies++
    }
  }
  return { friends, enemies }
}

/**
 * Whether bearers can get to a wounded man: no enemy close, and either he lies in a trench, or it's dark. By day, going
 * out into the open for a man meant joining him.
 */
function reachable(sim: Simulation, soldier: EntityId): boolean {
  const x = sim.soldiers.position.x[soldier]
  const z = sim.soldiers.position.z[soldier]
  if (friendsAndEnemiesNear(sim, soldier, BEARER_DANGER).enemies > 0) {
    return false
  }
  return isInTrench(sim.map, x, z) || isDark(sim)
}

/**
 * The wounded, once a second: some die where they lie, men overrun by the enemy are taken prisoner, and the
 * stretcher-bearers carry back whoever they can reach, nearest the rear first. A team is busy from setting out until
 * it is back with its man; teams are counted from the men being fetched, so they need no state of their own.
 */
export function woundSystem(sim: Simulation): void {
  if (sim.tick % STEPS_PER_SECOND !== 0) {
    return
  }
  const { casualty: care, side, position } = sim.soldiers
  for (const soldier of woundedIds(sim)) {
    const { friends, enemies } = friendsAndEnemiesNear(sim, soldier, BEARER_DANGER)
    const overrunBy = soldiersNear(sim, position.x[soldier], position.z[soldier], CAPTURE_REACH).filter(
      (other) => side.value[other] !== side.value[soldier]
    )
    if (overrunBy.length > 0 && friends === 0) {
      // Picked up by the enemy: a wounded prisoner.
      removeComponent(sim.world, soldier, sim.soldiers.wounded)
      removeComponent(sim.world, soldier, sim.soldiers.dead)
      care.evacuateAt[soldier] = -1
      sim.soldiers.health.value[soldier] = WOUNDED_PRISONER_HEALTH
      surrender(sim, soldier)
      continue
    }
    if (sim.rng.next() < BLEED_PER_MINUTE / 60) {
      removeComponent(sim.world, soldier, sim.soldiers.wounded)
      care.evacuateAt[soldier] = -1
      sim.events.push({ type: "died-of-wounds", soldier })
      continue
    }
    const due = care.evacuateAt[soldier]
    if (due >= 0 && sim.tick >= due) {
      care.evacuateAt[soldier] = -1
      if (enemies === 0) {
        arriveAtAidPost(sim, soldier)
      }
    }
  }
  treat(sim)
  for (const team of [Side.French, Side.German]) {
    const wounded = woundedIds(sim).filter((soldier) => side.value[soldier] === team)
    let free = BEARER_TEAMS - wounded.filter((soldier) => care.evacuateAt[soldier] >= 0).length
    const post = aidPost(sim.map, team)
    const away = (soldier: EntityId) =>
      Math.sqrt((position.x[soldier] - post.x) ** 2 + (position.z[soldier] - post.z) ** 2)
    const waiting = wounded
      .filter((soldier) => care.evacuateAt[soldier] < 0 && reachable(sim, soldier))
      .sort((a, b) => away(a) - away(b) || a - b)
    for (const soldier of waiting) {
      if (free <= 0) {
        break
      }
      const seconds = (2 * away(soldier)) / BEARER_PACE + LOADING_SECONDS
      care.evacuateAt[soldier] = sim.tick + Math.round(seconds * STEPS_PER_SECOND)
      free--
    }
  }
}

/** A wounded man carried in to the aid post, and triaged: patched up for duty, sent back to hospital, or beyond help. */
function arriveAtAidPost(sim: Simulation, soldier: EntityId): void {
  removeComponent(sim.world, soldier, sim.soldiers.wounded)
  addComponent(sim.world, soldier, sim.soldiers.evacuated)
  const post = aidPost(sim.map, sideOf(sim, soldier))
  sim.soldiers.position.x[soldier] = post.x
  sim.soldiers.position.z[soldier] = post.z
  sim.events.push({ type: "arrived-at-aid-post", soldier })
  const roll = sim.rng.next()
  if (roll < TRIAGE.dies) {
    removeComponent(sim.world, soldier, sim.soldiers.evacuated)
    sim.events.push({ type: "died-of-wounds", soldier })
  } else if (roll < TRIAGE.dies + TRIAGE.returnToDuty) {
    sim.soldiers.casualty.treatment[soldier] = 0
  }
}

/**
 * The men under treatment at each aid post, once a second: each needs `TREATMENT_SECONDS` of care, given more slowly when
 * more men are in than the post has places for. A man whose treatment is done goes back to the reserves.
 */
function treat(sim: Simulation): void {
  const { treatment } = sim.soldiers.casualty
  const inTreatment = evacuatedIds(sim).filter((soldier) => treatment[soldier] >= 0)
  for (const team of [Side.French, Side.German]) {
    const patients = inTreatment.filter((soldier) => sideOf(sim, soldier) === team)
    const pace = Math.min(1, AID_POST_PLACES / Math.max(1, patients.length))
    for (const soldier of patients) {
      treatment[soldier] += pace
      if (treatment[soldier] >= TREATMENT_SECONDS) {
        treatment[soldier] = -1
        returnToPool(sim, team, 1)
        sim.events.push({ type: "returned-to-duty", soldier })
      }
    }
  }
}
