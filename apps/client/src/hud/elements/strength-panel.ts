import { h, setText, setVar, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { icon } from "../icons.ts"
import type { Losses } from "../sector-state.ts"
import "./strength-panel.css"

/**
 * H13: what the side has left and what both sides have lost: the men held back to replace wiped-out squads, against
 * the pool they started with, and each side's killed, wounded and captured. The enemy's reserves aren't shown: no
 * soldier would know them. Top right, under the objectives.
 */

function lossRow(side: string): { root: HTMLTableRowElement; cells: HTMLTableCellElement[] } {
  const cells = [h("td", "st-count"), h("td", "st-count"), h("td", "st-count")]
  const head = h("th", "st-side", side)
  head.scope = "row"
  return { root: h("tr", "st-row", head, ...cells), cells }
}

function setLosses(row: ReturnType<typeof lossRow>, losses: Losses): void {
  const [killed, wounded, captured] = row.cells
  if (killed && wounded && captured) {
    setText(killed, String(losses.killed))
    setText(wounded, String(losses.wounded))
    setText(captured, String(losses.captured))
  }
}

export const strengthPanel: HudElementFactory = () => {
  const men = h("strong", "st-men")
  const full = h("span", "st-full")
  const bar = h("div", "hud-bar st-bar", h("div", "hud-bar__fill"))
  const reserves = h(
    "div",
    "st-reserves",
    icon("men", "st-reserves__icon"),
    h("div", "st-reserves__text", h("span", "hud-label", "Reserves"), h("span", "st-reserves__count", men, full)),
    bar
  )
  const ours = lossRow("Ours")
  const theirs = lossRow("Theirs")
  const heading = (name: Parameters<typeof icon>[0], title: string) => {
    const cell = h("th", "st-heading", icon(name, "st-heading__icon"))
    cell.title = title
    cell.scope = "col"
    return cell
  }
  const table = h(
    "table",
    "st-losses",
    h(
      "thead",
      "",
      h(
        "tr",
        "",
        h("th", "st-heading hud-label", "Losses"),
        heading("killed", "Killed"),
        heading("wound", "Wounded"),
        heading("captured", "Captured")
      )
    ),
    h("tbody", "", ours.root, theirs.root)
  )
  ours.root.dataset.side = "ours"
  theirs.root.dataset.side = "theirs"
  const root = h("section", "strength-panel hud-plate", reserves, table)
  root.setAttribute("aria-label", "Reserves and losses")

  return {
    id: "strength-panel",
    zone: "top-right",
    root,
    update(state: HudState) {
      show(root, state.view.overview || state.view.tactical > 0.5)
      const { reserves: pool, ours: ourLosses, theirs: theirLosses } = state.strength
      show(reserves, pool !== null)
      if (pool) {
        setText(men, String(pool.men))
        setText(full, `of ${pool.full}`)
        setVar(bar, "--share", pool.full > 0 ? pool.men / pool.full : 0)
        reserves.dataset.low = String(pool.full > 0 && pool.men / pool.full < 0.25)
      }
      setLosses(ours, ourLosses)
      setLosses(theirs, theirLosses)
    }
  }
}
