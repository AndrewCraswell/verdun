import { capturedIds, isAlive, type EntityId, type Simulation, type Squad, woundedIds } from "@verdun/sim"
import { roleLabel, roleOf, type SoldierName, type SquadNames } from "./squad-names.ts"

/**
 * The handover when the man under the player's control falls: who went down and how, and who they are now (H16 in
 * docs/design/interface.md). A short, plain beat in place of a respawn screen; switching by choice needs none.
 */

export type Fate = "killed" | "badly wounded" | "taken prisoner"

export interface Succession {
  /** Unique for the life of the watch, so views can tell one handover from the next. */
  readonly id: number
  readonly fallen: { readonly name: SoldierName; readonly fate: Fate }
  /** The man who takes over, or null when he was the last: the squad is wiped out. */
  readonly next: { readonly name: SoldierName; readonly slot: number; readonly role: string } | null
  /** How far through the handover it is, from 0 to 1. */
  readonly progress: number
}

/** The whole handover, in real seconds: the fall, then the man taking over. */
export const SUCCESSION_SECONDS = 2.4

export interface SuccessionWatch {
  /** The handover under way at a real moment, in seconds, if any. Call a few times a second. */
  read(now: number): Succession | null
}

export function createSuccessionWatch(sim: Simulation, squad: Squad, names: SquadNames): SuccessionWatch {
  let last: EntityId = squad.leader
  let nextId = 0
  let current: { readonly succession: Omit<Succession, "progress">; readonly since: number } | null = null

  function fateOf(soldier: EntityId): Fate {
    if (capturedIds(sim).includes(soldier)) {
      return "taken prisoner"
    }
    return woundedIds(sim).includes(soldier) ? "badly wounded" : "killed"
  }

  return {
    read(now) {
      const leader = squad.leader
      if (leader !== last) {
        if (last >= 0 && !isAlive(sim, last)) {
          current = {
            succession: {
              id: nextId++,
              fallen: { name: names.nameOf(sim, squad, last), fate: fateOf(last) },
              next:
                leader >= 0
                  ? {
                      name: names.nameOf(sim, squad, leader),
                      slot: squad.members.indexOf(leader) + 1,
                      role: roleLabel(roleOf(sim, squad, leader))
                    }
                  : null
            },
            since: now
          }
        }
        last = leader
      }
      if (!current) {
        return null
      }
      const progress = (now - current.since) / SUCCESSION_SECONDS
      if (progress >= 1) {
        current = null
        return null
      }
      return { ...current.succession, progress: Math.max(0, progress) }
    }
  }
}
