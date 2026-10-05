import { type BattlefieldMap, beltLayout, mapDepth, mapWidth, type WireTangle } from "@verdun/map"
import { addComponent, type EntityId, hasComponent } from "bitecs"
import { Stance } from "./components.ts"
import type { Simulation } from "./simulation.ts"
import { wireAt } from "./wire.ts"

/** A belt's fence must stand within this far ahead of him, in metres, for him to climb it. */
const REACH = 2
/** He climbs a belt no deeper than this, in metres, in one go: deeper wire is crossed as wire is. */
const SPAN = 5
/** The way ahead is looked along in steps this long, in metres. */
const STEP = 0.25
/** Wire this thin or thinner, cut or trampled, is no obstacle (as for walking: wire.ts). */
const CLEAR = 0.15
/** He comes down this far past the wire, in metres. */
const LANDING = 0.6
/** A tangle of loose coils this near his way over, in metres, snares him: only the staked fence can be climbed. */
const TANGLE_REACH = 1.4
/** Metres a second he makes over a fence: a hand on a stake, a leg over, the wire plucking at his coat. */
export const VAULT_PACE = 1.2
/** The breath a climb costs him at once, of 100. */
const VAULT_BREATH = 12

const tanglesByMap = new WeakMap<BattlefieldMap, readonly WireTangle[]>()

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

/**
 * Where a soldier would come down climbing the belt of wire ahead of him: past its staked fence, where the fence stands
 * within reach the way he's going, the belt is shallow enough to climb in one go, and no tangle of loose coils lies in
 * his way. Null where there's no fence to climb.
 */
export function vaultLanding(sim: Simulation, soldier: EntityId): { x: number; z: number } | null {
  const heading = headingOf(sim, soldier)
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
    return null
  }
  let exit = -1
  for (let distance = entry + STEP; distance <= entry + SPAN; distance += STEP) {
    const point = at(distance)
    if (wireAt(sim.wire, point.x, point.z) <= CLEAR) {
      exit = distance
      break
    }
  }
  if (exit < 0) {
    return null
  }
  const from = at(entry)
  const to = at(exit)
  const snared = tanglesOf(sim.map).some(
    (tangle) => distanceSquaredToSegment(tangle.x, tangle.z, from.x, from.z, to.x, to.z) < TANGLE_REACH * TANGLE_REACH
  )
  const landing = at(exit + LANDING)
  if (snared || landing.x < 0 || landing.z < 0 || landing.x > mapWidth(sim.map) || landing.z > mapDepth(sim.map)) {
    return null
  }
  return landing
}

/** Sets a soldier climbing the fence ahead of him, if there's one he can climb. Whether he does. */
export function startVault(sim: Simulation, soldier: EntityId): boolean {
  const { vault, stamina, stance } = sim.soldiers
  if (hasComponent(sim.world, soldier, vault) || stamina.spent[soldier] === 1) {
    return false
  }
  const landing = vaultLanding(sim, soldier)
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
