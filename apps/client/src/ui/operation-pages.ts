import { h, setText } from "../hud/dom.ts"
import { button } from "./fields.ts"
import type { Briefing, Report } from "./operation-report.ts"
import type { MenuPage } from "./page.ts"
import "./operation-pages.css"

/**
 * The briefing before going in (docs/design/operations.md, "The playtest operation"): the date and hour, the plan in
 * three lines, the player's squad and its place, and what counts as taken, a footing or repulsed. Then up the line.
 */
export function createBriefingPage({
  briefing,
  dateline,
  go,
  back
}: {
  readonly briefing: () => Briefing | null
  /** "Week of 20 June 1916, 07:00". */
  readonly dateline: () => string
  readonly go: () => void
  readonly back: () => void
}): MenuPage {
  const date = h("p", "op-dateline")
  const plan = h("ol", "op-plan")
  const squad = h("p", "op-squad")
  const outcomes = h("dl", "op-outcomes")
  const goButton = button("Go up the line", go, "ui-button ui-button--primary op-go")
  const root = h(
    "div",
    "op-page",
    date,
    h("h3", "ui-settings-heading", "The plan"),
    plan,
    h("h3", "ui-settings-heading", "Your squad"),
    squad,
    h("h3", "ui-settings-heading", "The result"),
    outcomes,
    h("div", "op-actions", goButton, button("Choose another squad", back, "ui-button"))
  )
  return {
    id: "briefing",
    title: "Briefing",
    root,
    opened() {
      const now = briefing()
      setText(date, dateline())
      if (!now) {
        return
      }
      plan.replaceChildren(...now.plan.map((line) => h("li", "op-plan-line", line)))
      setText(squad, now.firstWave ? `${now.squad} You go over with the first wave.` : now.squad)
      outcomes.replaceChildren(
        ...now.outcomes.flatMap((outcome) => [
          h("dt", `op-outcome op-outcome--${outcome.result}`, outcome.label),
          h("dd", "op-outcome-means", outcome.means)
        ])
      )
      goButton.focus()
    }
  }
}

/** The report at the end: the result, both sides' losses, ours by cause, the objectives, the squad. */
export function createReportPage({
  report,
  again,
  frontDoor
}: {
  readonly report: () => Report | null
  readonly again: () => void
  readonly frontDoor: () => void
}): MenuPage {
  const body = h("div", "op-report")
  const againButton = button("Fight again", again, "ui-button ui-button--primary")
  const root = h(
    "div",
    "op-page",
    body,
    h("div", "op-actions", againButton, button("Front door", frontDoor, "ui-button"))
  )

  function draw(): void {
    const now = report()
    if (!now) {
      body.replaceChildren(h("p", "op-note", "The operation is still going on."))
      return
    }
    const sideRows = now.sides.map((side) =>
      h(
        "tr",
        `op-side op-side--${side.side}`,
        h("th", "", side.label),
        h("td", "", String(side.engaged)),
        h("td", "", String(side.killed)),
        h("td", "", side.returned > 0 ? `${side.wounded}, ${side.returned} back to duty` : String(side.wounded)),
        h("td", "", String(side.captured))
      )
    )
    const most = Math.max(1, ...now.causes.map((cause) => cause.count))
    body.replaceChildren(
      h(
        "header",
        `op-result op-result--${now.result}`,
        h("div", "op-result-title", now.title),
        h("p", "op-result-line", now.line),
        h("p", "op-note", `Over at ${now.endedAt}.`)
      ),
      h("h3", "ui-settings-heading", "Losses"),
      h(
        "table",
        "op-losses",
        h(
          "thead",
          "",
          h(
            "tr",
            "",
            h("th", "", ""),
            h("th", "", "In the fight"),
            h("th", "", "Killed"),
            h("th", "", "Wounded"),
            h("th", "", "Captured")
          )
        ),
        h("tbody", "", ...sideRows)
      ),
      h("h3", "ui-settings-heading", "Our killed and wounded, by cause"),
      h(
        "div",
        "op-causes",
        ...(now.causes.length === 0
          ? [h("p", "op-note", "None.")]
          : now.causes.map((cause) => {
              const bar = h("span", "op-cause-bar")
              bar.style.setProperty("--share", (cause.count / most).toFixed(3))
              return h(
                "div",
                "op-cause",
                h("span", "op-cause-label", cause.label),
                bar,
                h("span", "op-cause-count", String(cause.count))
              )
            }))
      ),
      h("h3", "ui-settings-heading", "Objectives"),
      h(
        "div",
        "op-objectives",
        ...(now.objectives.length === 0
          ? [h("p", "op-note", "None changed hands.")]
          : now.objectives.map((objective) =>
              h(
                "p",
                `op-objective op-objective--${objective.by}`,
                `${objective.name}, taken by ${objective.by === "ours" ? "us" : "them"} at ${objective.at}`
              )
            ))
      ),
      h("h3", "ui-settings-heading", "Your squad"),
      h(
        "p",
        "op-squad",
        `${now.squad.lost === 1 ? "1 man" : `${now.squad.lost} men`} lost; ${now.squad.downed} of the enemy put down. ${
          now.gunnersDown === 1 ? "1 German machine gunner" : `${now.gunnersDown} German machine gunners`
        } put out of the fight along the front.`
      )
    )
  }

  return {
    id: "report",
    title: "Report",
    root,
    opened() {
      draw()
      againButton.focus()
    },
    tick: draw
  }
}
