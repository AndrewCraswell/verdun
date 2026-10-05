import { h, keyCap, setText, setVar, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import { clockSeconds } from "../format.ts"
import type { HudState } from "../hud-state.ts"
import { icon, type IconName } from "../icons.ts"
import { keyOf } from "../keys.ts"
import type { SlotStatus } from "../soldier-state.ts"
import type { SquadKit, TakeOverChoice } from "../take-over.ts"
import "./wiped-panel.css"

/**
 * H17: the squad is gone. Not a death screen: the battle goes on behind it, the camera drawn back over the sector. It
 * offers the squads nearby that can be taken over at once (1 to 5 or a click takes one; hovering one looks at it), the
 * replacements coming up to the rear trench as the other way back, counted down, and the men who were lost, by name
 * and fate.
 */

const FATES: Readonly<Partial<Record<SlotStatus, readonly [IconName, string]>>> = {
  killed: ["killed", "killed"],
  captured: ["captured", "taken prisoner"],
  down: ["stretcher", "lying wounded"],
  carried: ["carried", "being carried back"],
  "aid-post": ["aid-post", "at the aid post"],
  returned: ["returned", "back in the reserves"],
  hospital: ["hospital", "sent to hospital"]
}

const KITS: Readonly<Record<SquadKit, readonly [IconName, string]>> = {
  "machine-gun": ["machine-gun", "Machine gun"],
  sniper: ["sniper", "Sniper"],
  grenadier: ["rifle-grenade", "Rifle grenadier"]
}

/** Seconds the replacements' countdown ring measures: the longest wait for them (packages/sim/src/reinforcements.ts). */
const LONGEST_WAIT = 90
/** The camera draws back at least this far over the sector while the squad is lost, in metres. */
const OVER_THE_SECTOR = 110
/** A squad that can no longer be taken over fades out over this long, in milliseconds, rather than vanishing. */
const LEAVING = 450

interface Row {
  readonly squad: number
  readonly root: HTMLElement
  readonly key: HTMLElement
  readonly men: HTMLElement
  readonly kit: HTMLElement
  readonly place: HTMLElement
  readonly order: HTMLElement
  choice: TakeOverChoice
  kitKey: string
  leaving: boolean
}

export const wipedPanel: HudElementFactory = (context) => {
  const time = h("strong", "wp-time")
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  ring.setAttribute("class", "wp-ring")
  ring.setAttribute("viewBox", "0 0 40 40")
  ring.innerHTML =
    '<circle cx="20" cy="20" r="17" class="wp-ring__track"/><circle cx="20" cy="20" r="17" class="wp-ring__arc" pathLength="1"/>'
  const coming = h("div", "wp-coming")
  const reserves = h("div", "wp-reserves")
  const list = h("ul", "wp-fallen")
  const clock = h("div", "wp-clock", ring, time)
  const choices = h("ol", "wp-choices")
  const none = h(
    "p",
    "wp-none",
    "No squad nearby can be handed over: each is in a fight or down to fewer than four men."
  )
  const nearestKey = keyCap(keyOf("take-over"))
  const keys = h(
    "div",
    "wp-keys",
    keyCap("1"),
    "–",
    keyCap("5"),
    h("span", "", " take a squad · "),
    nearestKey,
    h("span", "", " the nearest")
  )
  const takeOver = h("div", "wp-take-over", h("span", "hud-label", "Take over a squad"), choices, none, keys)
  const waitLabel = h("span", "hud-label wp-wait-label", "Or wait for replacements")
  const root = h(
    "section",
    "wiped-panel hud-plate",
    h("div", "wp-kicker hud-label", "Squad lost"),
    h("h2", "wp-title", "Your squad is gone"),
    takeOver,
    h(
      "div",
      "wp-wait",
      waitLabel,
      h("div", "wp-replacements", clock, h("div", "wp-replacements__text", coming, reserves))
    ),
    h("div", "wp-roll", h("span", "hud-label", "The men of the squad"), list)
  )
  root.setAttribute("role", "status")
  let roll = ""
  const rows = new Map<number, Row>()
  let offered = false
  let distanceBefore: number | null = null

  function take(row: Row): void {
    if (!row.leaving) {
      context.takeOverSquad(row.squad)
    }
  }

  function rowFor(choice: TakeOverChoice): Row {
    const key = keyCap("")
    const men = h("span", "wp-choice__men")
    const kit = h("span", "wp-choice__kit")
    const place = h("span", "wp-choice__place")
    const order = h("span", "wp-choice__order")
    const button = h(
      "button",
      "wp-choice",
      key,
      h(
        "span",
        "wp-choice__who",
        h("strong", "wp-choice__name", choice.name),
        h("span", "wp-choice__leader", choice.leader)
      ),
      h("span", "wp-choice__strength", icon("men", "wp-choice__icon"), men, kit),
      h("span", "wp-choice__where", place, order)
    )
    button.type = "button"
    const item = h("li", "wp-choice-row", button)
    const row: Row = {
      squad: choice.squad,
      root: item,
      key,
      men,
      kit,
      place,
      order,
      choice,
      kitKey: "",
      leaving: false
    }
    button.addEventListener("click", () => take(row))
    // Looking at a squad before taking it: the camera swings to its leader.
    const look = () => {
      if (!row.leaving) {
        context.lookAt(row.choice.at.x, row.choice.at.z)
      }
    }
    button.addEventListener("pointerenter", look)
    button.addEventListener("focus", look)
    return row
  }

  function fill(row: Row): void {
    const { choice } = row
    setText(row.men, choice.men === 1 ? "1 man" : `${choice.men} men`)
    const kitKey = choice.kit.join()
    if (kitKey !== row.kitKey) {
      row.kitKey = kitKey
      row.kit.replaceChildren(
        ...choice.kit.map((kit) => {
          const [glyph, words] = KITS[kit]
          const mark = icon(glyph, "wp-choice__icon")
          const holder = h("span", "wp-choice__kit-item", mark)
          holder.title = words
          holder.setAttribute("aria-label", words)
          return holder
        })
      )
    }
    setText(row.place, choice.place)
    setText(row.order, choice.order)
  }

  /** Keeps the rows in the order they came, so none moves under the pointer; gone ones fade out. */
  function offer(next: readonly TakeOverChoice[]): void {
    const wanted = new Map(next.map((choice) => [choice.squad, choice]))
    for (const row of rows.values()) {
      const choice = wanted.get(row.squad)
      if (choice) {
        row.choice = choice
        fill(row)
      } else if (!row.leaving) {
        row.leaving = true
        row.root.classList.add("is-leaving")
        setTimeout(() => {
          row.root.remove()
          rows.delete(row.squad)
        }, LEAVING)
      }
    }
    for (const choice of next) {
      if (!rows.has(choice.squad)) {
        const row = rowFor(choice)
        fill(row)
        rows.set(choice.squad, row)
        choices.append(row.root)
      }
    }
    let number = 0
    for (const row of rows.values()) {
      setText(row.key, row.leaving ? "" : String(++number))
    }
    show(choices, rows.size > 0)
    show(none, next.length === 0)
    show(keys, next.length > 0)
  }

  /** The row a squad key picks: the nth still offered, counting from 1. */
  function numbered(index: number): Row | undefined {
    return [...rows.values()].filter((row) => !row.leaving)[index - 1]
  }

  const onKey = (event: KeyboardEvent) => {
    const digit = /^Digit([1-5])$/.exec(event.code)?.[1]
    if (!offered || !digit || event.repeat) {
      return
    }
    const row = numbered(Number(digit))
    if (row) {
      take(row)
    }
  }
  window.addEventListener("keydown", onKey)

  return {
    id: "wiped-panel",
    zone: "centre",
    root,
    update(state: HudState) {
      const wiped = state.wiped
      // The handover card has the stage while the last man's fall is told.
      const up = wiped !== null && state.succession === null
      show(root, up)
      if (up && !offered) {
        // Drawn back over the sector, to see the squads on offer; put back once the player has men again.
        distanceBefore = context.cameraDistance()
        context.setCameraDistance(Math.max(distanceBefore, OVER_THE_SECTOR))
      } else if (!up && offered && distanceBefore !== null) {
        context.setCameraDistance(distanceBefore)
        distanceBefore = null
      }
      offered = up
      if (!wiped) {
        if (rows.size > 0) {
          rows.clear()
          choices.replaceChildren()
        }
        return
      }
      offer(wiped.choices)
      setText(nearestKey, keyOf("take-over"))
      if (wiped.seconds === null) {
        setText(time, "—")
        setText(coming, "No replacements are coming")
        setVar(ring, "--left", 0)
      } else {
        setText(time, clockSeconds(wiped.seconds))
        setText(
          coming,
          wiped.men > 0 ? `${wiped.men} men coming up to the rear trench` : "Replacements coming up to the rear trench"
        )
        setVar(ring, "--left", Math.min(1, wiped.seconds / LONGEST_WAIT))
      }
      setText(waitLabel, wiped.choices.length > 0 ? "Or wait for replacements" : "Replacements")
      setText(reserves, wiped.reserves === null ? "" : `${wiped.reserves} men left in reserve`)
      const names = wiped.fallen.map((man) => `${man.name.surname}:${man.status}`).join()
      if (names !== roll) {
        roll = names
        list.replaceChildren(
          ...wiped.fallen.map((man) => {
            const [glyph, words] = FATES[man.status] ?? ["killed", "lost"]
            return h(
              "li",
              "wp-man",
              icon(glyph, "wp-man__icon"),
              h("span", "wp-man__name", `${man.name.rank} ${man.name.surname}`),
              h("span", "wp-man__fate", words)
            )
          })
        )
      }
    },
    dispose() {
      window.removeEventListener("keydown", onKey)
    }
  }
}
