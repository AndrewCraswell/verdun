import { h } from "../hud/dom.ts"
import { metres } from "../hud/format.ts"
import { button } from "./fields.ts"
import { OPEN_SECTOR } from "./front/front.ts"
import type { JoinChoice, JoinChoices } from "./join.ts"
import type { MenuPage } from "./page.ts"
import "./join-page.css"

/**
 * The join screen (S8 in docs/design/interface.md): how the player gets into the sector, in the order the design
 * gives. The squad held for them; another squad in the line to take over; an operation to join; a fresh squad from
 * the reserve line. Choosing one goes into the line with it.
 */
export function createJoinPage({
  choices: choose,
  join
}: {
  /** The choices of squad, once the battle has mustered them. */
  readonly choices: () => JoinChoices | null
  /** Goes into the line leading this squad: the one held for the player, or another to take in its place. */
  readonly join: (squad: number) => void
}): MenuPage {
  const body = h("div", "join-body")
  const root = h(
    "div",
    "join-page",
    h("p", "join-intro", `${OPEN_SECTOR.name}, on Verdun's right bank. Choose the men you'll lead into the line.`),
    body
  )

  function details(choice: JoinChoice): HTMLElement {
    // In words, as a sentence: "8 men, holding its stretch of trench near Fleury crossroads, 85 m from the enemy's line".
    const order = choice.order.charAt(0).toLowerCase() + choice.order.slice(1)
    const distance = choice.fromEnemy === null ? "" : `, ${metres(choice.fromEnemy)} from the enemy's line`
    return h("span", "join-facts", `${choice.men} men, ${order} ${choice.place}${distance}`)
  }

  function row(choice: JoinChoice, action: string): HTMLElement {
    const item = h(
      "div",
      `join-row${choice.refusal ? " join-row--refused" : ""}`,
      h("span", "join-name", choice.name),
      details(choice)
    )
    if (choice.refusal) {
      item.append(h("span", "join-refusal", choice.refusal))
    } else {
      const take = button(action, () => join(choice.squad), "ui-button join-take")
      take.setAttribute("aria-label", `${action}: ${choice.name}, ${choice.place}`)
      item.append(take)
    }
    return item
  }

  function section(title: string, note: string, ...rows: HTMLElement[]): HTMLElement {
    return h(
      "section",
      "ui-settings-section join-section",
      h("h3", "ui-settings-heading", title),
      h("p", "join-note", note),
      ...rows
    )
  }

  function draw(): void {
    const choices = choose()
    if (!choices) {
      body.replaceChildren(h("p", "join-waiting", "Mustering the sector's squads…"))
      return
    }
    const held = h(
      "div",
      "join-held",
      h("span", "join-name", choices.held.name),
      details(choices.held),
      button("Lead them", () => join(choices.held.squad), "ui-button ui-button--primary join-lead")
    )
    body.replaceChildren(
      section("The squad held for you", "Eight men in the front line, waiting for their corporal.", held),
      section(
        "Take over a squad in the line",
        "A squad of our side with four men or more, and none of them in contact. Nearest the enemy first.",
        ...(choices.line.length > 0
          ? choices.line.map((choice) => row(choice, "Take over"))
          : [h("p", "join-none", "None free.")])
      ),
      section(
        "Join an operation",
        "Operations are planned attacks with a zero hour and waves.",
        h(
          "p",
          "join-none",
          "None is planned in this sector yet. Once in the line, G blows the whistle for every squad to go over behind a creeping barrage."
        )
      ),
      section(
        "Bring up a fresh squad",
        "A squad rested in the reserve line's dugouts, a walk behind the front.",
        ...(choices.reserve.length > 0
          ? choices.reserve.map((choice) => row(choice, "Bring them up"))
          : [h("p", "join-none", "The reserve line is empty.")])
      )
    )
  }

  return {
    id: "join",
    title: "Join the battle",
    root,
    opened() {
      draw()
      root.querySelector<HTMLElement>(".join-lead")?.focus()
    },
    tick() {
      // Keep focus where it is if the list hasn't changed; redraw only while waiting for the squads.
      if (!body.querySelector(".join-held")) {
        draw()
      }
    }
  }
}
