import type { SquadOrder } from "@verdun/sim"
import { h, replay, setData, setText, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { icon, type IconName, setIcon } from "../icons.ts"
import "./order-plate.css"

/**
 * H6: the squad's order. What the men are doing, where they're going, and how many can't obey: a squad that won't
 * advance because three men are pinned reads as pinned, not broken. A new order flashes in brass. The keys aren't
 * listed: the orders wheel shows them, and the controls.
 */

const ICONS: Readonly<Record<SquadOrder["kind"], IconName>> = {
  follow: "follow",
  hold: "hold",
  advance: "advance",
  reserve: "dugout",
  creep: "creep",
  raid: "raid",
  "run-to": "run-to",
  suppress: "suppress",
  withdraw: "withdraw",
  "dig-in": "dig-in",
  rally: "pennant"
}

export const orderPlate: HudElementFactory = () => {
  const glyph = icon("hold", "op-icon")
  const label = h("strong", "op-label")
  const detail = h("span", "op-detail")
  const pinned = h("span", "op-issue")
  pinned.dataset.severity = "caution"
  const broken = h("span", "op-issue")
  broken.dataset.severity = "danger"
  const issues = h("div", "op-issues", pinned, broken)
  const root = h(
    "section",
    "order-plate hud-plate",
    h("div", "op-mark", glyph),
    h("div", "op-text", h("span", "hud-label", "Squad order"), h("div", "op-line", label, detail), issues)
  )
  root.setAttribute("aria-label", "Squad order")
  let serial = -1

  return {
    id: "order-plate",
    zone: "bottom-left",
    root,
    update(state: HudState) {
      const { order } = state
      const anyone = state.roster.some((slot) => slot.fighting)
      show(root, anyone)
      if (!anyone) {
        return
      }
      setIcon(glyph, ICONS[order.kind])
      setText(label, order.label)
      setText(detail, order.detail ?? "")
      setData(root, "kind", order.kind)
      setText(pinned, order.pinned > 0 ? `${order.pinned} pinned` : "")
      setText(broken, order.broken > 0 ? `${order.broken} broken` : "")
      show(pinned, order.pinned > 0)
      show(broken, order.broken > 0)
      show(issues, order.pinned + order.broken > 0)
      if (order.serial !== serial) {
        if (serial >= 0) {
          replay(root, "is-new")
        }
        serial = order.serial
      }
    }
  }
}
