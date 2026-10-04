import { type ChangedArea, heightAt, mapDepth, mapWidth, mergeAreas, stampCrater, type Trench } from "@verdun/map"
import type { EntityId } from "bitecs"
import { applyCommand } from "./commands.ts"
import { Side, Stance } from "./components.ts"
import { refreshGasGround, releaseGas } from "./gas.ts"
import type { WorldPoint } from "./line-of-sight.ts"
import { type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"
import { soldiersNear } from "./spatial.ts"
import { isAlive } from "./squads.ts"
import { isInTrench, markShelled, soldierEye } from "./stance.ts"
import { cutWire } from "./wire.ts"

/**
 * Shells by historical type. Field guns are the French 75 mm (Mle 1897) and German 77 mm (FK 96 n.A.); the heavy
 * howitzer is the 15 cm class (German sFH 13, French 155 mm). Field gas shells are the German Green Cross
 * (diphosgene) and the French No. 5 (phosgene), both first fired in quantity at Verdun in 1916. Hand grenades (the
 * French F1, the German stick grenade) burst the same way, thrown rather than fired.
 */
export const Shell = {
  FieldHighExplosive: 0,
  FieldShrapnel: 1,
  HeavyHighExplosive: 2,
  FieldGas: 3,
  Grenade: 4
} as const
export type Shell = (typeof Shell)[keyof typeof Shell]

interface ShellStats {
  /** Crater bowl radius and depth, in metres; zero for airbursts. */
  readonly craterRadius: number
  readonly craterDepth: number
  /** Distance at which half of exposed soldiers become casualties. */
  readonly lethalExposed: number
  /** The same for soldiers shielded from the burst by earth: a trench, a crater, a fold in the ground. */
  readonly lethalCovered: number
  /** Out to this distance the burst pins soldiers down and shakes them. */
  readonly suppressionRadius: number
  /** Average speed over the flight, for flight time from the battery, in metres per second. */
  readonly flightSpeed: number
  /** Probable error (50% zone) in range and in deflection, in metres: shells spread far more along the line of fire. */
  readonly rangeError: number
  readonly deflectionError: number
  /** Shrapnel bursts in the air short of the target and sprays balls forward in a cone; zero for ground bursts. */
  readonly airburstHeight: number
  /** Gas released on bursting, in milligrams: about 0.6 kg of liquid agent in a field gun's gas shell. */
  readonly gasMass: number
  /**
   * Smoke and dust thrown up, in the smoke grid's units: enough from a field gun's shell to hide a man behind it for a
   * few seconds, several times as much from a heavy howitzer's.
   */
  readonly smokeMass: number
  /** Barbed wire is cut within this many metres of the burst: a field gun's HE clears a gap a few metres wide. */
  readonly wireCutRadius: number
}

export const SHELLS: Readonly<Record<Shell, ShellStats>> = {
  [Shell.FieldHighExplosive]: {
    craterRadius: 1,
    craterDepth: 0.5,
    lethalExposed: 6,
    lethalCovered: 1.2,
    suppressionRadius: 35,
    flightSpeed: 420,
    rangeError: 20,
    deflectionError: 4,
    airburstHeight: 0,
    gasMass: 0,
    smokeMass: 8000,
    wireCutRadius: 2.5
  },
  [Shell.FieldShrapnel]: {
    craterRadius: 0,
    craterDepth: 0,
    lethalExposed: 0,
    lethalCovered: 0,
    suppressionRadius: 30,
    flightSpeed: 420,
    rangeError: 20,
    deflectionError: 4,
    airburstHeight: 6,
    gasMass: 0,
    smokeMass: 1500,
    wireCutRadius: 1.2
  },
  [Shell.HeavyHighExplosive]: {
    craterRadius: 2.5,
    craterDepth: 1.5,
    lethalExposed: 12,
    lethalCovered: 3.5,
    suppressionRadius: 70,
    flightSpeed: 300,
    rangeError: 30,
    deflectionError: 6,
    airburstHeight: 0,
    gasMass: 0,
    smokeMass: 25_000,
    wireCutRadius: 5
  },
  // A small burster just opens the shell: a quiet pop that men often didn't notice over the barrage.
  [Shell.FieldGas]: {
    craterRadius: 0.4,
    craterDepth: 0.2,
    lethalExposed: 1.5,
    lethalCovered: 0.3,
    suppressionRadius: 8,
    flightSpeed: 420,
    rangeError: 20,
    deflectionError: 4,
    airburstHeight: 0,
    gasMass: 600_000,
    smokeMass: 1000,
    wireCutRadius: 0.5
  },
  // Thrown, not fired: no battery, no flight from the rear. About 60 g of explosive; deadly within a few metres, its
  // fragments stopped by the traverses either side of a trench bay.
  [Shell.Grenade]: {
    craterRadius: 0.3,
    craterDepth: 0.1,
    lethalExposed: 3,
    lethalCovered: 0.8,
    suppressionRadius: 12,
    flightSpeed: 0,
    rangeError: 0,
    deflectionError: 0,
    airburstHeight: 0,
    gasMass: 0,
    smokeMass: 600,
    wireCutRadius: 0.8
  }
}

/** Shrapnel balls travel this far forward from the burst, fanning out to this half-width at the end. */
const SHRAPNEL_REACH = 120
const SHRAPNEL_SPREAD = 15
/** Chance an exposed soldier at the burst is hit by shrapnel; it falls off along the cone. */
const SHRAPNEL_HIT = 0.45
/** Shrapnel bursts this far short of its aim point, so the cone covers the target. */
const SHRAPNEL_SHORT = 15
/**
 * Lying flat cuts the area in which fragments hit by about three quarters (fragments fly outward and upward from the
 * burst), so the 50% radius roughly halves.
 */
const PRONE_LETHAL_FACTOR = 0.5
/**
 * Deep dugouts, 6 to 9 m down, shrugged off all but a direct hit from a heavy shell on the entrance; a shaft can still
 * collapse and bury the men inside.
 */
const DUGOUT_LETHAL_FACTOR = 0.2
/** Shrapnel balls can't reach men lying flat as well as men standing: they come down at a shallow angle. */
const SHRAPNEL_PRONE_FACTOR = 0.35
/** Batteries stand this far behind their own end of the map, out of sight. */
const BATTERY_DISTANCE = 4000
/** Terrain sight lines are rebuilt at most this often after craters, in steps (2 s): the rebuild costs about 14 ms. */
const SIGHT_REBUILD_INTERVAL = 40
/**
 * Delay between the first enemy seen in no man's land and the defensive barrage landing: the SOS flare goes up, the
 * battery is telephoned, the guns are laid. Historically one to two minutes.
 */
export const DEFENSIVE_BARRAGE_DELAY = 60
/** How long the defensive barrage keeps firing, in seconds. */
const DEFENSIVE_BARRAGE_DURATION = 240
/** Ahead of the defenders' wire, where the defensive barrage drops, as a fraction of the gap between the lines. */
const DEFENSIVE_BARRAGE_LINE = 0.35

/** A shell fired and still in the air. */
export interface ShellInFlight {
  readonly shell: Shell
  readonly side: Side
  readonly x: number
  readonly z: number
  readonly landsAtTick: number
}

/** A creeping barrage moves its line forward in lifts; infantry follow behind it. */
export interface Creep {
  /** Metres the line moves at each lift. */
  readonly lift: number
  /** Seconds between lifts. */
  readonly interval: number
  /** The line stops creeping, and the mission ends, beyond this z. */
  readonly stopZ: number
  /**
   * The infantry's objective and the protective line beyond it. One lift after leaving the objective the barrage jumps
   * to the protective line and holds there, shielding the men consolidating their gains from counter-attack
   * without dropping shells among them.
   */
  readonly protect?: { readonly objectiveZ: number; readonly lineZ: number }
}

export interface FireMissionPlan {
  readonly side: Side
  readonly shell: Shell
  /** Target line, east to west, and how deep a band around it the rounds fall in. */
  readonly fromX: number
  readonly toX: number
  readonly z: number
  readonly band: number
  readonly roundsPerMinute: number
  /** Seconds from the order until the first rounds land: communications and laying the guns. */
  readonly delay: number
  /** Seconds of fire once it starts. Creeping barrages end when they reach `creep.stopZ` instead. */
  readonly duration: number
  readonly creep?: Creep
}

export interface FireMission extends FireMissionPlan {
  readonly id: number
  readonly startTick: number
  /** The target line now; it moves with each lift of a creeping barrage. */
  lineZ: number
  /** Rounds owed but not yet fired, carried between steps so fractional rates stay exact. */
  owed: number
  finished: boolean
}

/** A shell landing, for renderers: where, what kind, and the ground it changed. */
export interface BurstEvent {
  readonly type: "burst"
  readonly shell: Shell
  readonly at: WorldPoint
  readonly crater: ChangedArea | null
}

/** Artillery state carried by the simulation and its snapshots. */
export interface ArtilleryState {
  readonly missions: FireMission[]
  readonly shells: ShellInFlight[]
  /** Ground changed by craters whose sight lines haven't been rebuilt yet. */
  pendingSightRebuild: ChangedArea | null
  /** Tick at which a side first saw attackers in no man's land and called for its defensive barrage, or -1. */
  readonly sosCalledAt: Record<Side, number>
}

export function createArtilleryState(): ArtilleryState {
  return {
    missions: [],
    shells: [],
    pendingSightRebuild: null,
    sosCalledAt: { [Side.French]: -1, [Side.German]: -1 }
  }
}

/** A deep copy, for snapshots: missions and shells are plain data. */
export function copyArtilleryState(state: ArtilleryState): ArtilleryState {
  return {
    missions: state.missions.map((mission) => ({
      ...mission,
      ...(mission.creep
        ? {
            creep: { ...mission.creep, ...(mission.creep.protect ? { protect: { ...mission.creep.protect } } : {}) }
          }
        : {})
    })),
    shells: state.shells.map((shell) => ({ ...shell })),
    pendingSightRebuild: state.pendingSightRebuild ? { ...state.pendingSightRebuild } : null,
    sosCalledAt: { ...state.sosCalledAt }
  }
}

/** Starts a fire mission. Returns its id. */
export function orderFireMission(sim: Simulation, plan: FireMissionPlan): number {
  const id = sim.artillery.missions.length
  sim.artillery.missions.push({
    ...plan,
    id,
    startTick: sim.tick + Math.round(plan.delay * TICK_RATE),
    lineZ: plan.z,
    owed: 0,
    finished: false
  })
  return id
}

/** A normally distributed number with the given probable error (50% of values within it), from the simulation's RNG. */
function gaussian(sim: Simulation, probableError: number): number {
  // Box-Muller; probable error is 0.6745 standard deviations.
  const u = Math.max(sim.rng.next(), Number.EPSILON)
  const v = sim.rng.next()
  return (Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * probableError) / 0.6745
}

/** Where a side's batteries fire from: far behind its own end of the map. French to the south, Germans to the north. */
function batteryZ(sim: Simulation, side: Side): number {
  return side === Side.French ? -BATTERY_DISTANCE : mapDepth(sim.map) + BATTERY_DISTANCE
}

/** Fires one round of a mission: aims somewhere in the target band and adds dispersion, then sends it on its flight. */
function fireRound(sim: Simulation, mission: FireMission): void {
  const stats = SHELLS[mission.shell]
  const aimX = mission.fromX + sim.rng.next() * (mission.toX - mission.fromX)
  const aimZ = mission.lineZ + (sim.rng.next() - 0.5) * mission.band
  // Batteries fire north or south, so range error falls along z and deflection along x.
  const x = Math.min(mapWidth(sim.map), Math.max(0, aimX + gaussian(sim, stats.deflectionError)))
  const z = Math.min(mapDepth(sim.map), Math.max(0, aimZ + gaussian(sim, stats.rangeError)))
  const flightSeconds = Math.abs(z - batteryZ(sim, mission.side)) / stats.flightSpeed
  sim.artillery.shells.push({
    shell: mission.shell,
    side: mission.side,
    x,
    z,
    landsAtTick: sim.tick + Math.max(1, Math.round(flightSeconds * TICK_RATE))
  })
}

/** Chance of becoming a casualty at a distance, given the distance at which it's even odds. */
function casualtyChance(distance: number, halfLethal: number): number {
  return halfLethal > 0 ? Math.exp(-Math.LN2 * (distance / halfLethal) ** 2) : 0
}

function wound(sim: Simulation, soldier: EntityId, severity: number): void {
  sim.soldiers.health.value[soldier] -= severity * (0.6 + sim.rng.next() * 0.8)
  if (sim.soldiers.health.value[soldier] <= 0) {
    applyCommand(sim, { type: "kill", soldier })
  }
}

/** A soldier's chest, the point fragments must reach. */
function chest(sim: Simulation, soldier: EntityId): WorldPoint {
  const eye = soldierEye(sim, soldier)
  return { ...eye, y: eye.y - (sim.soldiers.stance.value[soldier] === Stance.Prone ? 0.15 : 0.4) }
}

/** The 50% casualty radius of a burst for one soldier, given their stance and the earth around them. */
function halfLethalFor(sim: Simulation, stats: ShellStats, at: WorldPoint, soldier: EntityId): number {
  const stance = sim.soldiers.stance.value[soldier]
  if (stance === Stance.Sheltering) {
    return stats.lethalCovered * DUGOUT_LETHAL_FACTOR
  }
  const radius = shielded(sim, at, soldier) ? stats.lethalCovered : stats.lethalExposed
  return stance === Stance.Prone ? radius * PRONE_LETHAL_FACTOR : radius
}

/** Whether earth shields a soldier from a burst. Without sight lines, everyone is treated as exposed. */
function shielded(sim: Simulation, from: WorldPoint, soldier: EntityId): boolean {
  return sim.lineOfSight ? !sim.lineOfSight.isClear(from, chest(sim, soldier)) : false
}

/** Suppresses and shakes everyone near a burst, more the closer they are. Shellfire breaks men more than bullets. */
function shake(sim: Simulation, at: WorldPoint, radius: number): void {
  for (const soldier of soldiersNear(sim, at.x, at.z, radius)) {
    if (!isAlive(sim, soldier)) {
      continue
    }
    const dx = sim.soldiers.position.x[soldier] - at.x
    const dz = sim.soldiers.position.z[soldier] - at.z
    // Math.sqrt, not Math.hypot: it's correctly rounded on every engine, which keeps the simulation deterministic.
    const distance = Math.sqrt(dx * dx + dz * dz)
    if (distance < radius) {
      const closeness = 1 - distance / radius
      sim.soldiers.suppression.value[soldier] = Math.min(1, sim.soldiers.suppression.value[soldier] + 0.8 * closeness)
      sim.soldiers.morale.value[soldier] = Math.max(0, sim.soldiers.morale.value[soldier] - 0.08 * closeness)
      markShelled(sim, soldier)
    }
  }
}

/** A ground burst: blast and fragments around the point, a crater, churned earth. */
function groundBurst(sim: Simulation, landed: ShellInFlight): BurstEvent {
  const stats = SHELLS[landed.shell]
  const at = { x: landed.x, y: heightAt(sim.map, landed.x, landed.z) + 0.3, z: landed.z }
  const reach = stats.lethalExposed * 3
  for (const soldier of soldiersNear(sim, at.x, at.z, reach)) {
    if (!isAlive(sim, soldier)) {
      continue
    }
    const dx = sim.soldiers.position.x[soldier] - at.x
    const dz = sim.soldiers.position.z[soldier] - at.z
    const distance = Math.sqrt(dx * dx + dz * dz)
    if (distance > reach) {
      continue
    }
    const halfLethal = halfLethalFor(sim, stats, at, soldier)
    if (distance < halfLethal / 3) {
      // Close enough that blast alone kills.
      applyCommand(sim, { type: "kill", soldier })
    } else if (sim.rng.next() < casualtyChance(distance, halfLethal)) {
      wound(sim, soldier, landed.shell === Shell.HeavyHighExplosive ? 1.4 : 1)
    }
  }
  shake(sim, at, stats.suppressionRadius)
  const crater = stampCrater(sim.map, {
    x: landed.x,
    z: landed.z,
    radius: stats.craterRadius,
    depth: stats.craterDepth
  })
  sim.artillery.pendingSightRebuild = mergeAreas(sim.artillery.pendingSightRebuild, crater)
  refreshGasGround(sim.gas, sim.map, crater)
  if (stats.gasMass > 0) {
    releaseGas(sim.gas, landed.x, landed.z, stats.gasMass)
  }
  releaseGas(sim.smoke, landed.x, landed.z, stats.smokeMass)
  cutWire(sim, landed.x, landed.z, stats.wireCutRadius)
  return { type: "burst", shell: landed.shell, at, crater }
}

/**
 * A shrapnel airburst: the shell bursts in the air short of its aim and sprays balls forward in a widening cone.
 * Lethal to troops in the open, little use against men in a trench.
 */
function airburst(sim: Simulation, landed: ShellInFlight): BurstEvent {
  const stats = SHELLS[landed.shell]
  // Shells come from the firing side's batteries, so "forward" is toward the enemy.
  const forward = landed.side === Side.French ? 1 : -1
  const burstZ = landed.z - forward * SHRAPNEL_SHORT
  const at = { x: landed.x, y: heightAt(sim.map, landed.x, burstZ) + stats.airburstHeight, z: burstZ }
  for (const soldier of soldiersNear(sim, landed.x, burstZ, SHRAPNEL_REACH + SHRAPNEL_SPREAD)) {
    if (!isAlive(sim, soldier)) {
      continue
    }
    const along = (sim.soldiers.position.z[soldier] - burstZ) * forward
    const across = Math.abs(sim.soldiers.position.x[soldier] - landed.x)
    if (along < 0 || along > SHRAPNEL_REACH || across > 2 + (SHRAPNEL_SPREAD * along) / SHRAPNEL_REACH) {
      continue
    }
    const stance = sim.soldiers.stance.value[soldier]
    if (stance === Stance.Sheltering) {
      continue
    }
    const chance =
      SHRAPNEL_HIT *
      (1 - along / SHRAPNEL_REACH) *
      (shielded(sim, at, soldier) ? 0.1 : 1) *
      (stance === Stance.Prone ? SHRAPNEL_PRONE_FACTOR : 1)
    if (sim.rng.next() < chance) {
      wound(sim, soldier, 0.8)
    }
  }
  shake(sim, at, stats.suppressionRadius)
  releaseGas(sim.smoke, landed.x, burstZ, stats.smokeMass)
  // Shrapnel balls snip a strand here and there where they come down.
  cutWire(sim, landed.x, landed.z, stats.wireCutRadius)
  return { type: "burst", shell: landed.shell, at, crater: null }
}

/** A side's front-line fire trench: the one facing the enemy that lies closest to no man's land. */
function frontLine(trenches: readonly Trench[], side: Side): Trench | null {
  const facing = side === Side.French ? "north" : "south"
  const middle = (trench: Trench) => trench.points.reduce((sum, [, z]) => sum + z, 0) / trench.points.length
  const lines = trenches
    .filter((trench) => trench.kind === "fire" && trench.facing === facing)
    .sort((a, b) => (side === Side.French ? middle(b) - middle(a) : middle(a) - middle(b)))
  return lines[0] ?? null
}

/** The z of a side's front-line fire trench, averaged along its length. */
export function frontLineZ(trenches: readonly Trench[], side: Side): number | null {
  const line = frontLine(trenches, side)
  return line ? line.points.reduce((sum, [, z]) => sum + z, 0) / line.points.length : null
}

/** How deep a side's front line runs: the z of its bays nearest the enemy, and of its rearmost. */
export interface LineSpan {
  readonly forward: number
  readonly rear: number
}

/**
 * The span of a side's front-line fire trench. Lines zigzag around salients and re-entrants, tens of metres deep, so a
 * barrage aimed at the average z would miss the bays pushed forward of it.
 */
export function frontLineSpan(trenches: readonly Trench[], side: Side): LineSpan | null {
  const line = frontLine(trenches, side)
  if (!line) {
    return null
  }
  const zs = line.points.map(([, z]) => z)
  return side === Side.French
    ? { forward: Math.max(...zs), rear: Math.min(...zs) }
    : { forward: Math.min(...zs), rear: Math.max(...zs) }
}

/**
 * The defenders' answer to an attack: as soon as one of a side's soldiers sees an enemy out in no man's land, they call
 * for a barrage ahead of their own wire. It lands after the historical delay and fires field HE and shrapnel.
 */
function callDefensiveBarrage(sim: Simulation): void {
  for (const side of [Side.French, Side.German]) {
    if (sim.artillery.sosCalledAt[side] >= 0) {
      continue
    }
    const own = frontLineSpan(sim.map.trenches, side)
    const enemy = frontLineSpan(sim.map.trenches, side === Side.French ? Side.German : Side.French)
    if (own === null || enemy === null) {
      continue
    }
    // Between the bays each side has pushed furthest forward.
    const ownLine = own.forward
    const enemyLine = enemy.forward
    // Out of every trench and between the lines. Front lines zigzag, so a man in a forward bay isn't in the open.
    const inNoMansLand = (x: number, z: number) =>
      !isInTrench(sim.map, x, z) &&
      (side === Side.German ? z > enemyLine + 10 && z < ownLine - 5 : z < enemyLine - 10 && z > ownLine + 5)
    const spotted = Array.from(soldierIds(sim)).some((soldier) => {
      const target = sim.soldiers.target.id[soldier]
      return (
        sim.soldiers.side.value[soldier] === side &&
        target >= 0 &&
        inNoMansLand(sim.soldiers.position.x[target], sim.soldiers.position.z[target])
      )
    })
    if (!spotted) {
      continue
    }
    sim.artillery.sosCalledAt[side] = sim.tick
    const z = ownLine + (enemyLine - ownLine) * DEFENSIVE_BARRAGE_LINE
    const common = {
      side,
      fromX: 0,
      toX: mapWidth(sim.map),
      z,
      band: 40,
      delay: DEFENSIVE_BARRAGE_DELAY,
      duration: DEFENSIVE_BARRAGE_DURATION
    }
    orderFireMission(sim, { ...common, shell: Shell.FieldHighExplosive, roundsPerMinute: 40 })
    orderFireMission(sim, { ...common, shell: Shell.FieldShrapnel, roundsPerMinute: 20 })
  }
}

/**
 * One step of artillery: defenders call for barrages, missions fire their rounds and lift, shells in flight land, and
 * sight lines catch up with new craters a couple of times a second.
 */
export function artillerySystem(sim: Simulation): void {
  callDefensiveBarrage(sim)
  const { missions, shells } = sim.artillery

  for (const mission of missions) {
    if (mission.finished || sim.tick < mission.startTick) {
      continue
    }
    const elapsed = (sim.tick - mission.startTick) / TICK_RATE
    if (mission.creep) {
      const lifts = Math.floor(elapsed / mission.creep.interval)
      const direction = Math.sign(mission.creep.stopZ - mission.z)
      const creepingLine = mission.z + direction * lifts * mission.creep.lift
      if ((creepingLine - mission.creep.stopZ) * direction > 0) {
        mission.finished = true
        continue
      }
      const protect = mission.creep.protect
      // Off the objective, the first lift drops a full lift beyond it, keeping its garrison's heads down while the
      // attackers rush in without landing among them; after that, the protective line.
      const beyond = protect ? (creepingLine - protect.objectiveZ) * direction : 0
      if (!protect || beyond <= 0) {
        mission.lineZ = creepingLine
      } else if (beyond <= mission.creep.lift) {
        mission.lineZ = protect.objectiveZ + direction * mission.creep.lift
      } else {
        mission.lineZ = protect.lineZ
      }
    } else if (elapsed >= mission.duration) {
      mission.finished = true
      continue
    }
    mission.owed += mission.roundsPerMinute / 60 / TICK_RATE
    while (mission.owed >= 1) {
      mission.owed -= 1
      fireRound(sim, mission)
    }
  }

  for (let index = shells.length - 1; index >= 0; index--) {
    const landed = shells[index]
    if (landed && landed.landsAtTick <= sim.tick) {
      shells.splice(index, 1)
      sim.events.push(SHELLS[landed.shell].airburstHeight > 0 ? airburst(sim, landed) : groundBurst(sim, landed))
    }
  }

  const pending = sim.artillery.pendingSightRebuild
  if (pending && sim.tick % SIGHT_REBUILD_INTERVAL === 0) {
    sim.lineOfSight?.rebuildRegion(pending.minX, pending.minZ, pending.maxX, pending.maxZ)
    sim.artillery.pendingSightRebuild = null
  }
}

/** The line a creeping barrage is on now, or null once it has finished or doesn't exist. */
export function barrageLine(sim: Simulation, missionId: number): number | null {
  const mission = sim.artillery.missions[missionId]
  return mission && !mission.finished ? mission.lineZ : null
}
