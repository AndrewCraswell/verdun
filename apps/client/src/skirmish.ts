import { pointsAlong, type Trench } from "@verdun/map"
import { type EntityId, Side, type Simulation, spawnSoldier } from "@verdun/sim"

export interface Skirmish {
  readonly french: readonly EntityId[]
  readonly german: readonly EntityId[]
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

/** Placeholder scenario until bots land: both sides man their front-line fire trench, facing each other. */
export function setupSkirmish(sim: Simulation, soldiersPerSide = 200): Skirmish {
  return {
    french: manTrench(sim, frontLine(sim.map.trenches, "north"), Side.French, soldiersPerSide),
    german: manTrench(sim, frontLine(sim.map.trenches, "south"), Side.German, soldiersPerSide)
  }
}
