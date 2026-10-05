import {
  type EntityId,
  isAlive,
  isSheltering,
  type LineOfSight,
  seesThroughSmoke,
  sightReach,
  type Simulation,
  soldierEye,
  soldierIds,
  type Squad,
  type WorldPoint
} from "@verdun/sim"
import { createFogGrid, type FogGrid, startViewshed, type ViewshedJob } from "./viewshed.ts"

/** However dark it is, the viewer sees the ground this far around, in metres: his own trench bay. */
const MIN_GROUND_RANGE = 30

/**
 * What the player's squad can see, worked out from the simulation: which ground the controlled soldier can see, cell by
 * cell, and which enemies any living member has a clear sight line to. Plain code with no drawing in it, so it runs in
 * the simulation's worker beside the simulation, or on the page when the simulation does.
 */
export interface SightModel {
  /** The ground: 255 where the viewer can see, 0 where not. */
  readonly grid: FogGrid
  /** Enemy soldiers in sight, as of the last look finished. */
  readonly visibleEnemies: ReadonlySet<EntityId>
  /** Whether a look is under way. */
  readonly looking: boolean
  /** Starts a fresh look round, from where the squad is now. */
  begin(): void
  /**
   * Does a share of the look under way: `1 / shares` of the ground's rays and of the enemies. Returns whether the look
   * finished, or any enemy came into or went out of sight.
   */
  advance(shares: number): { finished: boolean; groundDone: boolean; changed: boolean }
}

export function createSightModel(sim: Simulation, lineOfSight: LineOfSight, squad: Squad, range: number): SightModel {
  const grid = createFogGrid(sim.map)
  const visibleEnemies = new Set<EntityId>()
  // The look under way, spread over calls, or null between them.
  let cycle: {
    job: ViewshedJob | null
    spotters: WorldPoint[]
    enemies: readonly EntityId[]
    next: number
  } | null = null
  // The ground was cleared at the start of a look, with no one to see it: it's done, and new.
  let groundCleared = false

  function spotted(soldier: EntityId, spotters: readonly WorldPoint[]): boolean {
    // As the simulation decides sight: by the light on him, a flare overhead or his muzzle flash, through the weather.
    const head = soldierEye(sim, soldier)
    const reach = Math.min(range, sightReach(sim, soldier))
    return spotters.some(
      (eye) =>
        (head.x - eye.x) ** 2 + (head.z - eye.z) ** 2 <= reach * reach &&
        lineOfSight.isClear(eye, head) &&
        seesThroughSmoke(sim, eye, head)
    )
  }

  return {
    grid,
    visibleEnemies,
    get looking() {
      return cycle !== null
    },
    begin() {
      const viewer = squad.leader
      let job: ViewshedJob | null = null
      if (viewer < 0) {
        grid.values.fill(0)
        groundCleared = true
      } else {
        // The ground shows as far as the light and weather let the viewer see, but never under a few tens of metres.
        const seen = Math.min(range, Math.max(MIN_GROUND_RANGE, sim.environment.sightRange))
        job = startViewshed(sim.map, soldierEye(sim, viewer), seen, grid)
      }
      const spotters = squad.members.filter((member) => isAlive(sim, member)).map((member) => soldierEye(sim, member))
      // Men down a dugout can't be seen.
      const enemies =
        viewer < 0
          ? []
          : soldierIds(sim).filter(
              (soldier) => sim.soldiers.side.value[soldier] !== squad.side && !isSheltering(sim, soldier)
            )
      cycle = { job, spotters, enemies, next: 0 }
    },
    advance(shares) {
      if (!cycle) {
        return { finished: false, groundDone: false, changed: false }
      }
      let changed = false
      let groundDone = groundCleared
      groundCleared = false
      if (cycle.job?.advance(Math.ceil(cycle.job.rays / shares))) {
        cycle.job = null
        groundDone = true
      }
      const until = Math.min(cycle.enemies.length, cycle.next + Math.ceil(cycle.enemies.length / shares))
      for (; cycle.next < until; cycle.next++) {
        const soldier = cycle.enemies[cycle.next] ?? -1
        if (spotted(soldier, cycle.spotters)) {
          changed = !visibleEnemies.has(soldier) || changed
          visibleEnemies.add(soldier)
        } else {
          changed = visibleEnemies.delete(soldier) || changed
        }
      }
      if (cycle.job === null && cycle.next >= cycle.enemies.length) {
        // Whoever wasn't looked at this time round has fallen, been taken or gone down a dugout.
        const looked = new Set(cycle.enemies)
        for (const soldier of visibleEnemies) {
          if (!looked.has(soldier)) {
            visibleEnemies.delete(soldier)
            changed = true
          }
        }
        cycle = null
        return { finished: true, groundDone, changed }
      }
      return { finished: false, groundDone, changed }
    }
  }
}
