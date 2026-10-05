import { BROKEN_MORALE, isAlive, PINNED, type Simulation, type Squad, type SquadOrder } from "@verdun/sim"

/**
 * The squad's order as the HUD shows it (H6 in docs/design/interface.md): what the men are doing, where they're going,
 * and how many can't obey, so a weak squad never reads as a broken one.
 */

export interface OrderView {
  readonly kind: SquadOrder["kind"]
  /** "Holding", "Advancing". */
  readonly label: string
  /** "where they stand", "40 m north-east". */
  readonly detail: string | null
  /** The ground the order is about: an advance's point, where the squad was told to hold, a raid's goal. */
  readonly target: { readonly x: number; readonly z: number } | null
  /** Men still fighting, other than the one under control, who are pinned or broken and can't obey. */
  readonly pinned: number
  readonly broken: number
  /** Counts up each time the order changes, so views can mark a new order. */
  readonly serial: number
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const
/** Within this many metres of an advance's point, the squad is there. */
const ARRIVED = 8

const RAID_PHASES = { out: "crawling out to the wire", in: "in the enemy trench", home: "coming home" } as const

/** How far and which way a point lies from another: "40 m north-east". */
export function direction(from: { x: number; z: number }, to: { x: number; z: number }): string {
  const distance = Math.hypot(to.x - from.x, to.z - from.z)
  const bearing = (Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI
  const point = COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8] ?? "north"
  return `${Math.round(distance)} m ${point}`
}

export interface OrderWatch {
  read(): OrderView
}

/** Watches the squad's order, remembering where it was told to hold. */
export function createOrderWatch(sim: Simulation, squad: Squad): OrderWatch {
  let key = ""
  let serial = 0
  let holdAt: { x: number; z: number } | null = null

  function centre(): { x: number; z: number } | null {
    const standing = squad.members.filter((member) => isAlive(sim, member))
    if (standing.length === 0) {
      return null
    }
    const x = standing.reduce((sum, member) => sum + sim.soldiers.position.x[member], 0) / standing.length
    const z = standing.reduce((sum, member) => sum + sim.soldiers.position.z[member], 0) / standing.length
    return { x, z }
  }

  return {
    read() {
      const order = squad.order
      const now = JSON.stringify(order)
      if (now !== key) {
        // The first look at the squad isn't a new order.
        serial += key === "" ? 0 : 1
        key = now
        holdAt = order.kind === "hold" ? centre() : null
      }
      const leader = squad.leader >= 0 && isAlive(sim, squad.leader) ? squad.leader : -1
      const from = leader >= 0 ? { x: sim.soldiers.position.x[leader], z: sim.soldiers.position.z[leader] } : centre()
      let pinned = 0
      let broken = 0
      for (const member of squad.members) {
        if (member === leader || !isAlive(sim, member)) {
          continue
        }
        if (sim.soldiers.morale.value[member] < BROKEN_MORALE) {
          broken++
        } else if (sim.soldiers.suppression.value[member] >= PINNED) {
          pinned++
        }
      }
      const base = { kind: order.kind, pinned, broken, serial }
      switch (order.kind) {
        case "follow":
          return { ...base, label: "Following you", detail: null, target: null }
        case "hold":
          return { ...base, label: "Holding", detail: "where they stand", target: holdAt }
        case "reserve":
          return { ...base, label: "In reserve", detail: "below in the dugouts", target: null }
        case "advance": {
          const target = { x: order.x, z: order.z }
          const there = from !== null && Math.hypot(target.x - from.x, target.z - from.z) < ARRIVED
          return {
            ...base,
            label: there ? "In position" : "Advancing",
            detail: from && !there ? direction(from, target) : null,
            target
          }
        }
        case "creep":
          return { ...base, label: "Following the barrage", detail: "70 m behind it", target: null }
        case "raid": {
          const target = order.phase === "home" ? { x: order.homeX, z: order.homeZ } : { x: order.x, z: order.z }
          return { ...base, label: "Raiding", detail: RAID_PHASES[order.phase], target }
        }
        case "run-to":
        case "withdraw": {
          const target = { x: order.x, z: order.z }
          const there = from !== null && Math.hypot(target.x - from.x, target.z - from.z) < ARRIVED
          const going = order.kind === "run-to" ? "Running" : "Withdrawing"
          return {
            ...base,
            label: there ? "In position" : going,
            detail: from && !there ? direction(from, target) : null,
            target
          }
        }
        case "suppress": {
          const target = { x: order.x, z: order.z }
          return { ...base, label: "Suppressing", detail: from ? direction(from, target) : null, target }
        }
        case "dig-in":
          return { ...base, label: "Dug in", detail: "keeping low", target: { x: order.x, z: order.z } }
        case "rally":
          return { ...base, label: "Rallying", detail: "on their corporal", target: null }
      }
    }
  }
}
