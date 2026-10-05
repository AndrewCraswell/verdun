import type { SquadOrder } from "@verdun/sim"
import { h, keyCap, replay, setData, setText, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { icon, type IconName, setIcon } from "../icons.ts"
import { keyOf } from "../keys.ts"
import "./order-plate.css"

/**
 * H6: the squad's order. What the men are doing, where they're going, and how many can't obey: a squad that won't
 * advance because three men are pinned reads as pinned, not broken. A new order flashes in brass. The order keys sit
 * beside it, the current one lit.
 */

const ICONS: Readonly<Record<SquadOrder["kind"], IconName>> = {
  follow: "follow",
  hold: "hold",
  advance: "advance",
  reserve: "dugout",
  creep: "creep",
  raid: "raid",
  "run-to": "advance",
  suppress: "fire-mission",
  withdraw: "arrow",
  "dig-in": "prone",
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
  const followKey = keyCap(keyOf("follow"))
  const holdKey = keyCap(keyOf("hold"))
  const advanceKey = keyCap(keyOf("advance"))
  const follow = h("span", "op-key", followKey, h("span", "op-key__word", "Follow"))
  const hold = h("span", "op-key", holdKey, h("span", "op-key__word", "Hold"))
  const advance = h("span", "op-key", advanceKey, h("span", "op-key__word", "Advance"))
  const keys = h("div", "op-keys", follow, hold, advance)
  const root = h(
    "section",
    "order-plate hud-plate",
    h("div", "op-mark", glyph),
    h("div", "op-text", h("span", "hud-label", "Squad order"), h("div", "op-line", label, detail), issues),
    keys
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
      // Wherever the player has bound them now.
      setText(followKey, keyOf("follow"))
      setText(holdKey, keyOf("hold"))
      setText(advanceKey, keyOf("advance"))
      setIcon(glyph, ICONS[order.kind])
      setText(label, order.label)
      setText(detail, order.detail ?? "")
      setData(root, "kind", order.kind)
      setText(pinned, order.pinned > 0 ? `${order.pinned} pinned` : "")
      setText(broken, order.broken > 0 ? `${order.broken} broken` : "")
      show(pinned, order.pinned > 0)
      show(broken, order.broken > 0)
      show(issues, order.pinned + order.broken > 0)
      setData(follow, "current", order.kind === "follow")
      setData(hold, "current", order.kind === "hold")
      setData(advance, "current", order.kind === "advance")
      if (order.serial !== serial) {
        if (serial >= 0) {
          replay(root, "is-new")
        }
        serial = order.serial
      }
    }
  }
}
