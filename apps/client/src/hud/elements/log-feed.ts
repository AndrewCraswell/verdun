import { Side } from "@verdun/sim"
import type { LogKind } from "../battle-log.ts"
import { h, replay, setData, setText, setVar } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { icon, type IconName } from "../icons.ts"
import "./log-feed.css"

/**
 * H14: the battle log, top centre. The newest line on top; each line marked by its kind (bad news, the squad's own
 * men, the sector, the guns, the sky), fading as it ages. Lines that merge a count ("4 prisoners taken") flash as it
 * grows. No kill feed.
 */

/** Lines shown at once. */
const SHOWN = 4
/** Seconds a line stays at full strength before it starts to fade. */
const FRESH = 7
/** Seconds a line takes to go once the log drops it. */
const LEAVING = 360

function kindIcon(kind: LogKind, side: Side): IconName {
  switch (kind) {
    case "alarm":
      return "alarm"
    case "squad":
      return side === Side.German ? "helmet-german" : "helmet-french"
    case "sector":
      return "pennant"
    case "fire":
      return "burst"
    case "weather":
      return "overcast"
  }
}

interface Line {
  readonly root: HTMLLIElement
  readonly text: HTMLElement
}

export const logFeed: HudElementFactory = () => {
  const root = h("ol", "log-feed")
  root.setAttribute("aria-label", "Battle log")
  root.setAttribute("aria-live", "polite")
  const lines = new Map<number, Line>()

  return {
    id: "log-feed",
    zone: "top-centre",
    root,
    update(state: HudState) {
      const shown = state.log.slice(-SHOWN)
      const keep = new Set(shown.map((message) => message.id))
      for (const [id, line] of lines) {
        if (!keep.has(id)) {
          lines.delete(id)
          line.root.classList.add("is-leaving")
          window.setTimeout(() => line.root.remove(), LEAVING)
        }
      }
      for (const message of shown) {
        let line = lines.get(message.id)
        if (!line) {
          const text = h("span", "lf-text")
          line = {
            root: h("li", "lf-line", h("span", "lf-mark", icon(kindIcon(message.kind, state.side), "lf-icon")), text),
            text
          }
          lines.set(message.id, line)
          root.prepend(line.root)
        } else if (line.text.textContent !== message.text) {
          replay(line.root, "is-updated")
        }
        setText(line.text, message.text)
        setData(line.root, "kind", message.kind)
        setData(line.root, "alarm", message.alarm)
        const age = (state.tick - message.tick) / state.tickRate
        setVar(line.root, "--fade", Math.min(1, Math.max(0, (age - FRESH) / (20 - FRESH))), 2)
      }
    }
  }
}
