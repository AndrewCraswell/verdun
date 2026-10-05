import type { EntityId } from "bitecs"
import { Shell } from "./artillery.ts"
import { PINNED, Weapon, weaponKind } from "./combat.ts"
import { Side } from "./components.ts"
import type { Simulation } from "./simulation.ts"
import { soldierIds, TICK_RATE } from "./simulation.ts"
import { nearestSoldiers } from "./spatial.ts"
import { spottedGuns } from "./spotting.ts"
import { isInTrench, isSheltering, soldierEye } from "./stance.ts"

/** Rifle grenades a grenadier goes into action with. */
export const RIFLE_GRENADES_CARRIED = 8
/**
 * The VB (Viven-Bessières) rifle grenade's reach, in metres: too close and it would burst among his own men, and the
 * discharger cup throws it about 180 m at most.
 */
export const RIFLE_GRENADE_RANGE = { min: 40, max: 180 } as const
/** Seconds between rounds: fit a grenade in the cup, aim by the quadrant, fire. */
const RELOAD_SECONDS = 15
/** Its flight, in metres per second: a high lob. */
const FLIGHT_SPEED = 40
/** Where it lands round the aim, in metres (probable error): a little, and more the further it goes. */
const SCATTER = { base: 3, perMetre: 0.05 } as const
/** Men in trenches nearer than this are worth a rifle grenade only if few enough are checked, for sight-line cost. */
const LOOKS = 6

/** A rifle grenade fired, for animation and sound. */
export interface RifleGrenadeEvent {
  readonly type: "rifle-grenade"
  readonly soldier: EntityId
  readonly x: number
  readonly z: number
}

/** Whether a soldier fires on his own: everyone but the soldier a player is controlling. */
function firesOnTheirOwn(sim: Simulation, soldier: EntityId): boolean {
  const squad = sim.squads[sim.soldiers.squad.id[soldier]]
  return !(squad?.controller === "player" && squad.leader === soldier)
}

function inReach(sim: Simulation, soldier: EntityId, x: number, z: number): boolean {
  const dx = x - sim.soldiers.position.x[soldier]
  const dz = z - sim.soldiers.position.z[soldier]
  const distance = dx * dx + dz * dz
  return distance >= RIFLE_GRENADE_RANGE.min ** 2 && distance <= RIFLE_GRENADE_RANGE.max ** 2
}

/**
 * Where a grenadier lobs his next grenade: on an enemy machine gun his side has spotted, first, or else on the nearest
 * enemy he can see down in a trench, where rifles can't reach him. Null when there's nothing worth a grenade in reach.
 */
function aimPoint(sim: Simulation, soldier: EntityId): { x: number; z: number } | null {
  const side = sim.soldiers.side.value[soldier] === Side.German ? Side.German : Side.French
  const gun = spottedGuns(sim, side).find((sighting) => inReach(sim, soldier, sighting.x, sighting.z))
  if (gun) {
    return { x: gun.x, z: gun.z }
  }
  const lineOfSight = sim.lineOfSight
  if (!lineOfSight) {
    return null
  }
  const { position } = sim.soldiers
  const target = nearestSoldiers(
    sim,
    position.x[soldier],
    position.z[soldier],
    LOOKS,
    RIFLE_GRENADE_RANGE.max,
    (other) => sim.soldiers.side.value[other] !== side && !isSheltering(sim, other)
  ).find(
    (enemy) =>
      inReach(sim, soldier, position.x[enemy], position.z[enemy]) &&
      isInTrench(sim.map, position.x[enemy], position.z[enemy]) &&
      lineOfSight.isClear(soldierEye(sim, soldier), soldierEye(sim, enemy))
  )
  return target === undefined ? null : { x: position.x[target], z: position.z[target] }
}

/** A normally distributed offset with the given probable error, from the simulation's RNG. */
function scatter(sim: Simulation, probableError: number): number {
  const u = Math.max(sim.rng.next(), Number.EPSILON)
  const v = sim.rng.next()
  return (Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * probableError) / 0.6745
}

/**
 * Rifle grenadiers lob VB grenades into machine-gun nests and trench bays: the infantry's own short-range artillery,
 * and one of its answers to a gun it can't rush. Each fires every 15 s while he has grenades and something worth one
 * in reach, unless he's pinned, below ground or the man the player controls.
 */
export function rifleGrenadeSystem(sim: Simulation): void {
  const { rifleGrenades, position } = sim.soldiers
  for (const soldier of soldierIds(sim)) {
    if (
      weaponKind(sim, soldier) !== Weapon.RifleGrenadier ||
      rifleGrenades.count[soldier] === 0 ||
      sim.tick < rifleGrenades.readyAt[soldier] ||
      sim.soldiers.suppression.value[soldier] >= PINNED ||
      isSheltering(sim, soldier) ||
      !firesOnTheirOwn(sim, soldier)
    ) {
      continue
    }
    const aim = aimPoint(sim, soldier)
    if (!aim) {
      // Look again in a second, not every step.
      rifleGrenades.readyAt[soldier] = sim.tick + TICK_RATE
      continue
    }
    const range = Math.sqrt((aim.x - position.x[soldier]) ** 2 + (aim.z - position.z[soldier]) ** 2)
    const error = SCATTER.base + SCATTER.perMetre * range
    const x = aim.x + scatter(sim, error)
    const z = aim.z + scatter(sim, error)
    rifleGrenades.count[soldier] -= 1
    rifleGrenades.readyAt[soldier] = sim.tick + RELOAD_SECONDS * TICK_RATE
    sim.artillery.shells.push({
      shell: Shell.Grenade,
      side: sim.soldiers.side.value[soldier] === Side.German ? Side.German : Side.French,
      x,
      z,
      landsAtTick: sim.tick + Math.max(1, Math.round((range / FLIGHT_SPEED) * TICK_RATE))
    })
    sim.events.push({ type: "rifle-grenade", soldier, x, z })
  }
}
