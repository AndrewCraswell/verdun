import { enqueueCommand, Side } from "@verdun/sim"
import { weekLabel } from "../environment/calendar.ts"
import { h, setText } from "../hud/dom.ts"
import { metres } from "../hud/format.ts"
import type { RosterSlot, SlotMark, SlotStatus } from "../hud/soldier-state.ts"
import { roleLabel, weaponName } from "../hud/squad-names.ts"
import type { BattleParts } from "./battle.ts"
import { button } from "./fields.ts"
import type { MenuPage } from "./page.ts"
import { FATE_LABELS, type SquadRecord } from "./squad-record.ts"
import "./squad-book.css"

/** Each state in the squad book's words (docs/design/interface.md#soldier-and-squad-state-the-vocabulary). */
const STATUS_WORDS: Readonly<Record<SlotStatus, string>> = {
  steady: "Steady",
  shaken: "Shaken",
  broken: "Broken",
  "under-fire": "Under fire",
  pinned: "Pinned",
  masking: "Pulling his mask on",
  gassed: "Gassed",
  spent: "Spent",
  wounded: "Lightly wounded",
  down: "Badly wounded, down",
  carried: "Being carried in",
  "aid-post": "At the aid post",
  returned: "Returned to duty",
  hospital: "Sent to hospital",
  killed: "Killed",
  captured: "Taken prisoner"
}

const MARK_WORDS: Readonly<Record<SlotMark, string>> = {
  wounded: "lightly wounded",
  masked: "masked",
  "no-grenades": "no grenades",
  spent: "out of breath"
}

/** Each army's ranks in a squad, glossed in English on the page, as the vocabulary asks. */
const RANK_GLOSSES: Readonly<Record<Side, string>> = {
  [Side.French]: "Caporal: corporal. Soldat de 1re classe: private first class. Soldat: private.",
  [Side.German]: "Unteroffizier: corporal. Gefreiter: lance-corporal. Musketier: private."
}

function fullName({ name }: Pick<RosterSlot, "name">): string {
  return `${name.rank} ${name.given} ${name.surname}`
}

/**
 * The squad book (S5 in docs/design/interface.md): the squad as a nominal roll, every man with his rank, job, kit and
 * state in full, and below it the men who have fallen or been brought in, with the week and the place. Taking a man
 * from here is the same as his slot's key.
 */
export function createSquadBookPage({
  battle,
  record,
  close
}: {
  readonly battle: () => BattleParts | null
  readonly record: SquadRecord
  readonly close: () => void
}): MenuPage {
  const summary = h("p", "book-summary")
  const roll = h("div", "book-roll")
  roll.setAttribute("role", "table")
  roll.setAttribute("aria-label", "Nominal roll")
  const fallen = h("div", "book-fallen")
  const gloss = h("p", "book-gloss")
  const root = h(
    "div",
    "book-page",
    summary,
    h("h3", "ui-settings-heading", "Nominal roll"),
    roll,
    h("h3", "ui-settings-heading", "The fallen, and the men brought in"),
    fallen,
    gloss
  )

  function row(cells: readonly (string | HTMLElement)[], className: string): HTMLElement {
    const line = h("div", className)
    line.setAttribute("role", "row")
    for (const cell of cells) {
      const each = h("div", "book-cell", cell)
      each.setAttribute("role", className.includes("head") ? "columnheader" : "cell")
      line.append(each)
    }
    return line
  }

  function draw(): void {
    const parts = battle()
    const state = parts?.hud.state
    if (!parts || !state) {
      setText(summary, "The squad book opens once you're in the line.")
      return
    }
    const { sim, squad } = parts
    const standing = state.roster.filter((man) => man.fighting).length
    setText(
      summary,
      `${standing} of ${state.roster.length} men standing. ${state.order.label}${state.order.detail ? `: ${state.order.detail}` : ""}.`
    )
    roll.replaceChildren(
      row(["", "Name and rank", "Job and weapon", "State", "Grenades", "Distance", ""], "book-row book-row--head"),
      ...state.roster.map((man) => {
        const name = h("span", "book-name", fullName(man))
        if (man.controlled) {
          name.append(h("span", "book-you", "you"))
        }
        const words = [STATUS_WORDS[man.status], ...man.marks.map((mark) => MARK_WORDS[mark])]
        const condition = h("span", `book-state book-state--${man.severity}`, [...new Set(words)].join(", "))
        let take: HTMLElement = h("span", "book-take-none", "")
        if (man.fighting && !man.controlled) {
          take = button(
            "Take him",
            () => {
              enqueueCommand(sim, { type: "take-command", squad: squad.id, soldier: man.id })
              close()
            },
            "ui-button book-take"
          )
          take.setAttribute("aria-label", `Take ${fullName(man)}`)
        }
        const grenades = man.fighting ? String(sim.soldiers.grenades.count[man.id] ?? 0) : "–"
        return row(
          [
            h("kbd", "ui-key", String(man.slot)),
            name,
            `${roleLabel(man.role)}, ${weaponName(sim, man.id)}`,
            condition,
            grenades,
            man.distance === null ? "" : metres(man.distance),
            take
          ],
          `book-row${man.fighting ? "" : " book-row--out"}${man.controlled ? " book-row--you" : ""}`
        )
      })
    )
    const entries = record.entries
    fallen.replaceChildren(
      ...(entries.length === 0
        ? [h("p", "book-none", "No man of the squad has fallen.")]
        : entries.map((entry) =>
            h(
              "p",
              `book-entry book-entry--${entry.fate}`,
              h("span", "book-entry-name", `${entry.name.rank} ${entry.name.given} ${entry.name.surname}`),
              `, ${roleLabel(entry.role).toLowerCase()}. ${FATE_LABELS[entry.fate]} ${entry.place}${entry.week === null ? "" : `, ${weekLabel(entry.week).replace(/^Week/, "week")}`}.`
            )
          ))
    )
    setText(gloss, RANK_GLOSSES[squad.side === Side.German ? Side.German : Side.French])
  }

  return {
    id: "squad",
    title: "Squad book",
    root,
    opened: draw,
    tick: draw
  }
}
