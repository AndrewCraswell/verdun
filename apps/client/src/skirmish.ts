import { pointsAlong, type Trench, TRENCH_PROFILE } from "@verdun/map"
import {
  createSquad,
  enqueueCommand,
  type EntityId,
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

/** Where a trench line crosses a given x, or the nearest end of it. */
function trenchZAt(trench: Trench, x: number): number {
  for (let index = 1; index < trench.points.length; index++) {
    const [ax, az] = trench.points[index - 1] ?? [0, 0]
    const [bx, bz] = trench.points[index] ?? [0, 0]
    if (x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && ax !== bx) {
      return az + ((bz - az) * (x - ax)) / (bx - ax)
    }
  }
  const [first] = trench.points
  const last = trench.points.at(-1)
  return Math.abs((first?.[0] ?? 0) - x) < Math.abs((last?.[0] ?? 0) - x) ? (first?.[1] ?? 0) : (last?.[1] ?? 0)
}

/** The whistle: every squad on a side goes over the top toward the enemy front line straight ahead of it. */
export function goOverTheTop(sim: Simulation, side: Side): void {
  const enemyLine = frontLine(sim.map.trenches, side === Side.French ? "south" : "north")
  for (const squad of sim.squads) {
    if (squad.side !== side || squad.leader < 0) {
      continue
    }
    const x = sim.soldiers.position.x[squad.leader]
    enqueueCommand(sim, {
      type: "squad-order",
      squad: squad.id,
      order: { kind: "advance", x, z: trenchZAt(enemyLine, x) }
    })
  }
}
