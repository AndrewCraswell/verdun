import type { WarDay } from "@verdun/sim"
import { weekLabel } from "../environment/war-labels.ts"
import { h, setText } from "../hud/dom.ts"
import geography from "./front/front-geography.json"
import { FRONT_LINES, OPEN_SECTOR, seasonPhase, VERDUN_BEFORE_THE_BATTLE } from "./front/front.ts"
import { boxOf, offsetLine, pathOf, pointsOf, project } from "./front/projection.ts"
import { weekAtVerdun } from "./front/verdun-1916.ts"

/** How long the screen fades out over, in milliseconds: the CSS transition's length. */
const FADE = 700

export interface LoadingScreen {
  readonly shown: boolean
  show(): void
  /** What the loading is doing now, and how far along it is, 0 to 1. */
  progress(step: string, share: number): void
  /** The week being fought, for the title and the line of history. */
  date(day: WarDay | null): void
  /** The renderer drawing the battle, said quietly when it isn't the preferred one. */
  renderer(name: string | null): void
  /** Fades the screen out over the battle; settles once it's gone. */
  finish(): Promise<void>
  dispose(): void
}

/**
 * Verdun's ground drawn faintly behind the title: the Meuse, and the two lines either side of no man's land. The front
 * door draws it too.
 */
export function verdunSketch(): SVGSVGElement {
  const namespace = "http://www.w3.org/2000/svg"
  const box = boxOf([5.05, 49.08, 5.72, 49.34])
  const sketch = document.createElementNS(namespace, "svg")
  sketch.setAttribute("class", "ui-loading-map")
  sketch.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`)
  sketch.setAttribute("preserveAspectRatio", "xMidYMid slice")
  sketch.setAttribute("aria-hidden", "true")
  const path = (className: string, d: string) => {
    const each = document.createElementNS(namespace, "path")
    each.setAttribute("class", className)
    each.setAttribute("d", d)
    sketch.append(each)
  }
  for (const river of geography.rivers) {
    for (const line of river.lines) {
      path("ui-loading-river", pathOf(pointsOf(line).map(project)))
    }
  }
  const line = FRONT_LINES[1916].points.map(project)
  path("ui-loading-line ui-loading-line--before", pathOf(VERDUN_BEFORE_THE_BATTLE.map(project)))
  path("ui-loading-line ui-loading-line--theirs", pathOf(offsetLine(line, -0.1)))
  path("ui-loading-line ui-loading-line--ours", pathOf(offsetLine(line, 0.1)))
  return sketch
}

/**
 * The loading screen (S6 in docs/design/interface.md), over the battle as it comes up and as the player goes into the
 * line: the sector and the week, a line of what happened at Verdun that week, and the loading's progress, honestly,
 * step by step. It fades into the battle once the battle is drawing.
 */
export function createLoadingScreen(parent: HTMLElement): LoadingScreen {
  const where = h("div", "ui-loading-where")
  const history = h("p", "ui-loading-history")
  const step = h("div", "ui-loading-step", "Bringing up the battle")
  const fill = h("div", "ui-loading-fill")
  const bar = h("div", "ui-loading-bar", fill)
  bar.setAttribute("role", "progressbar")
  bar.setAttribute("aria-valuemin", "0")
  bar.setAttribute("aria-valuemax", "100")
  const note = h("p", "ui-loading-note")
  const root = h(
    "div",
    "ui-loading",
    verdunSketch(),
    h(
      "div",
      "ui-loading-card",
      h("div", "ui-kicker", "Joining the battle"),
      h("h1", "ui-loading-title", OPEN_SECTOR.name),
      where,
      history,
      h("div", "ui-loading-progress", bar, step)
    ),
    note
  )
  root.setAttribute("role", "status")
  root.setAttribute("aria-live", "polite")
  root.hidden = true
  parent.append(root)
  setText(where, "Verdun, the right bank")
  let shown = false

  return {
    get shown() {
      return shown
    },
    show() {
      shown = true
      root.hidden = false
      root.classList.remove("ui-loading--leaving")
    },
    progress(text, share) {
      const clamped = Math.min(1, Math.max(0, share))
      setText(step, text)
      fill.style.transform = `scaleX(${clamped.toFixed(3)})`
      bar.setAttribute("aria-valuenow", String(Math.round(clamped * 100)))
    },
    date(day) {
      if (day?.phase !== "turn") {
        return
      }
      setText(where, `Verdun, the right bank, ${weekLabel(day.week).replace(/^Week/, "week")}`)
      setText(history, weekAtVerdun(day.week) ?? seasonPhase(day.season, day.turn) ?? "")
    },
    renderer(name) {
      setText(
        note,
        name === "WebGL" ? "Drawing with WebGL: this browser has no WebGPU, or the options chose WebGL." : ""
      )
    },
    finish() {
      if (!shown) {
        return Promise.resolve()
      }
      root.classList.add("ui-loading--leaving")
      return new Promise((resolve) => {
        setTimeout(() => {
          shown = false
          root.hidden = true
          resolve()
        }, FADE)
      })
    },
    dispose() {
      root.remove()
    }
  }
}
