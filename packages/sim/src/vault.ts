import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"
import { addComponent, type EntityId, hasComponent } from "bitecs"
import { BODY_RADIUS, type Climbed, climbedAhead, climbedShapes, climbedUnder, insideScenery } from "./body.ts"
import { Stance } from "./components.ts"
import type { Simulation } from "./simulation.ts"
import { climbLimit } from "./terrain.ts"

/**
 * Climbing over what's in a man's way: a wooden fence, a low wall, a trench wall, with Space or, for a bot, when his
 * route runs into one. Never barbed wire: a belt is waded, cut through or gone round by its gaps, however the guns have
 * left it.
 */

/** A fence or low wall must stand within this far of his edge, the way he's going, in metres, for him to climb it. */
const CLIMB_REACH = 1
/** The way ahead is looked along in steps this long, in metres. */
const STEP = 0.25
/** He comes down this far past a trench wall's top, in metres. */
const LANDING = 0.6
/** A trench wall must rise within this far ahead of him, in metres, for him to vault it. */
const WALL_REACH = 1.5
/** He gets over a wall no wider than this from its foot to the top, in metres: a fire step and parapet, not a cliff. */
const WALL_SPAN = 3.5
/** The top must be at least this much higher than where he stands, in metres: below that it's a step, walked up. */
const WALL_RISE = 0.8
/** The far side of a fence or low wall may stand this much higher than his side, or this much lower, in metres. */
const OVER_RISE = 1
const OVER_DROP = 1.5
/** Metres a second he makes on his way over a trench wall, and on to a fence. */
const VAULT_PACE = 1.2
/**
 * A fence or low wall takes this long to get over from where it stops him, in seconds: both hands on the top rail and
 * over in a bound, as the soldiers' climbs take it (scripts/retarget-animations.py). A man astride it is a mark for every rifle in reach while
 * he is.
 */
export const FENCE_CLIMB_SECONDS = 1.25
/**
 * He's climbing a fence or low wall while within this far of its faces, in metres: from where it stops him (his
 * half-width off it) to as far past it.
 */
export const FENCE_REACH = 0.35
/** He comes down this much further from its far face, in metres, so he's off it as he lands... */
const CLEAR_OF_FENCE = 0.05
/** ...or up to this much further still, in metres, to find room. */
const LANDING_LEEWAY = 0.5
/** The breath a climb costs him at once, of 100. */
const VAULT_BREATH = 12

const fencesByMap = new WeakMap<BattlefieldMap, readonly { readonly item: number; readonly rails: Climbed }[]>()

/** The map's wooden fences, by their index in its scenery, and their rails. */
function fencesOf(map: BattlefieldMap): readonly { readonly item: number; readonly rails: Climbed }[] {
  let fences = fencesByMap.get(map)
  if (!fences) {
    fences = map.scenery.flatMap((scenery, item) =>
      scenery.kind === "wooden-fence" ? climbedShapes(scenery).map((rails) => ({ item, rails })) : []
    )
    fencesByMap.set(map, fences)
  }
  return fences
}

/**
 * Flattens the wooden fences whose rails a shell bursting at (x, z) reaches within `radius` metres, as it cuts the wire
 * there (and only where it cuts wire: barrages fired to leave the wire for the attack leave the fences too). Men walk
 * over a flattened fence from then on.
 */
export function flattenFences(sim: Simulation, x: number, z: number, radius: number): void {
  for (const { item, rails } of fencesOf(sim.map)) {
    if (sim.fencesDown.includes(item)) {
      continue
    }
    const dx = x - rails.x
    const dz = z - rails.z
    const along = Math.max(-rails.halfLength, Math.min(rails.halfLength, dx * rails.lineX + dz * rails.lineZ))
    const ox = dx - along * rails.lineX
    const oz = dz - along * rails.lineZ
    if (ox * ox + oz * oz <= radius * radius) {
      sim.fencesDown.push(item)
    }
  }
}

/** Whether a point lies astride a wooden fence or a low wall: within `FENCE_REACH` of its faces, along its length. */
export function astrideFence(sim: Simulation, x: number, z: number): boolean {
  return climbedUnder(sim.map, x, z, FENCE_REACH, sim.fencesDown) !== null
}

/** The way straight across the fence or low wall a point lies astride, a unit vector, or null where there's none. */
export function acrossFence(sim: Simulation, x: number, z: number): { x: number; z: number } | null {
  const climbed = climbedUnder(sim.map, x, z, FENCE_REACH, sim.fencesDown)
  return climbed && { x: climbed.lineZ, z: -climbed.lineX }
}

/**
 * How fast a man climbing makes his way from (x, z), in metres a second: over a fence or low wall at the pace that
 * takes him across it, from `FENCE_REACH` short of it to where he comes down, in `FENCE_CLIMB_SECONDS`.
 */
export function vaultPace(sim: Simulation, x: number, z: number): number {
  const climbed = climbedUnder(sim.map, x, z, FENCE_REACH, sim.fencesDown)
  return climbed ? (2 * (FENCE_REACH + climbed.halfDepth) + CLEAR_OF_FENCE) / FENCE_CLIMB_SECONDS : VAULT_PACE
}

/** The way a soldier means to go: where he's steered, or else where he faces. A unit vector, or null. */
function headingOf(sim: Simulation, soldier: EntityId): { x: number; z: number } | null {
  const { steer, facing } = sim.soldiers
  const steered = hasComponent(sim.world, soldier, steer)
  const x = steered ? steer.x[soldier] : facing.x[soldier]
  const z = steered ? steer.z[soldier] : facing.z[soldier]
  const length = Math.sqrt(x * x + z * z)
  return length > 0 ? { x: x / length, z: z / length } : null
}

/** A point on the map: inside its edges. */
function onMap(sim: Simulation, point: { x: number; z: number }): boolean {
  return point.x >= 0 && point.z >= 0 && point.x <= mapWidth(sim.map) && point.z <= mapDepth(sim.map)
}

/**
 * Where a soldier would come down climbing the fence or low wall ahead of him: standing within reach the way he's
 * going, crossed squarely enough, with clear and near-level ground past it. Null where there's none to climb.
 */
function fenceLanding(
  sim: Simulation,
  x: number,
  z: number,
  heading: { x: number; z: number }
): { x: number; z: number } | null {
  const ahead = climbedAhead(sim.map, x, z, heading.x, heading.z, CLIMB_REACH, sim.fencesDown)
  if (!ahead) {
    return null
  }
  // He comes down just off it, past `FENCE_REACH` from its far face however slantwise he crosses, where `vaultPace`
  // brings him down.
  const { climbed } = ahead
  const square = Math.abs(heading.x * climbed.lineZ - heading.z * climbed.lineX)
  const past = ahead.exit + (FENCE_REACH + CLEAR_OF_FENCE - BODY_RADIUS) / square
  // Or a little further on, where the end of the next fence along leaves him no room.
  for (let further = 0; further <= LANDING_LEEWAY; further += STEP) {
    const landing = { x: x + heading.x * (past + further), z: z + heading.z * (past + further) }
    const rise = heightAt(sim.map, landing.x, landing.z) - heightAt(sim.map, x, z)
    if (rise > OVER_RISE || rise < -OVER_DROP || !onMap(sim, landing)) {
      return null
    }
    if (!insideScenery(sim.map, landing.x, landing.z, sim.fencesDown)) {
      return landing
    }
  }
  return null
}

/**
 * Where a soldier would come down vaulting the trench wall ahead of him: the wall rising within reach the way he's
 * going, on its top, where the ground goes on walkable and stands well above him. Null where there's no wall to vault.
 */
function wallLanding(
  sim: Simulation,
  x: number,
  z: number,
  heading: { x: number; z: number }
): { x: number; z: number } | null {
  const at = (distance: number) => ({ x: x + heading.x * distance, z: z + heading.z * distance })
  const steep = (distance: number) => {
    const point = at(distance)
    return Number.isFinite(climbLimit(sim.map, point.x, point.z, heading.x, heading.z))
  }
  let foot = -1
  for (let distance = 0; distance <= WALL_REACH; distance += STEP) {
    if (steep(distance)) {
      foot = distance
      break
    }
  }
  if (foot < 0) {
    return null
  }
  const floor = heightAt(sim.map, x, z)
  for (let distance = foot + STEP; distance <= foot + WALL_SPAN; distance += STEP) {
    const point = at(distance)
    if (!steep(distance) && heightAt(sim.map, point.x, point.z) - floor >= WALL_RISE) {
      const landing = at(distance + LANDING)
      return onMap(sim, landing) ? landing : null
    }
  }
  return null
}

/**
 * Where a soldier would come down climbing what's ahead of him, the way he's going: a wooden fence or low wall, over
 * it; or else a trench wall, onto its top. Null where there's nothing he can climb: barbed wire never is. A man on an
 * order goes the way his route takes him, given as `toward` (a unit vector), rather than the way he faces.
 */
export function vaultLanding(
  sim: Simulation,
  soldier: EntityId,
  toward?: { readonly x: number; readonly z: number }
): { x: number; z: number } | null {
  const heading = toward ?? headingOf(sim, soldier)
  if (!heading) {
    return null
  }
  const x = sim.soldiers.position.x[soldier]
  const z = sim.soldiers.position.z[soldier]
  return fenceLanding(sim, x, z, heading) ?? wallLanding(sim, x, z, heading)
}

/** Whether a fence or low wall a soldier can climb stands in his way along `toward`, a unit vector. */
export function fenceAhead(sim: Simulation, soldier: EntityId, toward: { readonly x: number; readonly z: number }) {
  return fenceLanding(sim, sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier], toward) !== null
}

/** Whether a soldier is on his way over a fence or wall: he goes straight over, whatever the steering. */
export function isVaulting(sim: Simulation, soldier: EntityId): boolean {
  return hasComponent(sim.world, soldier, sim.soldiers.vault)
}

/**
 * Sets a soldier climbing the fence or wall ahead of him, if there's one he can climb, the way he's going (`toward`, as
 * for `vaultLanding`). Whether he does.
 */
export function startVault(
  sim: Simulation,
  soldier: EntityId,
  toward?: { readonly x: number; readonly z: number }
): boolean {
  const { vault, stamina, stance } = sim.soldiers
  if (hasComponent(sim.world, soldier, vault) || stamina.spent[soldier] === 1) {
    return false
  }
  const landing = vaultLanding(sim, soldier, toward)
  if (!landing) {
    return false
  }
  addComponent(sim.world, soldier, vault)
  vault.x[soldier] = landing.x
  vault.z[soldier] = landing.z
  stamina.value[soldier] = Math.max(0, stamina.value[soldier] - VAULT_BREATH)
  stance.value[soldier] = Stance.Standing
  return true
}
