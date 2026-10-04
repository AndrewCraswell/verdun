import { mapWidth, pointsAlong, type Trench, TRENCH_PROFILE } from "@verdun/map"
import {
  createSquad,
  enqueueCommand,
  type EntityId,
  frontLineSpan,
  frontLineZ,
  type LineSpan,
  Shell,
  Side,
  type Simulation,
  type Squad,
  spawnSoldier,
  Weapon
} from "@verdun/sim"

/** Soldiers per squad: the player commands one squad. */
export const SQUAD_SIZE = 8
/** One squad in this many carries a machine gun, in its last slot. */
const MACHINE_GUN_EVERY = 5
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
        weapon: squadIndex % MACHINE_GUN_EVERY === 2 && slot === slots.length - 1 ? Weapon.MachineGun : Weapon.Rifle
      })
    )
    squads.push(createSquad(sim, side, members, squadIndex === playerSquadIndex ? "player" : "ai"))
  }
  return squads
}

/**
 * Both sides man their front-line fire trench on the fire step, facing each other, in squads of eight holding their
 * ground and firing at whatever they can see, with reserves in the support line behind where the map has one. The
 * player commands the squad in the middle of the French line.
 */
export function setupSkirmish(sim: Simulation, soldiersPerSide = 200, reservesPerSide = 64): Skirmish {
  const squadsPerSide = Math.ceil(soldiersPerSide / SQUAD_SIZE)
  const frenchSquads = manTrench(
    sim,
    frontLine(sim.map.trenches, "north"),
    Side.French,
    soldiersPerSide,
    Math.floor(squadsPerSide / 2)
  )
  const germanSquads = manTrench(sim, frontLine(sim.map.trenches, "south"), Side.German, soldiersPerSide)
  const reserves = (["north", "south"] as const).flatMap((facing) => {
    const support = fireLines(sim.map.trenches, facing)[1]
    return support && reservesPerSide > 0
      ? manTrench(sim, support, facing === "north" ? Side.French : Side.German, reservesPerSide)
      : []
  })
  for (const squad of reserves) {
    squad.order = { kind: "reserve" }
  }
  const playerSquad = frenchSquads.find((squad) => squad.controller === "player")
  if (!playerSquad) {
    throw new Error("The French line has no squads to command")
  }
  return {
    french: frenchSquads.flatMap((squad) => squad.members),
    german: germanSquads.flatMap((squad) => squad.members),
    playerSquad,
    reserves
  }
}

/**
 * Creeping barrage timing, after French practice at Verdun in late 1916: the barrage opens 70 m out as the infantry go
 * over, then lifts 50 m every 90 s; the infantry keep about 70 m behind it, close enough to be on the enemy's parapet
 * before the garrison is up, far enough that few of their own shells fall among them.
 */
export const CREEPING_BARRAGE = {
  openAhead: 70,
  lift: 50,
  interval: 90,
  standoff: 70,
  // About one field gun per 15-20 m of front, firing 3-4 rounds a minute.
  roundsPerMinute: 150,
  // A standing barrage keeps the enemy trench's garrison down their dugouts until the creeping barrage arrives.
  standingRoundsPerMinute: 60
} as const

/** Both front lines as seen from one side: how deep each runs, and the enemy's middle. */
function lines(sim: Simulation, side: Side): { own: LineSpan; enemy: LineSpan; enemyMiddle: number } | null {
  const enemySide = side === Side.French ? Side.German : Side.French
  const own = frontLineSpan(sim.map.trenches, side)
  const enemy = frontLineSpan(sim.map.trenches, enemySide)
  const enemyMiddle = frontLineZ(sim.map.trenches, enemySide)
  return own === null || enemy === null || enemyMiddle === null ? null : { own, enemy, enemyMiddle }
}

/** The whistle: the whole side goes over the top behind a creeping barrage, which opens at once. */
export function attackBehindBarrage(sim: Simulation, side: Side): void {
  const front = lines(sim, side)
  if (!front) {
    return
  }
  const direction = Math.sign(front.enemy.forward - front.own.forward)
  enqueueCommand(sim, {
    type: "barrage-attack",
    side,
    fromX: 0,
    toX: mapWidth(sim.map),
    // Opens ahead of our own most forward bays; the objective is the whole depth of the enemy's line.
    startZ: front.own.forward + direction * CREEPING_BARRAGE.openAhead,
    objectiveZ: front.enemy.rear,
    objectiveDepth: Math.abs(front.enemy.rear - front.enemy.forward),
    roundsPerMinute: CREEPING_BARRAGE.roundsPerMinute,
    lift: CREEPING_BARRAGE.lift,
    interval: CREEPING_BARRAGE.interval,
    standoff: CREEPING_BARRAGE.standoff,
    standingRoundsPerMinute: CREEPING_BARRAGE.standingRoundsPerMinute,
    delay: 0
  })
}

/**
 * Where the enemy's wire belts lie in front of its front line, in metres (their middle, and how deep they run), and
 * how hard the field guns work at cutting them. Cutting wire took days of fire and tens of thousands of shells; this
 * two-minute bombardment stands for the end of that, so it fires at the rate that does days' worth of cutting.
 */
const WIRE_BELTS = { middle: 30, depth: 30, roundsPerMinute: 600 } as const

/**
 * A preparatory bombardment of the enemy front line: heavy howitzers to smash the trench, field guns to keep the
 * defenders down and to cut lanes through the wire in front of it, for two minutes. Real bombardments lasted days; this
 * is the last, most intense stretch.
 */
export function bombardEnemyLine(sim: Simulation, side: Side): void {
  const front = lines(sim, side)
  if (!front) {
    return
  }
  const depth = Math.abs(front.enemy.rear - front.enemy.forward)
  const target = {
    side,
    fromX: 0,
    toX: mapWidth(sim.map),
    z: front.enemyMiddle,
    band: depth + 20,
    delay: 5,
    duration: 120
  }
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: { ...target, shell: Shell.HeavyHighExplosive, roundsPerMinute: 30 }
  })
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: { ...target, shell: Shell.FieldHighExplosive, roundsPerMinute: 120 }
  })
  // Field guns sweep the wire belts in front of the trench to cut lanes for the infantry.
  const towardUs = Math.sign(front.own.forward - front.enemy.forward)
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: {
      ...target,
      z: front.enemy.forward + towardUs * WIRE_BELTS.middle,
      band: WIRE_BELTS.depth,
      shell: Shell.FieldHighExplosive,
      roundsPerMinute: WIRE_BELTS.roundsPerMinute
    }
  })
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
