import { h } from "../hud/dom.ts"
import { button } from "./fields.ts"
import type { Report } from "./operation-report.ts"
import type { MenuPage } from "./page.ts"
import "./operation-pages.css"

/** The defenders' machine gunners put down, as each side tells it. */
function gunners({ gunnersDown, defending }: Report): string {
  const count = gunnersDown === 1 ? "1" : String(gunnersDown)
  return defending
    ? `${count} of our machine gunners put out of the fight along the front.`
    : `${count} German machine gunner${gunnersDown === 1 ? "" : "s"} put out of the fight along the front.`
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
        h("p", "op-note", `After ${now.lasted.replace(/ min$/, " minutes")}.`)
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
      h(
        "h3",
        "ui-settings-heading",
        now.defending ? "Their killed and wounded, by cause" : "Our killed and wounded, by cause"
      ),
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
                `${objective.name}, taken by ${objective.by === "ours" ? "us" : "them"} after ${objective.after}`
              )
            ))
      ),
      h("h3", "ui-settings-heading", "Your squad"),
      h(
        "p",
        "op-squad",
        `${now.squad.lost === 1 ? "1 man" : `${now.squad.lost} men`} lost; ${now.squad.downed} of the enemy put down. ${gunners(now)}`
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
