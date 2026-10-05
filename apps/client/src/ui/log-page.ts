import type { LogKind } from "../hud/battle-log.ts"
import { h } from "../hud/dom.ts"
import type { LogHistory } from "./log-history.ts"
import type { MenuPage } from "./page.ts"

/** The kinds of line, marked by a word as well as a colour. */
const KIND_WORDS: Readonly<Record<LogKind, string>> = {
  alarm: "Alarm",
  squad: "Squad",
  sector: "Sector",
  fire: "Guns",
  weather: "Weather"
}

/** The battle log's history (H14 in docs/design/interface.md): the last hour's lines, newest first, with their hour. */
export function createLogPage(history: LogHistory): MenuPage {
  const list = h("ol", "log-history")
  const root = h(
    "div",
    "log-page",
    h("p", "ui-controls-intro", "What the battle log said in the last hour of the battle, newest first."),
    list
  )

  function draw(): void {
    const lines = history.lines
    list.replaceChildren(
      ...(lines.length === 0
        ? [h("li", "log-history-none", "Nothing yet.")]
        : lines.map(({ message, hour }) =>
            h(
              "li",
              `log-history-line${message.alarm ? " log-history-line--alarm" : ""}`,
              h("span", "log-history-hour", hour),
              h("span", "log-history-kind", message.alarm ? "Alarm" : KIND_WORDS[message.kind]),
              h("span", "log-history-text", message.text)
            )
          ))
    )
  }

  return { id: "log", title: "Battle log", root, opened: draw, tick: draw }
}
