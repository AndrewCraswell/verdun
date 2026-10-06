import {
  type BattlefieldMap,
  beltLayout,
  type FenceLength,
  heightAt,
  mapDepth,
  mapWidth,
  type WireTangle
} from "@verdun/map"
import { addComponent, type EntityId, hasComponent } from "bitecs"
import { Stance } from "./components.ts"
import type { Simulation } from "./simulation.ts"
import { climbLimit } from "./terrain.ts"
import { wireAt } from "./wire.ts"

/** A belt's fence must stand within this far ahead of him, in metres, for him to climb it. */
const REACH = 2
/** He climbs a belt no deeper than this, in metres, in one go: deeper wire is crossed as wire is. */
const SPAN = 5
/** The way ahead is looked along in steps this long, in metres. */
const STEP = 0.25
/** Wire this thin or thinner, cut or trampled, is no obstacle (as for walking: wire.ts). */
const CLEAR = 0.15
/**
 * Wire denser than this anywhere on the way over and the bots won't climb it: a belt the guns haven't broken up is a
 * thicket of stakes, strands and coils several metres deep, and only after a bombardment has torn it does it become
 * wreckage a squad can get over. Below it they climb; above it they wade, or find a gap. A player's man climbs a fence
 * however whole it stands: the action key always gets him over.
 */
const INTACT = 0.6
/** He comes down this far past the wire, in metres. */
const LANDING = 0.6
/** A tangle of loose coils this near his way over, in metres, snares him: only the staked fence can be climbed. */
const TANGLE_REACH = 1.4
/** A trench wall must rise within this far ahead of him, in metres, for him to vault it. */
const WALL_REACH = 1.5
/** He gets over a wall no wider than this from its foot to the top, in metres: a fire step and parapet, not a cliff. */
const WALL_SPAN = 3.5
/** The top must be at least this much higher than where he stands, in metres: below that it's a step, walked up. */
const WALL_RISE = 0.8
/** Metres a second he makes on his way over: through the loose wire either side of a fence, or up a trench wall. */
const VAULT_PACE = 1.2
/**
 * The fence itself takes this long to get over, in seconds: both hands on the top wire and over in a bound, as the
 * soldiers' vault (Mixamo's) takes it. A man astride it is a mark for every rifle in reach while he is.
 */
export const FENCE_CLIMB_SECONDS = 1.25
/** He's climbing the fence while within this far of its line either side, in metres: a stride before, a stride after. */
export const FENCE_REACH = 0.6
/** The breath a climb costs him at once, of 100. */
const VAULT_BREATH = 12

const tanglesByMap = new WeakMap<BattlefieldMap, readonly WireTangle[]>()
const fencesByMap = new WeakMap<BattlefieldMap, readonly FenceLength[]>()

/** Every length of staked fence on the map's belts, as the art draws them. */
function fencesOf(map: BattlefieldMap): readonly FenceLength[] {
  let fences = fencesByMap.get(map)
  if (!fences) {
    fences = map.wire.flatMap((belt) => beltLayout(belt).fences)
    fencesByMap.set(map, fences)
  }
  return fences
}

/**
 * Whether a point lies astride a staked fence: within `FENCE_REACH` of a length's line, along its length, where the
 * wire still stands (cut or trampled, there's no fence left to climb).
 */
export function astrideFence(sim: Simulation, x: number, z: number): boolean {
  if (wireAt(sim.wire, x, z) <= CLEAR) {
    return false
  }
  return fencesOf(sim.map).some((fence) => {
    const ox = x - fence.x
    const oz = z - fence.z
    const along = ox * fence.dx + oz * fence.dz
    const across = ox * fence.dz - oz * fence.dx
    return Math.abs(along) <= fence.length / 2 && Math.abs(across) <= FENCE_REACH
  })
}

/** How fast a man climbing makes his way from (x, z), in metres a second: slowly over the fence itself. */
export function vaultPace(sim: Simulation, x: number, z: number): number {
  return astrideFence(sim, x, z) ? (FENCE_REACH * 2) / FENCE_CLIMB_SECONDS : VAULT_PACE
}

/** Every tangle of loose coils on the map's belts, as the art draws them. */
function tanglesOf(map: BattlefieldMap): readonly WireTangle[] {
  let tangles = tanglesByMap.get(map)
  if (!tangles) {
    tangles = map.wire.flatMap((belt) => beltLayout(belt).tangles)
    tanglesByMap.set(map, tangles)
  }
  return tangles
}

/** Squared distance from a point to a segment. */
function distanceSquaredToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz || 1)))
  const x = ax + t * dx - px
  const z = az + t * dz - pz
  return x * x + z * z
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
 * Where a soldier would come down vaulting what's ahead of him, the way he's going: a belt of wire, over its staked
 * fence, where the fence stands within reach, the belt is shallow enough to climb in one go and no tangle of loose
 * coils lies in his way; or else a trench wall, onto its top. Null where there's nothing he can vault. A man on an
 * order goes the way his route takes him, given as `toward` (a unit vector), rather than the way he faces. A bot won't
 * climb a belt still more than `INTACT`, nor through a tangle. A player's man (`player`) always gets over the fence,
 * however whole the belt and whatever coils lie by it; a belt too deep to clear in one go he climbs `SPAN` metres into,
 * and on from there with another go.
 */
export function vaultLanding(
  sim: Simulation,
  soldier: EntityId,
  toward?: { readonly x: number; readonly z: number },
  player = false
): { x: number; z: number } | null {
  const heading = toward ?? headingOf(sim, soldier)
  if (!heading) {
    return null
  }
  const x = sim.soldiers.position.x[soldier]
  const z = sim.soldiers.position.z[soldier]
  const at = (distance: number) => ({ x: x + heading.x * distance, z: z + heading.z * distance })
  let entry = -1
  for (let distance = 0; distance <= REACH; distance += STEP) {
    const point = at(distance)
    if (wireAt(sim.wire, point.x, point.z) > CLEAR) {
      entry = distance
      break
    }
  }
  if (entry < 0) {
    return wallLanding(sim, x, z, heading)
  }
  let exit = -1
  let thickest = 0
  for (let distance = entry + STEP; distance <= entry + SPAN; distance += STEP) {
    const point = at(distance)
    const density = wireAt(sim.wire, point.x, point.z)
    if (density <= CLEAR) {
      exit = distance
      break
    }
    thickest = Math.max(thickest, density)
  }
  if (player) {
    const landing = exit < 0 ? at(entry + SPAN) : at(exit + LANDING)
    return onMap(sim, landing) ? landing : null
  }
  if (exit < 0 || thickest > INTACT) {
    return null
  }
  const from = at(entry)
  const to = at(exit)
  const snared = tanglesOf(sim.map).some(
    (tangle) => distanceSquaredToSegment(tangle.x, tangle.z, from.x, from.z, to.x, to.z) < TANGLE_REACH * TANGLE_REACH
  )
  const landing = at(exit + LANDING)
  return snared || !onMap(sim, landing) ? null : landing
}

/** Whether a soldier is on his way over a fence or wall: he goes straight over, whatever the steering. */
export function isVaulting(sim: Simulation, soldier: EntityId): boolean {
  return hasComponent(sim.world, soldier, sim.soldiers.vault)
}

/**
 * Sets a soldier climbing the fence or wall ahead of him, if there's one he can climb, the way he's going (`toward`, as
 * for `vaultLanding`; `player` for a player's man). Whether he does.
 */
export function startVault(
  sim: Simulation,
  soldier: EntityId,
  toward?: { readonly x: number; readonly z: number },
  player = false
): boolean {
  const { vault, stamina, stance } = sim.soldiers
  if (hasComponent(sim.world, soldier, vault) || stamina.spent[soldier] === 1) {
    return false
  }
  const landing = vaultLanding(sim, soldier, toward, player)
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
