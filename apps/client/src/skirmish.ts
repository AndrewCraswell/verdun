import { pointsAlong, type Trench } from "@verdun/map"
import { createSquad, type EntityId, Side, type Simulation, type Squad, spawnSoldier } from "@verdun/sim"

/** Soldiers per squad: the player commands one squad. */
export const SQUAD_SIZE = 8

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

function manTrench(sim: Simulation, trench: Trench, side: Side, count: number): EntityId[] {
  const length = trench.points.slice(1).reduce((total, b, index) => {
    const a = trench.points[index]
    return total + Math.hypot(b[0] - a[0], b[1] - a[1])
  }, 0)
  return pointsAlong(trench, length / count)
    .slice(0, count)
    .map(([x, z]) => spawnSoldier(sim, { side, x, z }))
}

/** Splits a line of soldiers into squads of neighbours. */
function formSquads(sim: Simulation, side: Side, soldiers: readonly EntityId[]): Squad[] {
  const squads: Squad[] = []
  for (let start = 0; start < soldiers.length; start += SQUAD_SIZE) {
    squads.push(createSquad(sim, side, soldiers.slice(start, start + SQUAD_SIZE)))
  }
  return squads
}

/**
 * Placeholder scenario until bots land: both sides man their front-line fire trench, facing each other, in squads of
 * eight holding their ground.
 */
export function setupSkirmish(sim: Simulation, soldiersPerSide = 200): Skirmish {
  const french = manTrench(sim, frontLine(sim.map.trenches, "north"), Side.French, soldiersPerSide)
  const german = manTrench(sim, frontLine(sim.map.trenches, "south"), Side.German, soldiersPerSide)
  const frenchSquads = formSquads(sim, Side.French, french)
  formSquads(sim, Side.German, german)
  const playerSquad = frenchSquads[Math.floor(frenchSquads.length / 2)]
  if (!playerSquad) {
    throw new Error("The French line has no squads to command")
  }
  return { french, german, playerSquad }
}
