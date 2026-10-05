import {
  isAlive,
  isStandTo,
  MaskState,
  type OperationResult,
  Side,
  type SimEvent,
  type Simulation,
  type Squad
} from "@verdun/sim"
import type { SquadNames } from "./squad-names.ts"

/**
 * Banners: big, rare, short messages across the top of the screen that change what everyone is doing (H15 in
 * docs/design/interface.md). One at a time; a more urgent one cuts in ahead of the rest.
 */

/** The banner's register: bad news, the attack, ground won, or the routine of the line. */
export type BannerTone = "alarm" | "attack" | "won" | "routine"

export interface Banner {
  /** Unique for the life of the queue, so views can tell a new banner from the one already up. */
  readonly id: number
  /** A line above the title, in small capitals: "Zero hour", "Objective taken". */
  readonly kicker: string
  readonly title: string
  readonly detail: string | null
  readonly tone: BannerTone
}

/** How long a banner stays up, in real seconds. */
export const BANNER_SECONDS = 4.2

const URGENCY: Readonly<Record<BannerTone, number>> = { alarm: 3, attack: 2, won: 1, routine: 0 }

const ZERO_HOUR_DETAIL = "Keep 70 m behind the barrage. Run for the trench when it lifts"

/** How an operation ended, for the attackers and for the defenders. */
const OVER: Readonly<Record<OperationResult, readonly [readonly [string, BannerTone], readonly [string, BannerTone]]>> =
  {
    taken: [
      ["Their line taken", "won"],
      ["Our line lost", "alarm"]
    ],
    footing: [
      ["A footing gained", "won"],
      ["They hold a footing", "alarm"]
    ],
    repulsed: [
      ["Thrown back", "alarm"],
      ["Their attack thrown back", "won"]
    ]
  }

export interface BannerQueue {
  /** Raises the banners one simulation step's events call for. Call after every step. */
  record(events: readonly SimEvent[]): void
  /** The banner up at a real moment, in seconds, if any, and how far through its time it is, from 0 to 1. */
  current(now: number): { readonly banner: Banner; readonly progress: number } | null
}

export function createBannerQueue(sim: Simulation, squad: Squad, names?: SquadNames): BannerQueue {
  const side = squad.side
  const enemy = side === Side.French ? Side.German : Side.French
  let waiting: Banner[] = []
  let showing: { readonly banner: Banner; readonly since: number } | null = null
  let nextId = 0
  let gasAlarm = false
  let creeping = squad.order.kind === "creep"
  let standTo = isStandTo(sim)

  function raise(kicker: string, title: string, detail: string | null, tone: BannerTone): void {
    const banner = { id: nextId++, kicker, title, detail, tone }
    // The same banner twice in a row says nothing new.
    const same = (other: Banner) => other.kicker === kicker && other.title === title
    if (waiting.some(same) || (showing && same(showing.banner))) {
      return
    }
    waiting.push(banner)
    waiting.sort((a, b) => URGENCY[b.tone] - URGENCY[a.tone] || a.id - b.id)
  }

  return {
    record(events) {
      for (const event of events) {
        if (event.type === "objective-taken") {
          if (event.side === side) {
            raise("Objective taken", event.name, "Hold it: the counter-attack will come", "won")
          } else {
            raise(
              "Objective lost",
              event.name,
              `Taken by the ${event.side === Side.German ? "Germans" : "French"}`,
              "alarm"
            )
          }
        } else if (event.type === "counter-attack" && event.side === enemy) {
          raise("Alarm", "Counter-attack coming", "The enemy is shelling the lost trench", "alarm")
        } else if (event.type === "zero-hour") {
          if (event.side === side && event.squads.includes(squad.id)) {
            raise("Zero hour", "Over the top!", ZERO_HOUR_DETAIL, "attack")
          } else if (event.side === side) {
            // The attack is on a stretch of the line; the player's squad holds its own.
            raise("Zero hour", "The attack goes in", "Hold your ground: the first wave is going over", "attack")
          } else {
            raise("Alarm", "They're coming over", "Every man up on the fire step", "alarm")
          }
        } else if (event.type === "operation-over") {
          const attacking = sim.operation?.plan.side === side
          const [title, tone] = OVER[event.result][attacking ? 0 : 1]
          raise("Operation over", title, null, tone)
        } else if (event.type === "squad-taken-over" && event.squad === squad.id) {
          const leader = names && squad.leader >= 0 ? names.nameOf(sim, squad, squad.leader) : null
          raise(
            "Squad taken over",
            leader ? `You now command ${leader.surname}'s squad` : "You command a new squad",
            `${event.men} men`,
            "routine"
          )
        } else if (event.type === "reinforcement" && event.squad === squad.id) {
          raise(
            "Replacements",
            `${event.men} men up in the rear trench`,
            "Your new squad is holding, waiting for orders",
            "routine"
          )
        }
      }
      const masking = squad.members.some(
        (member) => isAlive(sim, member) && sim.soldiers.mask.state[member] === MaskState.Donning
      )
      if (masking && !gasAlarm) {
        raise("Gas", "Gas! Masks on", "Your men are masking up", "alarm")
      }
      gasAlarm =
        masking || (gasAlarm && squad.members.some((member) => sim.soldiers.mask.state[member] !== MaskState.Off))
      const creep = squad.order.kind === "creep"
      if (creep && !creeping) {
        raise("Zero hour", "Over the top!", ZERO_HOUR_DETAIL, "attack")
      }
      creeping = creep
      const standing = isStandTo(sim)
      if (standing && !standTo) {
        const dawn = sim.environment.clock.elapsed % 86_400_000 < 43_200_000
        raise(dawn ? "Dawn" : "Dusk", "Stand-to", "Every man up on the fire step", "routine")
      }
      standTo = standing
    },
    current(now) {
      if (showing && now - showing.since >= BANNER_SECONDS) {
        showing = null
      }
      const [next] = waiting
      // An alarm cuts in on anything less urgent.
      if (next && (!showing || URGENCY[next.tone] > URGENCY[showing.banner.tone])) {
        waiting = waiting.slice(1)
        showing = { banner: next, since: now }
      }
      return showing ? { banner: showing.banner, progress: Math.min(1, (now - showing.since) / BANNER_SECONDS) } : null
    }
  }
}
