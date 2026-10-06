import type { BattlefieldMap } from "@verdun/map"
import { addComponent, type EntityId, hasComponent, query, removeComponent } from "bitecs"
import { loadWeapon, toWeapon, Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import { type Simulation, soldierIds, TICK_RATE } from "./simulation.ts"
import { isAlive } from "./squads.ts"

/** A man takes over a gun, or hands his own over, to a comrade within this many metres. */
export const MAN_REACH = 2.5
/** A man on a nest's gun has left it once this far from it, in metres: the gun stays in the nest. */
const LEFT_THE_GUN = 3.5
/** The gunner kneels this far behind the gun, in metres, the sandbags in front of it. */
const BEHIND_THE_GUN = 0.8
/** A nest with nobody on its gun is taken up by a rifleman of its side holding within this many metres of it. */
const CREW_FROM = 12

/**
 * A machine-gun nest: a sandbagged emplacement with its gun, where the map has one (the "machine-gun" scenery). Its gun
 * stays in it, manned by whoever's posted there (`post`), or silent until someone takes it up. Where the gunner kneels,
 * and whose it is: the art draws the French gun on even variants and the German on odd (scenery-dressing.ts).
 */
export interface Nest {
  readonly x: number
  readonly z: number
  readonly side: Side
}

const nestsByMap = new WeakMap<BattlefieldMap, readonly Nest[]>()

/** The map's machine-gun nests, in the order its scenery lists them. */
export function nestsOf(map: BattlefieldMap): readonly Nest[] {
  let nests = nestsByMap.get(map)
  if (!nests) {
    nests = map.scenery
      .filter((item) => item.kind === "machine-gun")
      .map((item) => ({
        x: item.x - Math.sin(item.heading) * BEHIND_THE_GUN,
        z: item.z - Math.cos(item.heading) * BEHIND_THE_GUN,
        side: item.variant % 2 === 1 ? Side.German : Side.French
      }))
    nestsByMap.set(map, nests)
  }
  return nests
}

/** The nest a soldier is posted to, or -1. */
export function postOf(sim: Simulation, soldier: EntityId): number {
  return hasComponent(sim.world, soldier, sim.soldiers.post) ? (sim.soldiers.post.nest[soldier] ?? -1) : -1
}

/** Whether anyone living is posted to a nest. */
function manned(sim: Simulation, nest: number): boolean {
  for (const soldier of query(sim.world, [sim.soldiers.post])) {
    if (sim.soldiers.post.nest[soldier] === nest && isAlive(sim, soldier)) {
      return true
    }
  }
  return false
}

/** The nearest nest of a soldier's side within reach of him with nobody on its gun, or -1. */
function emptyNestBy(sim: Simulation, soldier: EntityId): number {
  const { position, side } = sim.soldiers
  let best = -1
  let bestDistance = MAN_REACH * MAN_REACH
  nestsOf(sim.map).forEach((nest, index) => {
    if (nest.side !== side.value[soldier]) {
      return
    }
    const distance = (nest.x - position.x[soldier]) ** 2 + (nest.z - position.z[soldier]) ** 2
    if (distance <= bestDistance && !manned(sim, index)) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

/**
 * Posts a soldier on a nest's gun: he puts down his own weapon and takes up the gun, loaded. `at` puts him at the gun,
 * kneeling behind it, as when a battle is set up.
 */
export function postAt(sim: Simulation, soldier: EntityId, nest: number, at = false): void {
  const { post, weapon, position } = sim.soldiers
  addComponent(sim.world, soldier, post)
  post.nest[soldier] = nest
  post.weapon[soldier] = weapon.kind[soldier] === Weapon.MachineGun ? Weapon.Rifle : (weapon.kind[soldier] ?? 0)
  weapon.kind[soldier] = Weapon.MachineGun
  loadWeapon(sim, soldier)
  const spot = nestsOf(sim.map)[nest]
  if (at && spot) {
    position.x[soldier] = spot.x
    position.z[soldier] = spot.z
  }
}

/** Takes a soldier off his nest's gun, leaving it there, and gives him back the weapon he put down. */
function leavePost(sim: Simulation, soldier: EntityId): void {
  const { post, weapon } = sim.soldiers
  weapon.kind[soldier] = toWeapon(post.weapon[soldier] ?? 0)
  removeComponent(sim.world, soldier, post)
  loadWeapon(sim, soldier)
}

/** The nearest living comrade of a soldier within reach carrying a weapon of a kind, or -1. */
function nearestWith(sim: Simulation, soldier: EntityId, wanted: (kind: number) => boolean): EntityId {
  const { position, side, weapon } = sim.soldiers
  let best: EntityId = -1
  let bestDistance = MAN_REACH * MAN_REACH
  for (const other of soldierIds(sim)) {
    if (other === soldier || side.value[other] !== side.value[soldier] || !isAlive(sim, other)) {
      continue
    }
    if (!wanted(weapon.kind[other] ?? Weapon.Rifle)) {
      continue
    }
    const distance = (position.x[other] - position.x[soldier]) ** 2 + (position.z[other] - position.z[soldier]) ** 2
    if (distance <= bestDistance) {
      best = other
      bestDistance = distance
    }
  }
  return best
}

/** The comrade a soldier would take a machine gun over from, or hand his own to: -1 when there's none in reach. */
export function gunPartner(sim: Simulation, soldier: EntityId): EntityId {
  const manning = sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun
  return nearestWith(sim, soldier, (kind) => (manning ? kind === Weapon.Rifle : kind === Weapon.MachineGun))
}

/**
 * What the action key would do about a machine gun for a soldier: take over a comrade's beside him or a nest's with
 * nobody on it ("man"), hand his own to the rifleman beside him ("hand-back"), or leave his nest's gun in the nest
 * ("leave"). Null with no gun to see to.
 */
export function gunAction(sim: Simulation, soldier: EntityId): "man" | "hand-back" | "leave" | null {
  if (gunPartner(sim, soldier) >= 0) {
    return sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun ? "hand-back" : "man"
  }
  if (postOf(sim, soldier) >= 0) {
    return "leave"
  }
  return sim.soldiers.weapon.kind[soldier] !== Weapon.MachineGun && emptyNestBy(sim, soldier) >= 0 ? "man" : null
}

/**
 * A soldier beside a comrade's machine gun takes it over, and the gunner takes up his rifle; a soldier on a gun hands it
 * back to the rifleman nearest him. A nest's gun changes hands with its post: the new gunner holds the nest. With nobody
 * to change with, a man on a nest's gun leaves it in the nest, and a man by a nest nobody's on takes its gun up. Whether
 * a gun changed hands.
 */
export function manGun(sim: Simulation, soldier: EntityId): boolean {
  const partner = gunPartner(sim, soldier)
  if (partner < 0) {
    if (postOf(sim, soldier) >= 0) {
      leavePost(sim, soldier)
      return true
    }
    const nest = sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun ? -1 : emptyNestBy(sim, soldier)
    if (nest < 0) {
      return false
    }
    postAt(sim, soldier, nest)
    sim.events.push({ type: "gun-manned", squad: sim.soldiers.squad.id[soldier], soldier })
    return true
  }
  const { weapon } = sim.soldiers
  const gunner = weapon.kind[soldier] === Weapon.MachineGun ? partner : soldier
  const from = gunner === soldier ? partner : soldier
  const nest = postOf(sim, from)
  if (nest >= 0) {
    leavePost(sim, from)
    postAt(sim, gunner, nest)
  } else {
    weapon.kind[from] = Weapon.Rifle
    weapon.kind[gunner] = Weapon.MachineGun
    // Each takes up his weapon loaded: the gun with a fresh strip or belt, the rifle charged.
    loadWeapon(sim, gunner)
    loadWeapon(sim, from)
  }
  sim.events.push({ type: "gun-manned", squad: sim.soldiers.squad.id[gunner], soldier: gunner })
  return true
}

/** Whether a soldier is on his way to a nest's gun: walking to where its gunner kneels. */
function headingFor(sim: Simulation, soldier: EntityId, nest: Nest): boolean {
  const { moveOrder } = sim.soldiers
  return (
    hasComponent(sim.world, soldier, moveOrder) &&
    Math.abs((moveOrder.x[soldier] ?? 0) - nest.x) < 0.01 &&
    Math.abs((moveOrder.z[soldier] ?? 0) - nest.z) < 0.01
  )
}

/** Whether a soldier could go and take up a nest's gun: a rifleman whose squad is holding, not the player's own man. */
function free(sim: Simulation, soldier: EntityId): boolean {
  const squad = sim.squads[sim.soldiers.squad.id[soldier] ?? -1]
  return (
    isAlive(sim, soldier) &&
    sim.soldiers.weapon.kind[soldier] === Weapon.Rifle &&
    postOf(sim, soldier) < 0 &&
    squad !== undefined &&
    (squad.order.kind === "hold" || squad.order.kind === "reserve") &&
    !(squad.controller === "player" && squad.leader === soldier)
  )
}

/**
 * Gets every nest's gun manned that can be: the man on his way to one takes it up as he reaches it, and an empty one
 * with nobody on the way sends for the nearest rifleman of its side holding nearby, of any squad. Once a second.
 */
function crewEmptyNests(sim: Simulation): void {
  const { position, side, moveOrder } = sim.soldiers
  nestsOf(sim.map).forEach((nest, index) => {
    if (manned(sim, index)) {
      return
    }
    let best = -1
    let bestDistance = CREW_FROM * CREW_FROM
    for (const soldier of soldierIds(sim)) {
      if (side.value[soldier] !== nest.side || !free(sim, soldier)) {
        continue
      }
      const distance = (position.x[soldier] - nest.x) ** 2 + (position.z[soldier] - nest.z) ** 2
      if (headingFor(sim, soldier, nest)) {
        best = soldier
        bestDistance = distance
        break
      }
      if (distance < bestDistance) {
        best = soldier
        bestDistance = distance
      }
    }
    if (best < 0) {
      return
    }
    if (bestDistance <= MAN_REACH * MAN_REACH) {
      removeComponent(sim.world, best, moveOrder)
      postAt(sim, best, index)
      sim.events.push({ type: "gun-manned", squad: sim.soldiers.squad.id[best], soldier: best })
    } else if (!headingFor(sim, best, nest)) {
      addComponent(sim.world, best, moveOrder)
      moveOrder.x[best] = nest.x
      moveOrder.z[best] = nest.z
      moveOrder.run[best] = 1
    }
  })
}

/**
 * Takes men off nests' guns they've left (walked or been moved off, or fallen at it), leaving the gun in the nest, and
 * gets the nests whose guns nobody's on manned again by whoever's near (`crewEmptyNests`).
 */
export function nestSystem(sim: Simulation): void {
  const nests = nestsOf(sim.map)
  const { position, post } = sim.soldiers
  for (const soldier of Array.from(query(sim.world, [post]))) {
    const nest = nests[post.nest[soldier] ?? -1]
    if (!isAlive(sim, soldier)) {
      removeComponent(sim.world, soldier, post)
      continue
    }
    if (!nest || (nest.x - position.x[soldier]) ** 2 + (nest.z - position.z[soldier]) ** 2 > LEFT_THE_GUN ** 2) {
      leavePost(sim, soldier)
    }
  }
  if (sim.tick % TICK_RATE === 0) {
    crewEmptyNests(sim)
  }
}
