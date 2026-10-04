import type { BattlefieldMap } from "@verdun/map"
import { frontLineSpan } from "./artillery.ts"
import { Side } from "./components.ts"
import { type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"

/**
 * Objectives are checked this often, in seconds (converted where used: this module and simulation.ts import each
 * other, so simulation.ts's constants aren't ready at load time).
 */
const CHECK_SECONDS = 2

/** Who holds a piece of ground worth fighting for. */
export interface ObjectiveState {
  readonly name: string
  readonly x: number
  readonly z: number
  readonly radius: number
  /** The side holding it, or -1 for no one. */
  holder: Side | -1
  /** Whether both sides have men on it now. */
  contested: boolean
}

/** An objective changing hands, for the battle report. */
export interface ObjectiveTakenEvent {
  readonly type: "objective-taken"
  readonly name: string
  readonly side: Side
}

/**
 * Who holds each of the map's objectives at the start: the side behind whose front line it lies, or no one in no man's
 * land.
 */
export function createObjectives(map: BattlefieldMap): ObjectiveState[] {
  const french = frontLineSpan(map.trenches, Side.French)
  const german = frontLineSpan(map.trenches, Side.German)
  return map.objectives.map((objective) => {
    let holder: Side | -1 = -1
    if (french && objective.z <= french.forward) {
      holder = Side.French
    } else if (german && objective.z >= german.forward) {
      holder = Side.German
    }
    return { ...objective, holder, contested: false }
  })
}

/**
 * Takes stock of the objectives every couple of seconds. A side with men on one and the enemy with none takes it; with
 * both there it's contested and stays with whoever held it; left empty, it stays held: ground is lost by being taken,
 * not by being left.
 */
export function objectiveSystem(sim: Simulation): void {
  if (sim.tick % (CHECK_SECONDS * TICK_RATE) !== 0 || sim.objectives.length === 0) {
    return
  }
  const living = soldierIds(sim)
  for (const objective of sim.objectives) {
    let french = 0
    let german = 0
    for (const soldier of living) {
      const dx = sim.soldiers.position.x[soldier] - objective.x
      const dz = sim.soldiers.position.z[soldier] - objective.z
      if (dx * dx + dz * dz <= objective.radius * objective.radius) {
        if (sim.soldiers.side.value[soldier] === Side.German) {
          german++
        } else {
          french++
        }
      }
    }
    objective.contested = french > 0 && german > 0
    let taker: Side | -1 = -1
    if (french > 0 && german === 0) {
      taker = Side.French
    } else if (german > 0 && french === 0) {
      taker = Side.German
    }
    if (taker !== -1 && taker !== objective.holder) {
      objective.holder = taker
      sim.events.push({ type: "objective-taken", name: objective.name, side: taker })
    }
  }
}

/** How much of the sector each side holds, as a share of its objectives. */
export function sectorControl(sim: Simulation): Record<Side, number> {
  const count = Math.max(1, sim.objectives.length)
  return {
    [Side.French]: sim.objectives.filter((objective) => objective.holder === Side.French).length / count,
    [Side.German]: sim.objectives.filter((objective) => objective.holder === Side.German).length / count
  }
}
