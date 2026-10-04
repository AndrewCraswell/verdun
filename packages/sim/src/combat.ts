import { type EntityId, hasComponent } from "bitecs"
import { Shell } from "./artillery.ts"
import { applyCommand } from "./commands.ts"
import { MaskState, Stance } from "./components.ts"
import { eyeAt, type WorldPoint } from "./line-of-sight.ts"
import { type SimEvent, STEP_SECONDS, type Simulation, soldierIds } from "./simulation.ts"
import { seesThroughSmoke, smokeBetween } from "./smoke.ts"
import { nearestSoldiers, soldiersNear } from "./spatial.ts"
import { isAlive } from "./squads.ts"
import { isInTrench, isSheltering, soldierEye } from "./stance.ts"

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

/**
 * Bolt-action rifles (Lebel, Gewehr 98) and medium machine guns (Hotchkiss, MG 08). Accuracy is for men under fire,
 * not on a range: an aimed rifle shot at a man walking 150 m away hits about one time in sixteen. A machine gun's
 * rounds hit less often each, but it fires twenty times as many, and its misses still sweep the ground around the
 * target.
 */
export const WEAPONS: Readonly<Record<Weapon, WeaponStats>> = {
  [Weapon.Rifle]: { interval: 3, accuracy: 0.45, falloff: 100, range: 400, suppression: 0.25 },
  [Weapon.MachineGun]: { interval: 0.15, accuracy: 0.1, falloff: 220, range: 600, suppression: 0.12 }
}

/** Grenades are thrown at enemies between these distances, in metres: closer risks the thrower, further is too far. */
export const GRENADE_RANGE = { min: 6, max: 25 } as const
/** Seconds from deciding to throw until the grenade bursts: pull the pin or the cord, throw, and a 4-5 s fuse. */
const GRENADE_FUSE = 4.5
/** Nobody throws where a friend is within this many metres of the target: grenades scatter, and so do fragments. */
const GRENADE_CLEARANCE = 8
/** Seconds a throw takes the thrower out of the fight, priming and throwing. */
const THROW_SECONDS = 3
/** Throws scatter by this much, plus a share of the distance, in metres (probable error). */
const THROW_ERROR = { base: 1, perMetre: 0.06 } as const

/**
 * A machine gun's beaten zone, in metres: half its width, and how far it reaches either side of the aim point along the
 * line of fire, growing with range. `share` is the fraction of a miss that still endangers a man inside it.
 */
const BEATEN_ZONE = { halfWidth: 1.5, depth: 5, depthPerMetre: 0.08, share: 0.6 } as const

/** Soldiers re-pick their target this often, in steps, staggered by soldier id so the work spreads out. */
const THINK_INTERVAL = 10
/**
 * A soldier with no target looks again this often, in steps: two seconds. Spotting someone new takes a moment, and on
 * a quiet line most men have nothing to shoot at.
 */
const IDLE_THINK_INTERVAL = 40
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

/** A soldier throwing a grenade this step, for animation. */
export interface ThrowEvent {
  readonly type: "throw"
  readonly soldier: EntityId
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
  // Smoke and dust between them blur the aim, even when the shape can still be made out.
  chance *= Math.exp(-smokeBetween(sim, soldierEye(sim, shooter), soldierEye(sim, target)))
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
  // Darkness, fog and falling rain or snow hide men well inside a weapon's range.
  const reach = Math.min(stats.range, sim.environment.sightRange)
  if (dx * dx + dz * dz > reach * reach) {
    return false
  }
  const eye = soldierEye(sim, shooter)
  const head = soldierEye(sim, target)
  return sim.lineOfSight.isClear(eye, head) && seesThroughSmoke(sim, eye, head)
}

/**
 * Picks the nearest enemy worth shooting: one the soldier can see, and either out of cover or close. Trench lines left
 * to themselves stay quiet, as they mostly did, until someone shows themselves. Only the few nearest are checked, to
 * keep sight-line casts cheap.
 */
/**
 * Whether a machine gun sweeps a man lying out in the open: grazing fire over open ground found men a rifleman wouldn't
 * waste a shot on. Men in a trench are left alone, so quiet lines stay quiet.
 */
function sweepsTheOpen(sim: Simulation, shooter: EntityId, target: EntityId): boolean {
  return (
    sim.soldiers.weapon.kind[shooter] === Weapon.MachineGun &&
    !isInTrench(sim.map, sim.soldiers.position.x[target], sim.soldiers.position.z[target])
  )
}

function pickTarget(sim: Simulation, shooter: EntityId): EntityId {
  const x = sim.soldiers.position.x[shooter]
  const z = sim.soldiers.position.z[shooter]
  const side = sim.soldiers.side.value[shooter]
  const nearest = nearestSoldiers(
    sim,
    x,
    z,
    CANDIDATES,
    weaponOf(sim, shooter).range,
    (other) => sim.soldiers.side.value[other] !== side && isAlive(sim, other)
  )
  return (
    nearest.find((enemy) => {
      const distance = (sim.soldiers.position.x[enemy] - x) ** 2 + (sim.soldiers.position.z[enemy] - z) ** 2
      // The cheap tests first: a far-off man under cover is turned down with one sight line, not two.
      const worthIt =
        distance <= COVERED_TARGET_RANGE * COVERED_TARGET_RANGE ||
        sweepsTheOpen(sim, shooter, enemy) ||
        isExposed(sim, shooter, enemy)
      return worthIt && canEngage(sim, shooter, enemy)
    }) ?? -1
  )
}

function weaponOf(sim: Simulation, soldier: EntityId): WeaponStats {
  return WEAPONS[sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun ? Weapon.MachineGun : Weapon.Rifle]
}

/** A bullet strikes a soldier: a wound, often a mortal one. */
function strike(sim: Simulation, soldier: EntityId): void {
  sim.soldiers.health.value[soldier] -= 0.5 + sim.rng.next() * 0.6
  if (sim.soldiers.health.value[soldier] <= 0) {
    applyCommand(sim, { type: "kill", soldier })
  }
}

/**
 * The man nearest the target inside a machine gun's beaten zone: the long, narrow patch of ground its cone of fire
 * sweeps, a few metres wide and lengthening with range. -1 when there's no one else in it.
 */
function inBeatenZone(sim: Simulation, shooter: EntityId, target: EntityId): EntityId {
  const { position, side } = sim.soldiers
  const dx = position.x[target] - position.x[shooter]
  const dz = position.z[target] - position.z[shooter]
  const range = Math.sqrt(dx * dx + dz * dz)
  if (range === 0) {
    return -1
  }
  const depth = BEATEN_ZONE.depth + BEATEN_ZONE.depthPerMetre * range
  let nearest: EntityId = -1
  let nearestDistance = Infinity
  for (const other of soldiersNear(sim, position.x[target], position.z[target], depth + BEATEN_ZONE.halfWidth)) {
    if (other === target || side.value[other] !== side.value[target] || !isAlive(sim, other)) {
      continue
    }
    const ox = position.x[other] - position.x[target]
    const oz = position.z[other] - position.z[target]
    const along = (ox * dx + oz * dz) / range
    const across = Math.abs(ox * dz - oz * dx) / range
    const distance = ox * ox + oz * oz
    if (Math.abs(along) <= depth && across <= BEATEN_ZONE.halfWidth && distance < nearestDistance) {
      nearest = other
      nearestDistance = distance
    }
  }
  return nearest
}

/** Fires one shot at a target, rolling to hit; hits wound or kill, and every shot suppresses the target. */
export function fireAt(sim: Simulation, shooter: EntityId, target: EntityId): void {
  const kind = sim.soldiers.weapon.kind[shooter] === Weapon.MachineGun ? Weapon.MachineGun : Weapon.Rifle
  const stats = WEAPONS[kind]
  const hit = sim.rng.next() < hitChance(sim, shooter, target)
  const { suppression } = sim.soldiers
  suppression.value[target] = Math.min(1, suppression.value[target] + stats.suppression * (hit ? 2 : 1))
  if (hit) {
    strike(sim, target)
  } else if (kind === Weapon.MachineGun) {
    // A machine gun's misses still fall among the men around its target.
    const other = inBeatenZone(sim, shooter, target)
    if (other >= 0) {
      suppression.value[other] = Math.min(1, suppression.value[other] + stats.suppression)
      if (sim.rng.next() < hitChance(sim, shooter, other) * BEATEN_ZONE.share) {
        strike(sim, other)
      }
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

/** A normally distributed offset with the given probable error, from the simulation's RNG. */
function scatter(sim: Simulation, probableError: number): number {
  const u = Math.max(sim.rng.next(), Number.EPSILON)
  const v = sim.rng.next()
  return (Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * probableError) / 0.6745
}

/**
 * Throws a grenade toward a ground point, if the soldier has one and is ready, at most the maximum throw away. It
 * bursts after its fuse wherever it lands. Returns whether a grenade was thrown.
 */
export function throwGrenade(sim: Simulation, thrower: EntityId, x: number, z: number): boolean {
  const { grenades, weapon, position } = sim.soldiers
  if (!isAlive(sim, thrower) || grenades.count[thrower] === 0 || weapon.cooldown[thrower] > 0) {
    return false
  }
  const dx = x - position.x[thrower]
  const dz = z - position.z[thrower]
  const distance = Math.sqrt(dx * dx + dz * dz)
  const reach = distance > GRENADE_RANGE.max ? GRENADE_RANGE.max / distance : 1
  const error = THROW_ERROR.base + THROW_ERROR.perMetre * Math.min(distance, GRENADE_RANGE.max)
  grenades.count[thrower] -= 1
  weapon.cooldown[thrower] = THROW_SECONDS
  sim.events.push({ type: "throw", soldier: thrower })
  sim.artillery.shells.push({
    shell: Shell.Grenade,
    side: sim.soldiers.side.value[thrower] === 1 ? 1 : 0,
    x: position.x[thrower] + dx * reach + scatter(sim, error),
    z: position.z[thrower] + dz * reach + scatter(sim, error),
    landsAtTick: sim.tick + Math.round(GRENADE_FUSE / STEP_SECONDS)
  })
  return true
}

/**
 * Bombs an enemy close by and in cover: down in a trench bay, behind a parapet, flat in a shell hole. Rifles can't
 * reach men there, but a grenade lobbed over can. Returns whether a grenade was thrown.
 */
function bombIfWorthIt(sim: Simulation, soldier: EntityId): boolean {
  // Without sight lines nobody knows where anyone is, so nobody fights.
  if (!sim.lineOfSight || sim.soldiers.grenades.count[soldier] === 0 || sim.soldiers.weapon.cooldown[soldier] > 0) {
    return false
  }
  const { position, side } = sim.soldiers
  const ours = side.value[soldier]
  let best: EntityId = -1
  let bestDistance = Infinity
  const near = soldiersNear(sim, position.x[soldier], position.z[soldier], GRENADE_RANGE.max)
  for (const enemy of near) {
    if (side.value[enemy] === ours || !isAlive(sim, enemy)) {
      continue
    }
    const dx = position.x[enemy] - position.x[soldier]
    const dz = position.z[enemy] - position.z[soldier]
    const distance = Math.sqrt(dx * dx + dz * dz)
    if (
      distance >= GRENADE_RANGE.min &&
      distance <= GRENADE_RANGE.max &&
      (distance < bestDistance || (distance === bestDistance && enemy < best))
    ) {
      best = enemy
      bestDistance = distance
    }
  }
  if (best < 0 || isExposed(sim, soldier, best)) {
    return false
  }
  const x = position.x[best]
  const z = position.z[best]
  // Bombers throw from the front: not where a friend is close to the target, nor over the heads of friends nearer to
  // it, who may be running in by the time it bursts.
  const friendNear = soldiersNear(sim, x, z, Math.max(GRENADE_CLEARANCE, bestDistance)).some((friend) => {
    const toTarget = (position.x[friend] - x) ** 2 + (position.z[friend] - z) ** 2
    return (
      friend !== soldier &&
      side.value[friend] === ours &&
      isAlive(sim, friend) &&
      (toTarget < GRENADE_CLEARANCE ** 2 || toTarget < bestDistance ** 2)
    )
  })
  return !friendNear && throwGrenade(sim, soldier, x, z)
}

/**
 * One step of fighting: suppression fades and morale recovers, soldiers re-pick targets a few times a second
 * (staggered), and everyone whose weapon is ready fires at their target if they can still see it.
 */
export function combatSystem(sim: Simulation): void {
  const { weapon, target, suppression, morale } = sim.soldiers
  for (const soldier of soldierIds(sim)) {
    if (!isAlive(sim, soldier)) {
      // Fell or surrendered earlier this step.
      continue
    }
    suppression.value[soldier] = Math.max(0, suppression.value[soldier] - SUPPRESSION_DECAY * STEP_SECONDS)
    morale.value[soldier] = Math.min(1, morale.value[soldier] + MORALE_RECOVERY * STEP_SECONDS)
    weapon.cooldown[soldier] = Math.max(0, weapon.cooldown[soldier] - STEP_SECONDS)
    if (!firesOnTheirOwn(sim, soldier) || suppression.value[soldier] >= PINNED || isSheltering(sim, soldier)) {
      continue
    }
    const interval = target.id[soldier] >= 0 ? THINK_INTERVAL : IDLE_THINK_INTERVAL
    if ((sim.tick + soldier) % interval === 0) {
      if (bombIfWorthIt(sim, soldier)) {
        continue
      }
      target.id[soldier] = pickTarget(sim, soldier)
    }
    const aimed = target.id[soldier]
    if (aimed >= 0 && weapon.cooldown[soldier] <= 0) {
      if (canEngage(sim, soldier, aimed)) {
        fireAt(sim, soldier, aimed)
      } else {
        // Target down or out of sight: traverse straight to the next, rather than wait for the next look round.
        target.id[soldier] = pickTarget(sim, soldier)
      }
    }
  }
}
