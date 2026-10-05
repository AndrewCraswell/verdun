import { pointsAlong, type Trench, TRENCH_PROFILE } from "@verdun/map"
import type { EntityId } from "bitecs"
import { Shell } from "./artillery.ts"
import { Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import { allotReinforcements } from "./reinforcements.ts"
import { enqueueCommand, type Simulation, spawnSoldier } from "./simulation.ts"
import { createSquad, type Squad } from "./squads.ts"

/** Soldiers per squad: the player commands one squad. */
export const SQUAD_SIZE = 8
/** One squad in this many carries a machine gun, in its last slot. */
const MACHINE_GUN_EVERY = 5
/** One squad in this many has a rifle grenadier, in its third slot. */
const RIFLE_GRENADIER_EVERY = 4
/** One squad in this many has a sniper, in its second slot. */
const SNIPER_EVERY = 6
/** How far toward the enemy the fire step's middle is from the trench centre line. */
const FIRE_STEP_OFFSET = (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2

export interface Skirmish {
  readonly french: readonly EntityId[]
  readonly german: readonly EntityId[]
  /** The player's squad: the one in the middle of the French line. */
  readonly playerSquad: Squad
  /** Squads holding each side's support line, behind the front: the reserves that counter-attack a lost front line. */
  readonly reserves: readonly Squad[]
}

/** A side's fire trenches facing the enemy, the front line first and then back toward the rear. */
function fireLines(trenches: readonly Trench[], facing: "north" | "south"): Trench[] {
  const forwardZ = (trench: Trench) => trench.points[0]?.[1] ?? 0
  return trenches
    .filter((trench) => trench.kind === "fire" && trench.facing === facing)
    .sort((a, b) => (facing === "north" ? forwardZ(b) - forwardZ(a) : forwardZ(a) - forwardZ(b)))
}

/** The front-line fire trench for a side: the one facing the enemy that sits closest to no man's land. */
function frontLine(trenches: readonly Trench[], facing: "north" | "south"): Trench {
  const [front] = fireLines(trenches, facing)
  if (!front) {
    throw new Error(`The map has no ${facing}-facing fire trench to man`)
  }
  return front
}

/** Evenly spaced places along a trench, up on the fire step where soldiers can see and shoot over the parapet. */
function fireStepPositions(trench: Trench, count: number): [number, number][] {
  const length = trench.points.slice(1).reduce((total, b, index) => {
    const a = trench.points[index]
    return total + Math.hypot(b[0] - a[0], b[1] - a[1])
  }, 0)
  const towardEnemy = trench.facing === "south" ? -1 : 1
  return pointsAlong(trench, length / count)
    .slice(0, count)
    .map(([x, z]) => [x, z + towardEnemy * FIRE_STEP_OFFSET])
}

/** What the man in a squad slot carries: a machine gun last in every fifth squad, a sniper's rifle second in every sixth, a rifle grenade discharger third in every fourth, a rifle otherwise. */
function weaponFor(squadIndex: number, slot: number, size: number): Weapon {
  if (squadIndex % MACHINE_GUN_EVERY === 2 && slot === size - 1) {
    return Weapon.MachineGun
  }
  if (squadIndex % SNIPER_EVERY === 4 && slot === 1) {
    return Weapon.Sniper
  }
  if (squadIndex % RIFLE_GRENADIER_EVERY === 0 && slot === 2) {
    return Weapon.RifleGrenadier
  }
  return Weapon.Rifle
}

/**
 * Mans a trench in squads of neighbours. Every fifth squad's last soldier carries a machine gun. The squad at
 * `playerSquadIndex`, if any, is the player's.
 */
function manTrench(sim: Simulation, trench: Trench, side: Side, count: number, playerSquadIndex = -1): Squad[] {
  const positions = fireStepPositions(trench, count)
  const squads: Squad[] = []
  for (let start = 0; start < positions.length; start += SQUAD_SIZE) {
    const squadIndex = squads.length
    const slots = positions.slice(start, start + SQUAD_SIZE)
    const members = slots.map(([x, z], slot) =>
      spawnSoldier(sim, {
        side,
        x,
        z,
        weapon: weaponFor(squadIndex, slot, slots.length)
      })
    )
    squads.push(createSquad(sim, side, members, squadIndex === playerSquadIndex ? "player" : "ai"))
  }
  return squads
}

/**
 * Both sides man their front-line fire trench on the fire step, facing each other, in squads of eight holding their
 * ground and firing at whatever they can see, with reserves in the support line behind where the map has one. The
 * player commands the squad in the middle of their side's line, French or German. Each side holds
 * `reinforcementsPerSide` men back behind the sector to replace squads that are wiped out.
 */
/**
 * Each side's shells for the day's battle: enough for one prepared attack, so every bombardment spent on the wire is a
 * barrage not fired later. The French have the guns for an offensive; the Germans hold more shrapnel and gas for
 * defence.
 */
export const SHELL_ALLOTMENT: Readonly<Record<Side, readonly (readonly [Shell, number])[]>> = {
  [Side.French]: [
    [Shell.FieldHighExplosive, 8000],
    [Shell.FieldShrapnel, 1000],
    [Shell.HeavyHighExplosive, 400],
    [Shell.FieldGas, 500]
  ],
  [Side.German]: [
    [Shell.FieldHighExplosive, 5000],
    [Shell.FieldShrapnel, 2000],
    [Shell.HeavyHighExplosive, 400],
    [Shell.FieldGas, 1000]
  ]
}

export function setupSkirmish(
  sim: Simulation,
  soldiersPerSide = 200,
  reservesPerSide = 64,
  reinforcementsPerSide = 160,
  playerSide: Side = Side.French
): Skirmish {
  const squadsPerSide = Math.ceil(soldiersPerSide / SQUAD_SIZE)
  const middle = Math.floor(squadsPerSide / 2)
  const frenchSquads = manTrench(
    sim,
    frontLine(sim.map.trenches, "north"),
    Side.French,
    soldiersPerSide,
    playerSide === Side.French ? middle : -1
  )
  const germanSquads = manTrench(
    sim,
    frontLine(sim.map.trenches, "south"),
    Side.German,
    soldiersPerSide,
    playerSide === Side.German ? middle : -1
  )
  const reserves = (["north", "south"] as const).flatMap((facing) => {
    const support = fireLines(sim.map.trenches, facing)[1]
    return support && reservesPerSide > 0
      ? manTrench(sim, support, facing === "north" ? Side.French : Side.German, reservesPerSide)
      : []
  })
  for (const squad of reserves) {
    squad.order = { kind: "reserve" }
  }
  allotReinforcements(sim, Side.French, reinforcementsPerSide)
  allotReinforcements(sim, Side.German, reinforcementsPerSide)
  for (const side of [Side.French, Side.German]) {
    for (const [shell, rounds] of SHELL_ALLOTMENT[side]) {
      enqueueCommand(sim, { type: "ammunition", side, shell, rounds })
    }
  }
  const playerSquad = [...frenchSquads, ...germanSquads].find((squad) => squad.controller === "player")
  if (!playerSquad) {
    throw new Error("The player's line has no squads to command")
  }
  return {
    french: frenchSquads.flatMap((squad) => squad.members),
    german: germanSquads.flatMap((squad) => squad.members),
    playerSquad,
    reserves
  }
}

/**
 * A call for fire on a point, from the front line by runner or field telephone. It takes about 30 seconds to arrive
 * and lay the guns, then a battery fires for 45 seconds on a 60 m front.
 */
export function callForFire(sim: Simulation, side: Side, x: number, z: number): void {
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: {
      side,
      shell: Shell.FieldHighExplosive,
      fromX: x - 30,
      toX: x + 30,
      z,
      band: 20,
      roundsPerMinute: 24,
      delay: 30,
      duration: 45
    }
  })
}

/**
 * A gas shoot on a point: field guns fire gas shells (French No. 5 phosgene, German Green Cross) into a 100 m by 40 m
 * area for a minute after the usual 30 seconds to pass the order and lay the guns. Gas shells were fired in quantity
 * to build a cloud thick enough to catch men before their masks were on, and to keep them masked for long after.
 */
export function callGasOn(sim: Simulation, side: Side, x: number, z: number): void {
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: {
      side,
      shell: Shell.FieldGas,
      fromX: x - 50,
      toX: x + 50,
      z,
      band: 40,
      roundsPerMinute: 60,
      delay: 30,
      duration: 60
    }
  })
}
