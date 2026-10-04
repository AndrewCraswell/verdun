import { mapWidth, pointsAlong, type Trench, TRENCH_PROFILE } from "@verdun/map"
import {
  createSquad,
  enqueueCommand,
  type EntityId,
  frontLineZ,
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
}

/** The front-line fire trench for a side: the one facing the enemy that sits closest to no man's land. */
function frontLine(trenches: readonly Trench[], facing: "north" | "south"): Trench {
  const fire = trenches.filter((trench) => trench.kind === "fire" && trench.facing === facing)
  const forwardZ = (trench: Trench) => trench.points[0]?.[1] ?? 0
  const [front] = fire.sort((a, b) => (facing === "north" ? forwardZ(b) - forwardZ(a) : forwardZ(a) - forwardZ(b)))
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
 * ground and firing at whatever they can see. The player commands the squad in the middle of the French line.
 */
export function setupSkirmish(sim: Simulation, soldiersPerSide = 200): Skirmish {
  const squadsPerSide = Math.ceil(soldiersPerSide / SQUAD_SIZE)
  const frenchSquads = manTrench(
    sim,
    frontLine(sim.map.trenches, "north"),
    Side.French,
    soldiersPerSide,
    Math.floor(squadsPerSide / 2)
  )
  const germanSquads = manTrench(sim, frontLine(sim.map.trenches, "south"), Side.German, soldiersPerSide)
  const playerSquad = frenchSquads.find((squad) => squad.controller === "player")
  if (!playerSquad) {
    throw new Error("The French line has no squads to command")
  }
  return {
    french: frenchSquads.flatMap((squad) => squad.members),
    german: germanSquads.flatMap((squad) => squad.members),
    playerSquad
  }
}

/**
 * Creeping barrage timing, after French practice at Verdun in late 1916: the barrage opens just beyond the wire as the
 * infantry go over, then lifts 50 m every 90 s; the infantry keep about 60 m behind it.
 */
export const CREEPING_BARRAGE = {
  openAhead: 40,
  lift: 50,
  interval: 90,
  standoff: 60,
  // About one field gun per 15-20 m of front, firing 3-4 rounds a minute.
  roundsPerMinute: 150
} as const

function lines(sim: Simulation, side: Side): { own: number; enemy: number } | null {
  const own = frontLineZ(sim.map.trenches, side)
  const enemy = frontLineZ(sim.map.trenches, side === Side.French ? Side.German : Side.French)
  return own === null || enemy === null ? null : { own, enemy }
}

/** The whistle: the whole side goes over the top behind a creeping barrage, which opens at once. */
export function attackBehindBarrage(sim: Simulation, side: Side): void {
  const front = lines(sim, side)
  if (!front) {
    return
  }
  const direction = Math.sign(front.enemy - front.own)
  enqueueCommand(sim, {
    type: "barrage-attack",
    side,
    fromX: 0,
    toX: mapWidth(sim.map),
    startZ: front.own + direction * CREEPING_BARRAGE.openAhead,
    objectiveZ: front.enemy,
    roundsPerMinute: CREEPING_BARRAGE.roundsPerMinute,
    lift: CREEPING_BARRAGE.lift,
    interval: CREEPING_BARRAGE.interval,
    standoff: CREEPING_BARRAGE.standoff,
    delay: 0
  })
}

/**
 * A preparatory bombardment of the enemy front line: heavy howitzers to smash the trench and field guns to keep the
 * defenders down, for two minutes. Real bombardments lasted days; this is the last, most intense stretch.
 */
export function bombardEnemyLine(sim: Simulation, side: Side): void {
  const front = lines(sim, side)
  if (!front) {
    return
  }
  const target = { side, fromX: 0, toX: mapWidth(sim.map), z: front.enemy, band: 20, delay: 5, duration: 120 }
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: { ...target, shell: Shell.HeavyHighExplosive, roundsPerMinute: 30 }
  })
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: { ...target, shell: Shell.FieldHighExplosive, roundsPerMinute: 120 }
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
