import {
  type EntityId,
  isAlive,
  type Simulation,
  type Squad,
  type SquadOrder,
  takeOverCandidates,
  Weapon
} from "@verdun/sim"
import type { SquadNames } from "./squad-names.ts"
import { direction } from "./squad-order.ts"

/**
 * The squads a player whose squad was wiped out can take over (H17 in docs/design/interface.md), as the picker shows
 * them: who leads each, how many men stand, what they carry that matters, where they are and what they're doing.
 */

/** The weapons worth knowing a squad has, beyond its rifles. */
export type SquadKit = "machine-gun" | "sniper" | "grenadier"

export interface TakeOverChoice {
  /** The squad's id, for the take-over. */
  readonly squad: number
  /** "Martin's squad", by its leader's surname. */
  readonly name: string
  /** "Caporal Martin". */
  readonly leader: string
  /** Men standing. */
  readonly men: number
  readonly kit: readonly SquadKit[]
  /** "Near Fleury crossroads, 80 m east", or only the distance and direction away from any objective. */
  readonly place: string
  /** "Holding", "In reserve". */
  readonly order: string
  /** Where its leader stands, for marking it and looking at it. */
  readonly at: { readonly x: number; readonly z: number }
}

/** At most this many squads are offered, nearest first. */
const MOST = 5
/** A squad this close to an objective's middle, in metres, is placed by it. */
const NEAR_OBJECTIVE = 70

const ORDERS: Readonly<Record<SquadOrder["kind"], string>> = {
  follow: "Following its leader",
  hold: "Holding",
  reserve: "In reserve",
  advance: "Advancing",
  creep: "Behind the barrage",
  raid: "Raiding",
  "run-to": "Running",
  suppress: "Suppressing",
  withdraw: "Withdrawing",
  "dig-in": "Dug in",
  rally: "Rallying"
}

const KITS: readonly (readonly [number, SquadKit])[] = [
  [Weapon.MachineGun, "machine-gun"],
  [Weapon.Sniper, "sniper"],
  [Weapon.RifleGrenadier, "grenadier"]
]

/** Where the lost squad was: the middle of its men, fallen where they fell. */
export function middleOf(sim: Simulation, squad: Squad): { x: number; z: number } {
  const count = Math.max(1, squad.members.length)
  const { x, z } = sim.soldiers.position
  return {
    x: squad.members.reduce((sum, member) => sum + x[member], 0) / count,
    z: squad.members.reduce((sum, member) => sum + z[member], 0) / count
  }
}

/** The squads the player can take over now, nearest first, at most five. Empty unless the player's squad is gone. */
export function takeOverChoices(sim: Simulation, squad: Squad, names: SquadNames): TakeOverChoice[] {
  const from = middleOf(sim, squad)
  return takeOverCandidates(sim, squad)
    .slice(0, MOST)
    .flatMap((candidate) => {
      const standing = candidate.members.filter((member) => isAlive(sim, member))
      const leader: EntityId | undefined =
        candidate.leader >= 0 && isAlive(sim, candidate.leader) ? candidate.leader : standing[0]
      if (leader === undefined) {
        return []
      }
      const name = names.nameOf(sim, candidate, leader)
      const at = { x: sim.soldiers.position.x[leader], z: sim.soldiers.position.z[leader] }
      const objective = sim.objectives
        .map((goal) => ({ goal, distance: Math.hypot(goal.x - at.x, goal.z - at.z) }))
        .filter(({ distance }) => distance <= NEAR_OBJECTIVE)
        .sort((a, b) => a.distance - b.distance)[0]?.goal
      const away = direction(from, at)
      return [
        {
          squad: candidate.id,
          name: `${name.surname}'s squad`,
          leader: `${name.rank} ${name.surname}`,
          men: standing.length,
          kit: KITS.filter(([weapon]) => standing.some((member) => sim.soldiers.weapon.kind[member] === weapon)).map(
            ([, kit]) => kit
          ),
          place: objective ? `Near ${objective.name}, ${away}` : away,
          order: ORDERS[candidate.order.kind],
          at
        }
      ]
    })
}
