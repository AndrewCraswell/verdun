import type { EntityId } from "@verdun/sim"
import type { RosterSlot, SlotStatus } from "../hud/soldier-state.ts"
import type { Role, SoldierName } from "../hud/squad-names.ts"

/**
 * The squad book's page of record (S5 in docs/design/interface.md): every man of the squad who fell, was taken, or was
 * brought in, with when and where, kept from the roster as the battle goes. A record, not a scoreboard: it says what
 * happened to each man, and never what he did to the enemy.
 */

/** What became of a man, in the squad book's words. */
export type Fate =
  | "badly-wounded"
  | "carried"
  | "aid-post"
  | "returned"
  | "hospital"
  | "killed"
  | "died-of-wounds"
  | "captured"

export const FATE_LABELS: Readonly<Record<Fate, string>> = {
  "badly-wounded": "Badly wounded, waiting for the bearers",
  carried: "Being carried in",
  "aid-post": "At the aid post",
  returned: "Returned to duty",
  hospital: "Sent to hospital",
  killed: "Killed",
  "died-of-wounds": "Died of his wounds",
  captured: "Taken prisoner"
}

const OUT: Readonly<Partial<Record<SlotStatus, Fate>>> = {
  down: "badly-wounded",
  carried: "carried",
  "aid-post": "aid-post",
  returned: "returned",
  hospital: "hospital",
  killed: "killed",
  captured: "captured"
}

/** One man's entry: who he was, what became of him, and when and where he fell. */
export interface RecordEntry {
  readonly id: EntityId
  readonly slot: number
  readonly name: SoldierName
  readonly role: Role
  readonly fate: Fate
  /** The week of the war he fell in, as the war's calendar has it, or null without one. */
  readonly week: number | null
  /** Where he fell, in words: "near Fleury crossroads", "in square C4". */
  readonly place: string
}

export interface SquadRecord {
  /** Reads the roster as it is now; `week` and `placeOf` say when and where, for men who have just fallen. */
  observe(roster: readonly RosterSlot[], week: number | null, placeOf: (soldier: EntityId) => string): void
  /** Every man who has fallen or been brought in, the most recently fallen first. */
  readonly entries: readonly RecordEntry[]
}

export function createSquadRecord(): SquadRecord {
  const entries = new Map<EntityId, RecordEntry>()
  let order: RecordEntry[] = []
  return {
    observe(roster, week, placeOf) {
      let changed = false
      for (const man of roster) {
        const fate = OUT[man.status]
        if (!fate) {
          continue
        }
        const known = entries.get(man.id)
        if (known?.fate === fate || (known?.fate === "died-of-wounds" && fate === "killed")) {
          continue
        }
        // A man down or being carried in who is then killed died of his wounds; he keeps the day and place he fell.
        const died = fate === "killed" && known !== undefined && known.fate !== "captured"
        entries.set(man.id, {
          id: man.id,
          slot: man.slot,
          name: man.name,
          role: man.role,
          fate: died ? "died-of-wounds" : fate,
          week: known ? known.week : week,
          place: known ? known.place : placeOf(man.id)
        })
        changed = true
      }
      if (changed) {
        order = [...entries.values()].reverse()
      }
    },
    get entries() {
      return order
    }
  }
}
