import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"
import { type EntityId, hasComponent } from "bitecs"
import { PINNED, Weapon } from "./combat.ts"
import { Side, Stance } from "./components.ts"
import { EYE_HEIGHT, type WorldPoint } from "./line-of-sight.ts"
import { restsTonight } from "./routine.ts"
import { type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"
import { soldiersNear } from "./spatial.ts"
import { isAlive } from "./squads.ts"

/** Eye height of a soldier lying prone, in metres: head up enough to see and shoot. */
export const PRONE_EYE_HEIGHT = 0.45
/** Walking speed while prone: crawling. */
export const CRAWL_FACTOR = 0.25
/**
 * Eye height of a crouching soldier, in metres. On a fire step it keeps his head below the parapet; standing up there
 * puts his head and shoulders over it, to watch and to shoot.
 */
export const CROUCH_EYE_HEIGHT = 1.1
/** Walking speed while crouching, bent double. */
export const CROUCH_FACTOR = 0.6
/** How far round a soldier the parapet is looked for, in metres: the trench's spoil heaps either side. */
const PARAPET_REACH = [1.5, 2.2, 3] as const
/** Directions round a soldier the parapet is looked for in. */
const PARAPET_BEARINGS = 16
/** Soldiers within this distance of a trench's centre line are in it: on the floor or the fire step. */
const IN_TRENCH_RADIUS = 1.3
/** Stances are reconsidered this often, in steps. */
const STANCE_INTERVAL = 5
/**
 * Seconds without a shell bursting close by before men in a dugout start back up. Long enough that a barrage's lulls
 * don't fool them; short enough that a lifting barrage starts the race to the parapet.
 */
export const SHELTER_CALM = 15
/** Seconds to climb out of a deep dugout and get onto the fire step: 6 to 20. */
const CLIMB_SECONDS = { min: 6, spread: 14 } as const
/**
 * Machine-gun crews were drilled to get their gun up the steps and into action before anyone else: 3 to 8 seconds. It
 * was their guns, not the riflemen's, that so often won the race to the parapet.
 */
const MACHINE_GUN_CLIMB_SECONDS = { min: 3, spread: 5 } as const
/**
 * A sentry's shout: attackers this close bring the men up at once, if the shelling lets them. Sentries watched through
 * periscopes for the rush: far enough out that men running at a dash don't reach the parapet before the garrison does.
 */
const ALARM_RANGE = 50
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

const noMansLandMiddles = new WeakMap<BattlefieldMap, number>()

/**
 * The z halfway between the two sides' fire trenches, each averaged over all its points: the French hold the ground
 * south of it, the Germans north. NaN on a map without both.
 */
function noMansLandMiddle(map: BattlefieldMap): number {
  const cached = noMansLandMiddles.get(map)
  if (cached !== undefined) {
    return cached
  }
  const middle = (facing: "north" | "south") => {
    const zs = map.trenches
      .filter((trench) => trench.kind === "fire" && trench.facing === facing)
      .flatMap((trench) => trench.points.map(([, z]) => z))
    return zs.reduce((sum, z) => sum + z, 0) / zs.length
  }
  const value = (middle("north") + middle("south")) / 2
  noMansLandMiddles.set(map, value)
  return value
}

/**
 * Whether a soldier is in a trench on the enemy's side of no man's land: one his side has broken into. Its dugouts'
 * entrances face the wrong way and the enemy knows where every one is, so he doesn't go down them.
 */
function squadOrder(sim: Simulation, soldier: EntityId): string | undefined {
  return sim.squads[sim.soldiers.squad.id[soldier]]?.order.kind
}

function inEnemyTrench(sim: Simulation, soldier: EntityId): boolean {
  const middle = noMansLandMiddle(sim.map)
  const beyond = sim.soldiers.position.z[soldier] - middle
  return sim.soldiers.side.value[soldier] === Side.German ? beyond < 0 : beyond > 0
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
  return { x, y: heightAt(sim.map, x, z) + eyeHeight(sim.soldiers.stance.value[soldier]), z }
}

/** Eye height above the ground for a stance, in metres. */
export function eyeHeight(stance: number): number {
  if (stance === Stance.Prone) {
    return PRONE_EYE_HEIGHT
  }
  return stance === Stance.Crouching ? CROUCH_EYE_HEIGHT : EYE_HEIGHT
}

/**
 * Whether a soldier in a trench has his head over the parapet: up on the fire step and standing, he sees out, and can
 * be seen. Crouched on the step, or down on the floor, he sees only the trench.
 */
export function seesOverParapet(sim: Simulation, soldier: EntityId): boolean {
  const x = sim.soldiers.position.x[soldier]
  const z = sim.soldiers.position.z[soldier]
  if (!isInTrench(sim.map, x, z)) {
    return false
  }
  const eye = soldierEye(sim, soldier).y
  let highest = -Infinity
  for (let bearing = 0; bearing < PARAPET_BEARINGS; bearing++) {
    const angle = (bearing / PARAPET_BEARINGS) * 2 * Math.PI
    for (const reach of PARAPET_REACH) {
      highest = Math.max(highest, heightAt(sim.map, x + Math.cos(angle) * reach, z + Math.sin(angle) * reach))
    }
  }
  return eye > highest + 0.1
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

/** Whether a soldier's squad is waiting in reserve, its men down the dugouts until they're sent in. */
function inReserve(sim: Simulation, soldier: EntityId): boolean {
  return sim.squads[sim.soldiers.squad.id[soldier]]?.order.kind === "reserve"
}

/** Raiders crawl across no man's land out and home, and get up only for the rush into the enemy's trench. */
function isCrawling(sim: Simulation, soldier: EntityId): boolean {
  const order = sim.squads[sim.soldiers.squad.id[soldier]]?.order
  return order?.kind === "raid" && order.phase !== "in"
}

/** A squad's sentry stays on the fire step through a bombardment, watching for the attack: its leader. */
function isSentry(sim: Simulation, soldier: EntityId): boolean {
  const squad = sim.squads[sim.soldiers.squad.id[soldier]]
  return squad?.controller === "ai" && squad.leader === soldier
}

function enemyWithin(sim: Simulation, soldier: EntityId, range: number): boolean {
  const { position, side } = sim.soldiers
  return soldiersNear(sim, position.x[soldier], position.z[soldier], range).some(
    (other) => side.value[other] !== side.value[soldier] && isAlive(sim, other)
  )
}

/** Seconds a soldier takes to climb out of a dugout: spread across soldiers so they come up in ones and twos. */
function climbSteps(sim: Simulation, soldier: EntityId): number {
  // A fixed spread by id keeps the simulation deterministic without drawing on the RNG.
  const spread = ((soldier * 2654435761) >>> 0) / 2 ** 32
  const climb = sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun ? MACHINE_GUN_CLIMB_SECONDS : CLIMB_SECONDS
  return Math.round((climb.min + spread * climb.spread) * TICK_RATE)
}

/**
 * How everyone not under a player's hand holds themselves, a few times a second:
 *
 * - In a trench under shellfire, everyone but the sentries goes down the dugouts. In a trench taken from the enemy they
 *   crouch below its parapet instead, and stand only to meet him when he comes close. Once the shelling has stopped
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
        // Sleepers come up for stand-to at dawn and dusk, or when the sentry raises the alarm.
        const calm = sinceShelled >= SHELTER_CALM && !inReserve(sim, soldier) && !restsTonight(sim, soldier)
        const alarm = sinceShelled >= ALARM_CALM && enemyWithin(sim, soldier, ALARM_RANGE)
        // An order to move, such as going over the top, gets them up the steps whatever is falling.
        if (calm || alarm || moving) {
          shelter.emergeAt[soldier] = sim.tick + climbSteps(sim, soldier)
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
      const goesDown = justShelled || inReserve(sim, soldier) || restsTonight(sim, soldier)
      if (moving) {
        stance.value[soldier] = Stance.Standing
      } else if (inEnemyTrench(sim, soldier) || squadOrder(sim, soldier) === "dig-in") {
        // In a trench just taken: heads below its parapet, which faces the wrong way, until the enemy comes close.
        const comes = !justShelled && enemyWithin(sim, soldier, ALARM_RANGE)
        stance.value[soldier] = comes ? Stance.Standing : Stance.Crouching
      } else {
        stance.value[soldier] = goesDown && !isSentry(sim, soldier) ? Stance.Sheltering : Stance.Standing
      }
      continue
    }
    if (isCrawling(sim, soldier)) {
      stance.value[soldier] = Stance.Prone
      continue
    }
    stance.value[soldier] = !moving || suppression.value[soldier] >= PINNED ? Stance.Prone : Stance.Standing
  }
}
