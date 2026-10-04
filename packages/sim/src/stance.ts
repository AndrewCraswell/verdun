import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"
import { type EntityId, hasComponent } from "bitecs"
import { PINNED } from "./combat.ts"
import { Stance } from "./components.ts"
import { EYE_HEIGHT, type WorldPoint } from "./line-of-sight.ts"
import { type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"

/** Eye height of a soldier lying prone, in metres: head up enough to see and shoot. */
export const PRONE_EYE_HEIGHT = 0.45
/** Walking speed while prone: crawling. */
export const CRAWL_FACTOR = 0.25
/** Soldiers within this distance of a trench's centre line are in it: on the floor or the fire step. */
const IN_TRENCH_RADIUS = 1.3
/** Stances are reconsidered this often, in steps. */
const STANCE_INTERVAL = 5
/**
 * Seconds without a shell bursting close by before men in a dugout start back up. Long enough that a barrage's lulls
 * don't fool them; short enough that a lifting barrage starts the race to the parapet.
 */
export const SHELTER_CALM = 15
/** Seconds to climb out of a deep dugout with rifles and machine guns and get onto the fire step: 6 to 20. */
const CLIMB_SECONDS = { min: 6, spread: 14 } as const
/** A sentry's shout: attackers this close bring the men up at once, if the shelling lets them. */
const ALARM_RANGE = 40
/** Even with the enemy close, nobody climbs out while shells are still landing this recently, in seconds. */
const ALARM_CALM = 3

const trenchGrids = new WeakMap<BattlefieldMap, Uint8Array>()

/** A 1 m grid over the map marking cells inside a trench, built once per map: trenches don't move. */
function trenchGrid(map: BattlefieldMap): Uint8Array {
  const cached = trenchGrids.get(map)
  if (cached) {
    return cached
  }
  const columns = Math.ceil(mapWidth(map)) + 1
  const rows = Math.ceil(mapDepth(map)) + 1
  const grid = new Uint8Array(columns * rows)
  for (const trench of map.trenches) {
    for (let index = 1; index < trench.points.length; index++) {
      const [ax, az] = trench.points[index - 1] ?? [0, 0]
      const [bx, bz] = trench.points[index] ?? [0, 0]
      const minX = Math.max(0, Math.floor(Math.min(ax, bx) - IN_TRENCH_RADIUS))
      const maxX = Math.min(columns - 1, Math.ceil(Math.max(ax, bx) + IN_TRENCH_RADIUS))
      const minZ = Math.max(0, Math.floor(Math.min(az, bz) - IN_TRENCH_RADIUS))
      const maxZ = Math.min(rows - 1, Math.ceil(Math.max(az, bz) + IN_TRENCH_RADIUS))
      const dx = bx - ax
      const dz = bz - az
      const lengthSquared = dx * dx + dz * dz || 1
      for (let row = minZ; row <= maxZ; row++) {
        for (let column = minX; column <= maxX; column++) {
          // Cell centres, so a cell counts when the middle of it is in the trench.
          const px = column + 0.5
          const pz = row + 0.5
          const along = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / lengthSquared))
          const ox = ax + along * dx - px
          const oz = az + along * dz - pz
          if (ox * ox + oz * oz <= IN_TRENCH_RADIUS * IN_TRENCH_RADIUS) {
            grid[row * columns + column] = 1
          }
        }
      }
    }
  }
  trenchGrids.set(map, grid)
  return grid
}

/** Whether a ground point is inside a trench. */
export function isInTrench(map: BattlefieldMap, x: number, z: number): boolean {
  const columns = Math.ceil(mapWidth(map)) + 1
  const column = Math.floor(x)
  const row = Math.floor(z)
  if (column < 0 || row < 0 || column >= columns || row > Math.ceil(mapDepth(map))) {
    return false
  }
  return trenchGrid(map)[row * columns + column] === 1
}

/** A soldier's eye, at the height their stance puts it. */
export function soldierEye(sim: Simulation, soldier: EntityId): WorldPoint {
  const x = sim.soldiers.position.x[soldier]
  const z = sim.soldiers.position.z[soldier]
  const height = sim.soldiers.stance.value[soldier] === Stance.Prone ? PRONE_EYE_HEIGHT : EYE_HEIGHT
  return { x, y: heightAt(sim.map, x, z) + height, z }
}

export function isSheltering(sim: Simulation, soldier: EntityId): boolean {
  return sim.soldiers.stance.value[soldier] === Stance.Sheltering
}

/** Marks soldiers near a shell burst as shelled: men in a trench go down their dugout. */
export function markShelled(sim: Simulation, soldier: EntityId): void {
  sim.soldiers.shelter.lastShelled[soldier] = sim.tick
  // A shell landing while they climb sends them back down, unless they've been ordered out.
  if (!hasComponent(sim.world, soldier, sim.soldiers.moveOrder)) {
    sim.soldiers.shelter.emergeAt[soldier] = -1
  }
}

/**
 * Whether a soldier's stance is decided by their squad. The soldier a player controls decides for themselves, and a
 * soldier with no squad keeps whatever stance they're given.
 */
function squadDecides(sim: Simulation, soldier: EntityId): boolean {
  const squad = sim.squads[sim.soldiers.squad.id[soldier]]
  return squad !== undefined && !(squad.controller === "player" && squad.leader === soldier)
}

/** A squad's sentry stays on the fire step through a bombardment, watching for the attack: its leader. */
function isSentry(sim: Simulation, soldier: EntityId): boolean {
  const squad = sim.squads[sim.soldiers.squad.id[soldier]]
  return squad?.controller === "ai" && squad.leader === soldier
}

function enemyWithin(sim: Simulation, soldier: EntityId, range: number, living: readonly EntityId[]): boolean {
  const { position, side } = sim.soldiers
  return living.some(
    (other) =>
      side.value[other] !== side.value[soldier] &&
      (position.x[other] - position.x[soldier]) ** 2 + (position.z[other] - position.z[soldier]) ** 2 <= range * range
  )
}

/** Seconds a soldier takes to climb out of a dugout: spread across soldiers so they come up in ones and twos. */
function climbSteps(soldier: EntityId): number {
  // A fixed spread by id keeps the simulation deterministic without drawing on the RNG.
  const spread = ((soldier * 2654435761) >>> 0) / 2 ** 32
  return Math.round((CLIMB_SECONDS.min + spread * CLIMB_SECONDS.spread) * TICK_RATE)
}

/**
 * How everyone not under a player's hand holds themselves, a few times a second:
 *
 * - In a trench under shellfire, everyone but the sentries goes down the dugouts. Once the shelling has stopped
 *   for a while, or a sentry sees attackers close and the shells have just lifted, they climb back up to the fire
 *   step. That climb against the attackers' last rush is the race to the parapet.
 * - In the open, soldiers lie down whenever they stop or are pinned, and get up to move.
 */
export function stanceSystem(sim: Simulation): void {
  if (sim.tick % STANCE_INTERVAL !== 0) {
    return
  }
  const { stance, shelter, position, suppression, moveOrder } = sim.soldiers
  const living = Array.from(soldierIds(sim))
  for (const soldier of living) {
    if (!squadDecides(sim, soldier)) {
      if (stance.value[soldier] === Stance.Sheltering) {
        stance.value[soldier] = Stance.Standing
      }
      continue
    }
    const sinceShelled = (sim.tick - shelter.lastShelled[soldier]) / TICK_RATE
    const moving = hasComponent(sim.world, soldier, moveOrder) || hasComponent(sim.world, soldier, sim.soldiers.steer)
    if (stance.value[soldier] === Stance.Sheltering) {
      if (shelter.emergeAt[soldier] < 0) {
        const calm = sinceShelled >= SHELTER_CALM
        const alarm = sinceShelled >= ALARM_CALM && enemyWithin(sim, soldier, ALARM_RANGE, living)
        // An order to move, such as going over the top, gets them up the steps whatever is falling.
        if (calm || alarm || moving) {
          shelter.emergeAt[soldier] = sim.tick + climbSteps(soldier)
        }
      } else if (sim.tick >= shelter.emergeAt[soldier]) {
        stance.value[soldier] = Stance.Standing
        shelter.emergeAt[soldier] = -1
      }
      continue
    }
    if (isInTrench(sim.map, position.x[soldier], position.z[soldier])) {
      // Stances run before artillery each step, so a burst can be up to a whole interval old by now.
      const justShelled = sim.tick - shelter.lastShelled[soldier] <= STANCE_INTERVAL
      stance.value[soldier] = justShelled && !moving && !isSentry(sim, soldier) ? Stance.Sheltering : Stance.Standing
      continue
    }
    stance.value[soldier] = !moving || suppression.value[soldier] >= PINNED ? Stance.Prone : Stance.Standing
  }
}
