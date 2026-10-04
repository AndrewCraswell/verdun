import { type EntityId, hasComponent } from "bitecs"
import { applyCommand } from "./commands.ts"
import { MaskState, Stance } from "./components.ts"
import { eyeAt, type WorldPoint } from "./line-of-sight.ts"
import { type SimEvent, STEP_SECONDS, type Simulation, soldierIds } from "./simulation.ts"
import { isAlive } from "./squads.ts"
import { isSheltering, soldierEye } from "./stance.ts"

export const Weapon = { Rifle: 0, MachineGun: 1 } as const
export type Weapon = (typeof Weapon)[keyof typeof Weapon]

interface WeaponStats {
  /** Seconds between shots. */
  readonly interval: number
  /** Hit chance at point-blank range against an exposed, still target. */
  readonly accuracy: number
  /** Distance over which hit chance falls by a factor of e, in metres. */
  readonly falloff: number
  readonly range: number
  /** Suppression added to whoever is shot at. */
  readonly suppression: number
}

/** Bolt-action rifles (Lebel, Gewehr 98) and medium machine guns (Hotchkiss, MG 08). */
export const WEAPONS: Readonly<Record<Weapon, WeaponStats>> = {
  [Weapon.Rifle]: { interval: 3, accuracy: 0.55, falloff: 150, range: 400, suppression: 0.25 },
  [Weapon.MachineGun]: { interval: 0.15, accuracy: 0.1, falloff: 220, range: 600, suppression: 0.12 }
}

/** Soldiers re-pick their target this often, in steps, staggered by soldier id so the work spreads out. */
const THINK_INTERVAL = 10
/** Of the nearest enemies, at most this many are checked for a sight line when picking a target. */
const CANDIDATES = 6
/** How far below the eye a target's waist is: hidden waists mean the target is behind cover. */
const WAIST_DROP = 0.8
const COVER_FACTOR = 0.35
/** A prone soldier shows a third of a standing man's height, and less again of his width end-on. */
const PRONE_FACTOR = 0.3
/** At or above this suppression a soldier is pinned: hugging the bottom of the trench or a crater, not firing. */
export const PINNED = 0.6
/** Beyond this range, soldiers left to themselves don't waste shots on a head peeking over a parapet. */
const COVERED_TARGET_RANGE = 100
const MOVING_TARGET_FACTOR = 0.75
const MOVING_SHOOTER_FACTOR = 0.5
/** Fogged eyepieces and a narrow field of view: a masked soldier shoots worse. */
const MASKED_SHOOTER_FACTOR = 0.7
/**
 * Suppression lost per second. Slow enough that defenders stay down for a while after a barrage lifts: the race to
 * the parapet that decided so many WW1 attacks.
 */
const SUPPRESSION_DECAY = 0.12
const MORALE_RECOVERY = 0.02
/** Morale lost by each member of a squad when one of them falls. */
const CASUALTY_SHOCK = 0.15
/** Below this morale, soldiers stop advancing and only defend themselves. */
export const BROKEN_MORALE = 0.25

/** A shot fired this step, for the renderer to draw. */
export interface ShotEvent {
  readonly type: "shot"
  readonly shooter: EntityId
  /** The soldier aimed at, or -1 for a shot at nothing in particular. */
  readonly target: EntityId
  readonly hit: boolean
  readonly from: WorldPoint
  readonly to: WorldPoint
}

/** Just the shots among a step's events. */
export function shotEvents(events: readonly SimEvent[]): ShotEvent[] {
  return events.filter((event): event is ShotEvent => event.type === "shot")
}

function chest(sim: Simulation, soldier: EntityId): WorldPoint {
  const eye = soldierEye(sim, soldier)
  return { x: eye.x, y: eye.y - (sim.soldiers.stance.value[soldier] === Stance.Prone ? 0.1 : 0.3), z: eye.z }
}

function isMoving(sim: Simulation, soldier: EntityId): boolean {
  return (
    hasComponent(sim.world, soldier, sim.soldiers.steer) || hasComponent(sim.world, soldier, sim.soldiers.moveOrder)
  )
}

/** Whether a soldier fires on their own: everyone but the soldier a player is controlling. */
function firesOnTheirOwn(sim: Simulation, soldier: EntityId): boolean {
  const squad = sim.squads[sim.soldiers.squad.id[soldier]]
  return !(squad?.controller === "player" && squad.leader === soldier)
}

/** Whether a target's body, not just their head, is in view: they're out of cover. */
function isExposed(sim: Simulation, shooter: EntityId, target: EntityId): boolean {
  if (!sim.lineOfSight) {
    return false
  }
  if (sim.soldiers.stance.value[target] !== Stance.Standing) {
    return false
  }
  const head = soldierEye(sim, target)
  return sim.lineOfSight.isClear(soldierEye(sim, shooter), { ...head, y: head.y - WAIST_DROP })
}

/** Chance that a shot hits, given range, the target's cover and movement, and the shooter's state. */
export function hitChance(sim: Simulation, shooter: EntityId, target: EntityId): number {
  const stats = WEAPONS[sim.soldiers.weapon.kind[shooter] === Weapon.MachineGun ? Weapon.MachineGun : Weapon.Rifle]
  const dx = sim.soldiers.position.x[target] - sim.soldiers.position.x[shooter]
  const dz = sim.soldiers.position.z[target] - sim.soldiers.position.z[shooter]
  let chance = stats.accuracy * Math.exp(-Math.sqrt(dx * dx + dz * dz) / stats.falloff)
  if (sim.soldiers.stance.value[target] === Stance.Prone) {
    chance *= PRONE_FACTOR
  } else if (!isExposed(sim, shooter, target) || sim.soldiers.suppression.value[target] >= PINNED) {
    // A pinned target is flat in the bottom of a trench or crater: as good as covered.
    chance *= COVER_FACTOR
  }
  if (isMoving(sim, target)) {
    chance *= MOVING_TARGET_FACTOR
  }
  if (isMoving(sim, shooter)) {
    chance *= MOVING_SHOOTER_FACTOR
  }
  if (sim.soldiers.mask.state[shooter] === MaskState.On) {
    chance *= MASKED_SHOOTER_FACTOR
  }
  const suppression = sim.soldiers.suppression.value[shooter]
  const morale = sim.soldiers.morale.value[shooter]
  return chance * (1 - 0.6 * suppression) * (0.5 + 0.5 * morale)
}

/** Whether `shooter` can see and reach `target` right now. */
function canEngage(sim: Simulation, shooter: EntityId, target: EntityId): boolean {
  // Men down a dugout are out of sight and out of reach.
  if (!isAlive(sim, target) || !sim.lineOfSight || isSheltering(sim, target)) {
    return false
  }
  const stats = WEAPONS[sim.soldiers.weapon.kind[shooter] === Weapon.MachineGun ? Weapon.MachineGun : Weapon.Rifle]
  const dx = sim.soldiers.position.x[target] - sim.soldiers.position.x[shooter]
  const dz = sim.soldiers.position.z[target] - sim.soldiers.position.z[shooter]
  if (dx * dx + dz * dz > stats.range * stats.range) {
    return false
  }
  return sim.lineOfSight.isClear(soldierEye(sim, shooter), soldierEye(sim, target))
}

/**
 * Picks the nearest enemy worth shooting: one the soldier can see, and either out of cover or close. Trench lines left
 * to themselves stay quiet, as they mostly did, until someone shows themselves. Only the few nearest are checked, to
 * keep sight-line casts cheap.
 */
function pickTarget(sim: Simulation, shooter: EntityId, enemies: readonly EntityId[]): EntityId {
  const x = sim.soldiers.position.x[shooter]
  const z = sim.soldiers.position.z[shooter]
  const nearest = enemies
    .map((enemy) => ({
      enemy,
      distance: (sim.soldiers.position.x[enemy] - x) ** 2 + (sim.soldiers.position.z[enemy] - z) ** 2
    }))
    .sort((a, b) => a.distance - b.distance || a.enemy - b.enemy)
    .slice(0, CANDIDATES)
  return (
    nearest.find(
      ({ enemy, distance }) =>
        canEngage(sim, shooter, enemy) &&
        (distance <= COVERED_TARGET_RANGE * COVERED_TARGET_RANGE || isExposed(sim, shooter, enemy))
    )?.enemy ?? -1
  )
}

/** Fires one shot at a target, rolling to hit; hits wound or kill, and every shot suppresses the target. */
export function fireAt(sim: Simulation, shooter: EntityId, target: EntityId): void {
  const kind = sim.soldiers.weapon.kind[shooter] === Weapon.MachineGun ? Weapon.MachineGun : Weapon.Rifle
  const stats = WEAPONS[kind]
  const hit = sim.rng.next() < hitChance(sim, shooter, target)
  const { suppression, health } = sim.soldiers
  suppression.value[target] = Math.min(1, suppression.value[target] + stats.suppression * (hit ? 2 : 1))
  if (hit) {
    health.value[target] -= 0.5 + sim.rng.next() * 0.6
    if (health.value[target] <= 0) {
      applyCommand(sim, { type: "kill", soldier: target })
    }
  }
  sim.soldiers.weapon.cooldown[shooter] = stats.interval * (0.85 + sim.rng.next() * 0.3)
  sim.events.push({
    type: "shot",
    shooter,
    target,
    hit,
    from: soldierEye(sim, shooter),
    to: chest(sim, target)
  })
}

/**
 * A player's shot: at the enemy closest to where the soldier aims, within a narrow cone, or into the ground ahead when
 * there's no one there. Returns whether a shot was fired (the weapon must be ready).
 */
export function fireAimed(sim: Simulation, shooter: EntityId): boolean {
  if (!isAlive(sim, shooter) || sim.soldiers.weapon.cooldown[shooter] > 0) {
    return false
  }
  const x = sim.soldiers.position.x[shooter]
  const z = sim.soldiers.position.z[shooter]
  const facingX = sim.soldiers.facing.x[shooter]
  const facingZ = sim.soldiers.facing.z[shooter]
  const side = sim.soldiers.side.value[shooter]
  let best: EntityId = -1
  let bestDistance = Infinity
  for (const soldier of soldierIds(sim)) {
    if (sim.soldiers.side.value[soldier] === side) {
      continue
    }
    const dx = sim.soldiers.position.x[soldier] - x
    const dz = sim.soldiers.position.z[soldier] - z
    const distance = Math.sqrt(dx * dx + dz * dz)
    // Within about 4 degrees of the aim.
    if (
      distance > 0 &&
      (dx * facingX + dz * facingZ) / distance > 0.9975 &&
      distance < bestDistance &&
      canEngage(sim, shooter, soldier)
    ) {
      best = soldier
      bestDistance = distance
    }
  }
  if (best >= 0) {
    fireAt(sim, shooter, best)
    return true
  }
  const kind = sim.soldiers.weapon.kind[shooter] === Weapon.MachineGun ? Weapon.MachineGun : Weapon.Rifle
  sim.soldiers.weapon.cooldown[shooter] = WEAPONS[kind].interval
  const from = soldierEye(sim, shooter)
  sim.events.push({
    type: "shot",
    shooter,
    target: -1,
    hit: false,
    from,
    to: eyeAt(sim.map, x + facingX * 80, z + facingZ * 80)
  })
  return true
}

/** Lowers the morale of a fallen soldier's squadmates. Call when a soldier dies. */
export function shakeSquad(sim: Simulation, fallen: EntityId): void {
  const squad = sim.squads[sim.soldiers.squad.id[fallen]]
  for (const member of squad?.members ?? []) {
    if (member !== fallen && isAlive(sim, member)) {
      sim.soldiers.morale.value[member] = Math.max(0, sim.soldiers.morale.value[member] - CASUALTY_SHOCK)
    }
  }
}

/**
 * One step of fighting: suppression fades and morale recovers, soldiers re-pick targets a few times a second
 * (staggered), and everyone whose weapon is ready fires at their target if they can still see it.
 */
export function combatSystem(sim: Simulation): void {
  const { weapon, target, suppression, morale, side } = sim.soldiers
  const living = Array.from(soldierIds(sim))
  const bySide = new Map<number, EntityId[]>()
  for (const soldier of living) {
    const list = bySide.get(side.value[soldier]) ?? []
    list.push(soldier)
    bySide.set(side.value[soldier], list)
  }

  for (const soldier of living) {
    suppression.value[soldier] = Math.max(0, suppression.value[soldier] - SUPPRESSION_DECAY * STEP_SECONDS)
    morale.value[soldier] = Math.min(1, morale.value[soldier] + MORALE_RECOVERY * STEP_SECONDS)
    weapon.cooldown[soldier] = Math.max(0, weapon.cooldown[soldier] - STEP_SECONDS)
    if (!firesOnTheirOwn(sim, soldier) || suppression.value[soldier] >= PINNED || isSheltering(sim, soldier)) {
      continue
    }
    if ((sim.tick + soldier) % THINK_INTERVAL === 0) {
      const enemies = [...bySide.entries()].filter(([key]) => key !== side.value[soldier]).flatMap(([, list]) => list)
      target.id[soldier] = pickTarget(sim, soldier, enemies)
    }
    const aimed = target.id[soldier]
    if (aimed >= 0 && weapon.cooldown[soldier] <= 0) {
      if (canEngage(sim, soldier, aimed)) {
        fireAt(sim, soldier, aimed)
      } else {
        target.id[soldier] = -1
      }
    }
  }
}
