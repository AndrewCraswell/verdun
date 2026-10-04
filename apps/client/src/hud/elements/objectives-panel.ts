import { h, replay, setData, setText, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import { metres } from "../format.ts"
import type { HudState } from "../hud-state.ts"
import { icon } from "../icons.ts"
import type { Holder, ObjectiveView } from "../sector-state.ts"
import "./objectives-panel.css"

/**
 * H12: the sector's objectives, who holds each (by shape as well as side colour: ours a diamond, theirs a square,
 * nobody's an open ring), which are contested, and how far and which way each lies from the man under control, the
 * arrow turning with the camera. Over them, the share of the sector each side holds. Top right.
 */

const HOLDERS: Readonly<Record<Holder, string>> = { ours: "Ours", theirs: "Theirs", none: "" }

interface Row {
  readonly root: HTMLLIElement
  readonly name: HTMLElement
  readonly holder: HTMLElement
  readonly arrow: SVGSVGElement
  readonly distance: HTMLElement
  objective: ObjectiveView | null
  held: Holder | null
}

export const objectivesPanel: HudElementFactory = (context) => {
  const held = h("span", "ob-held")
  const ours = h("span", "ob-control__ours")
  const theirs = h("span", "ob-control__theirs")
  const control = h("div", "ob-control", ours, theirs)
  const list = h("ol", "ob-list")
  const root = h(
    "section",
    "objectives-panel hud-plate",
    h("header", "ob-head", h("span", "hud-label hud-label--brass", "Sector objectives"), held),
    control,
    list
  )
  root.setAttribute("aria-label", "Objectives")
  const rows: Row[] = []
  const angles = new Map<Row, number>()

  function makeRow(): Row {
    const name = h("span", "ob-name")
    const holder = h("span", "ob-holder")
    const arrow = icon("arrow", "ob-arrow")
    const distance = h("span", "ob-distance")
    const root = h(
      "li",
      "ob-row",
      h("span", "ob-glyph"),
      h("span", "ob-text", name, holder),
      h("span", "ob-where", arrow, distance)
    )
    return { root, name, holder, arrow, distance, objective: null, held: null }
  }

  return {
    id: "objectives-panel",
    zone: "top-right",
    root,
    update(state: HudState) {
      const { objectives, control: share } = state.sector
      const wanted = state.view.overview || state.view.tactical > 0.5 || state.attention.objectives
      show(root, objectives.length > 0 && wanted)
      while (rows.length < objectives.length) {
        const row = makeRow()
        rows.push(row)
        list.append(row.root)
      }
      objectives.forEach((objective, index) => {
        const row = rows[index]
        if (!row) {
          return
        }
        row.objective = objective
        setText(row.name, objective.name)
        setText(row.holder, objective.contested ? "Contested" : HOLDERS[objective.holder])
        setData(row.root, "holder", objective.holder)
        setData(row.root, "contested", objective.contested)
        setText(row.distance, objective.distance === null ? "" : metres(objective.distance))
        if (row.held !== null && row.held !== objective.holder) {
          replay(row.root, "is-changed")
        }
        row.held = objective.holder
      })
      const ourCount = objectives.filter((objective) => objective.holder === "ours").length
      setText(held, `${ourCount} of ${objectives.length} held`)
      ours.style.setProperty("--share", share.ours.toFixed(3))
      theirs.style.setProperty("--share", share.theirs.toFixed(3))
    },
    frame(state) {
      const from = state.soldier?.position
      for (const row of rows) {
        const objective = row.objective
        if (!objective || !from) {
          continue
        }
        const angle = context.screenAngle(from.x, from.z, objective.x - from.x, objective.z - from.z)
        if (Math.abs((angles.get(row) ?? Number.NaN) - angle) > 0.003 || !angles.has(row)) {
          angles.set(row, angle)
          row.arrow.style.transform = `rotate(${angle.toFixed(3)}rad)`
        }
      }
    }
  }
}
