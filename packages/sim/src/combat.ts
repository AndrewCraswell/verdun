import { heightAt } from "@verdun/map"
import { type EntityId, hasComponent } from "bitecs"
import { Shell } from "./artillery.ts"
import { reloadFactor } from "./climate.ts"
import { MaskState, Side, Stance } from "./components.ts"
import { GRENADE_RANGE, type GroundPoint, grenadeFlight } from "./grenade.ts"
import { eyeAt, type WorldPoint } from "./line-of-sight.ts"
import { aimInLight, canMakeOut } from "./sight.ts"
import { type SimEvent, STEP_SECONDS, type Simulation, soldierIds } from "./simulation.ts"
import { smokeBetween } from "./smoke.ts"
import { nearestSoldiers, soldiersNear } from "./spatial.ts"
import { spottedGuns } from "./spotting.ts"
import { isAlive } from "./squads.ts"
import { isInTrench, isSheltering, soldierEye } from "./stance.ts"
import { casualty, KILLED_OUTRIGHT } from "./wounds.ts"

/**
 * What a soldier carries. A sniper has a scoped rifle; a rifle grenadier has a rifle with a VB discharger cup and rifle
 * grenades (see rifle-grenades.ts), and fires his rifle like anyone else.
 */
export const Weapon = { Rifle: 0, MachineGun: 1, Sniper: 2, RifleGrenadier: 3 } as const
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
 * not on a range: an aimed rifle shot at a man walking 100 m away hits about one time in thirteen. A machine gun fires
 * 600 rounds a minute from a steady mount, each round likelier to hit than a rifleman's hurried aim, and its misses
 * still sweep the ground around the target: while it fires it's worth fifty rifles and more, as contemporary reckoning
 * had it, and that, not their number, is what made a handful of guns hold a kilometre of front (machine-guns.md).
 */
export const WEAPONS: Readonly<Record<Weapon, WeaponStats>> = {
  [Weapon.Rifle]: { interval: 3, accuracy: 0.2, falloff: 100, range: 400, suppression: 0.25 },
  [Weapon.MachineGun]: { interval: 0.1, accuracy: 0.35, falloff: 220, range: 600, suppression: 0.12 },
  // A scoped rifle in a hide: slow, careful shots that tell at long range.
  [Weapon.Sniper]: { interval: 6, accuracy: 0.6, falloff: 400, range: 600, suppression: 0.3 },
  [Weapon.RifleGrenadier]: { interval: 3, accuracy: 0.2, falloff: 100, range: 400, suppression: 0.25 }
}

const WEAPON_KINDS: readonly Weapon[] = [Weapon.Rifle, Weapon.MachineGun, Weapon.Sniper, Weapon.RifleGrenadier]

/** A stored weapon kind as a `Weapon`; anything unknown is a rifle. */
export function toWeapon(value: number): Weapon {
  return WEAPON_KINDS.find((kind) => kind === value) ?? Weapon.Rifle
}

/** What a soldier carries. */
export function weaponKind(sim: Simulation, soldier: EntityId): Weapon {
  return toWeapon(sim.soldiers.weapon.kind[soldier])
}

/** Seconds from deciding to throw until the grenade bursts: pull the pin or the cord, throw, and a 4-5 s fuse. */
export const GRENADE_FUSE = 4.5
/** Nobody throws where a friend is within this many metres of the target: grenades scatter, and so do fragments. */
const GRENADE_CLEARANCE = 8
/**
 * Bombers throw at enemies this close, in metres: a throw they can rely on. A man can heave one further (GRENADE_RANGE),
 * and the player may, but at the far end of a throw it scatters wide and is easily dropped short.
 */
const BOMBING_RANGE = 25
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
/** Of the nearest enemies, at most this many are checked for a sight line when picking a target... */
const CANDIDATES = 6
/** ...and this many by a machine gun, which sweeps a wide arc and looks along it for men up and moving. */
const GUN_CANDIDATES = 24
/** How far below the eye a target's waist is: hidden waists mean the target is behind cover. */
const WAIST_DROP = 0.8
const COVER_FACTOR = 0.35
/** A sniper aims at the head that shows: a man behind a parapet is only this much harder for him to hit. */
const SNIPER_COVER_FACTOR = 0.7
/** A prone soldier shows a third of a standing man's height, and less again of his width end-on. */
const PRONE_FACTOR = 0.3
/**
 * Lying flat in the open is less use against a machine gun: its grazing fire skims the ground at knee height for a long
 * way, and a man lying in its path is half as safe from it as from a rifle. Shell holes and trenches still protect.
 */
const GRAZED_FACTOR = 0.6
/** A crouching soldier in the open shows about two thirds of a standing man. */
const CROUCH_FACTOR = 0.6
/** A crouching man's waist is this far below his eye. */
const CROUCH_WAIST_DROP = 0.5
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

/** A soldier throwing a grenade this step: for his animation, and to draw the grenade on its way. */
export interface ThrowEvent {
  readonly type: "throw"
  readonly soldier: EntityId
  /** The grenade's way, for a throw the simulation made. */
  readonly grenade?: ThrownGrenade
}

/** A grenade's way from the hand to where it bursts, as the simulation threw it (grenade.ts). */
export interface ThrownGrenade {
  /** Where it leaves the hand. */
  readonly from: WorldPoint
  /** Where its arc was thrown to come down, on the ground. */
  readonly mark: WorldPoint
  /** Where the arc struck the ground short of the mark, or null when it came down on it. */
  readonly struck: WorldPoint | null
  /** Where it comes to rest after any roll, and bursts. */
  readonly rest: GroundPoint
  /** The tick it bursts on. */
  readonly burstTick: number
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
  const stance = sim.soldiers.stance.value[target]
  if (stance !== Stance.Standing && stance !== Stance.Crouching) {
    return false
  }
  const head = soldierEye(sim, target)
  const waist = head.y - (stance === Stance.Crouching ? CROUCH_WAIST_DROP : WAIST_DROP)
  return sim.lineOfSight.isClear(soldierEye(sim, shooter), { ...head, y: waist })
}

/** Chance that a shot hits, given range, the target's cover and movement, and the shooter's state. */
export function hitChance(sim: Simulation, shooter: EntityId, target: EntityId): number {
  const stats = WEAPONS[weaponKind(sim, shooter)]
  const dx = sim.soldiers.position.x[target] - sim.soldiers.position.x[shooter]
  const dz = sim.soldiers.position.z[target] - sim.soldiers.position.z[shooter]
  let chance = stats.accuracy * Math.exp(-Math.sqrt(dx * dx + dz * dz) / stats.falloff)
  if (sim.soldiers.stance.value[target] === Stance.Prone) {
    const grazed =
      sim.soldiers.weapon.kind[shooter] === Weapon.MachineGun &&
      !isInTrench(sim.map, sim.soldiers.position.x[target], sim.soldiers.position.z[target])
    chance *= grazed ? GRAZED_FACTOR : PRONE_FACTOR
  } else if (!isExposed(sim, shooter, target) || sim.soldiers.suppression.value[target] >= PINNED) {
    // A pinned target is flat in the bottom of a trench or crater: as good as covered. A sniper's business is the
    // head that shows over a parapet.
    chance *= weaponKind(sim, shooter) === Weapon.Sniper ? SNIPER_COVER_FACTOR : COVER_FACTOR
  } else if (sim.soldiers.stance.value[target] === Stance.Crouching) {
    chance *= CROUCH_FACTOR
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
  // Aiming by moonlight, starlight or at a muzzle flash is guesswork.
  chance *= aimInLight(sim, target)
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
  const stats = WEAPONS[weaponKind(sim, shooter)]
  const dx = sim.soldiers.position.x[target] - sim.soldiers.position.x[shooter]
  const dz = sim.soldiers.position.z[target] - sim.soldiers.position.z[shooter]
  if (dx * dx + dz * dz > stats.range * stats.range) {
    return false
  }
  // Darkness, fog and falling rain or snow hide men well inside a weapon's range, unless a flare lights them or their
  // own muzzle flash gives them away.
  return canMakeOut(sim, soldierEye(sim, shooter), target)
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

/**
 * A sniper's quarry, best first: an enemy machine gunner his side has spotted, then a squad leader, either one he can
 * see and reach. -1 when neither is in sight.
 */
function sniperQuarry(sim: Simulation, shooter: EntityId): EntityId {
  const side = sim.soldiers.side.value[shooter] === Side.German ? Side.German : Side.French
  const { range } = WEAPONS[Weapon.Sniper]
  const inReach = (enemy: EntityId) => {
    const dx = sim.soldiers.position.x[enemy] - sim.soldiers.position.x[shooter]
    const dz = sim.soldiers.position.z[enemy] - sim.soldiers.position.z[shooter]
    return dx * dx + dz * dz <= range * range && canEngage(sim, shooter, enemy)
  }
  const gunner = spottedGuns(sim, side)
    .map((sighting) => sighting.soldier)
    .find((enemy) => isAlive(sim, enemy) && inReach(enemy))
  if (gunner !== undefined) {
    return gunner
  }
  const leaders = sim.squads
    .filter((squad) => squad.side !== side && squad.leader >= 0)
    .map((squad) => squad.leader)
    .sort((a, b) => a - b)
  return leaders.find((enemy) => isAlive(sim, enemy) && inReach(enemy)) ?? -1
}

function pickTarget(sim: Simulation, shooter: EntityId): EntityId {
  if (weaponKind(sim, shooter) === Weapon.Sniper) {
    const quarry = sniperQuarry(sim, shooter)
    if (quarry >= 0) {
      return quarry
    }
  }
  const x = sim.soldiers.position.x[shooter]
  const z = sim.soldiers.position.z[shooter]
  const side = sim.soldiers.side.value[shooter]
  const gun = sim.soldiers.weapon.kind[shooter] === Weapon.MachineGun
  const nearest = nearestSoldiers(
    sim,
    x,
    z,
    gun ? GUN_CANDIDATES : CANDIDATES,
    weaponOf(sim, shooter).range,
    (other) => sim.soldiers.side.value[other] !== side && isAlive(sim, other)
  )
  if (gun) {
    // A gun traverses to men up and moving in the open, rather than keep on at one it has already put down.
    const upright = nearest.find(
      (enemy) =>
        sim.soldiers.stance.value[enemy] !== Stance.Prone &&
        sim.soldiers.suppression.value[enemy] < PINNED &&
        isExposed(sim, shooter, enemy) &&
        canEngage(sim, shooter, enemy)
    )
    if (upright !== undefined) {
      return upright
    }
  }
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
  return WEAPONS[weaponKind(sim, soldier)]
}

/** A bullet strikes a soldier: a wound he may fight on with, or one that puts him out of the fight. */
function strike(sim: Simulation, soldier: EntityId, shooter: EntityId): void {
  sim.soldiers.health.value[soldier] -= 0.5 + sim.rng.next() * 0.6
  if (sim.soldiers.health.value[soldier] <= 0) {
    const kind = sim.soldiers.weapon.kind[shooter] === Weapon.MachineGun ? "machine-gun" : "rifle"
    casualty(sim, soldier, KILLED_OUTRIGHT.bullet, { kind, by: sideOf(sim, shooter), soldier: shooter })
  }
}

function sideOf(sim: Simulation, soldier: EntityId): Side {
  return sim.soldiers.side.value[soldier] === Side.German ? Side.German : Side.French
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
  const kind = weaponKind(sim, shooter)
  const stats = WEAPONS[kind]
  const hit = sim.rng.next() < hitChance(sim, shooter, target)
  const { suppression } = sim.soldiers
  suppression.value[target] = Math.min(1, suppression.value[target] + stats.suppression * (hit ? 2 : 1))
  if (hit) {
    strike(sim, target, shooter)
  } else if (kind === Weapon.MachineGun) {
    // A machine gun's misses still fall among the men around its target.
    const other = inBeatenZone(sim, shooter, target)
    if (other >= 0) {
      suppression.value[other] = Math.min(1, suppression.value[other] + stats.suppression)
      if (sim.rng.next() < hitChance(sim, shooter, other) * BEATEN_ZONE.share) {
        strike(sim, other, shooter)
      }
    }
  }
  // Mud and rain foul weapons: longer between shots (climate.ts).
  const fouled = reloadFactor(sim, sim.soldiers.weapon.kind[shooter] === Weapon.MachineGun)
  sim.soldiers.weapon.cooldown[shooter] = stats.interval * fouled * (0.85 + sim.rng.next() * 0.3)
  sim.soldiers.weapon.firedAt[shooter] = sim.tick
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
  const best = aimedTarget(sim, shooter)
  if (best >= 0) {
    fireAt(sim, shooter, best)
    return true
  }
  const x = sim.soldiers.position.x[shooter]
  const z = sim.soldiers.position.z[shooter]
  const facingX = sim.soldiers.facing.x[shooter]
  const facingZ = sim.soldiers.facing.z[shooter]
  const kind = weaponKind(sim, shooter)
  sim.soldiers.weapon.cooldown[shooter] = WEAPONS[kind].interval * reloadFactor(sim, kind === Weapon.MachineGun)
  sim.soldiers.weapon.firedAt[shooter] = sim.tick
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

/**
 * Who a soldier's aimed shot would strike now: the nearest enemy within about 4 degrees of where they face that they
 * can see and reach, or -1. The player's sight picture, and what `fireAimed` shoots at.
 */
export function aimedTarget(sim: Simulation, shooter: EntityId): EntityId {
  if (!isAlive(sim, shooter)) {
    return -1
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
  return best
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

/** The probable error of a throw at a ground point, in metres: a man's aim worsens with the distance. */
export function throwError(distance: number): number {
  return THROW_ERROR.base + THROW_ERROR.perMetre * Math.min(distance, GRENADE_RANGE.max)
}

/**
 * Throws a grenade toward a ground point, if the soldier has one and is ready, at most the maximum throw away. It
 * flies an arc from his hand and bursts after its fuse where it comes to rest: where it lands, or, if it struck steep
 * ground short of its mark, wherever it rolled back to (grenade.ts). Returns whether a grenade was thrown.
 */
export function throwGrenade(sim: Simulation, thrower: EntityId, x: number, z: number): boolean {
  const { grenades, weapon, position } = sim.soldiers
  if (!isAlive(sim, thrower) || grenades.count[thrower] === 0 || weapon.cooldown[thrower] > 0) {
    return false
  }
  const distance = Math.hypot(x - position.x[thrower], z - position.z[thrower])
  const error = throwError(distance)
  grenades.count[thrower] -= 1
  weapon.cooldown[thrower] = THROW_SECONDS
  // The throw's error is in where he aims it; the arc and the ground decide where it ends up.
  const flight = grenadeFlight(sim, thrower, x + scatter(sim, error), z + scatter(sim, error))
  const burstTick = sim.tick + Math.round(GRENADE_FUSE / STEP_SECONDS)
  const ground = (point: GroundPoint) => ({ x: point.x, y: heightAt(sim.map, point.x, point.z), z: point.z })
  sim.events.push({
    type: "throw",
    soldier: thrower,
    grenade: {
      from: flight.from,
      mark: ground(flight.mark),
      struck: flight.struck ? ground(flight.struck) : null,
      rest: flight.rest,
      burstTick
    }
  })
  sim.artillery.shells.push({
    shell: Shell.Grenade,
    side: sim.soldiers.side.value[thrower] === 1 ? 1 : 0,
    x: flight.rest.x,
    z: flight.rest.z,
    landsAtTick: burstTick,
    thrower
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
  const near = soldiersNear(sim, position.x[soldier], position.z[soldier], BOMBING_RANGE)
  for (const enemy of near) {
    if (side.value[enemy] === ours || !isAlive(sim, enemy)) {
      continue
    }
    const dx = position.x[enemy] - position.x[soldier]
    const dz = position.z[enemy] - position.z[soldier]
    const distance = Math.sqrt(dx * dx + dz * dz)
    if (
      distance >= GRENADE_RANGE.min &&
      distance <= BOMBING_RANGE &&
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
  // Nor a throw he can see won't get there: from too low in a trench it would strike the parapet and roll back.
  const flight = grenadeFlight(sim, soldier, x, z)
  const fallsWide = Math.hypot(flight.rest.x - x, flight.rest.z - z) > GRENADE_CLEARANCE / 2
  return !friendNear && !fallsWide && throwGrenade(sim, soldier, x, z)
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
