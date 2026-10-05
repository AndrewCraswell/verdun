import { h, setData, setText, setVar, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import { clockSeconds } from "../format.ts"
import type { HudState } from "../hud-state.ts"
import "./operation-clock.css"

/**
 * The operation's countdown, at the top of the screen: "Attack in 6:32" until zero hour, "Hold 12:10" after it, and how
 * it went once it's over. Counted from now, never by the clock, with a thin bar for how far through the wait or the hold
 * it is, and a few words when the guns are firing. The last minute before the attack draws the eye.
 */

/** In the last this many seconds before the attack, the countdown is urgent. */
const URGENT = 60

export const operationClock: HudElementFactory = () => {
  const label = h("span", "oc-label hud-label")
  const time = h("strong", "oc-time")
  const note = h("span", "oc-note")
  const fill = h("div", "oc-bar__fill")
  const root = h(
    "section",
    "operation-clock hud-plate",
    h("div", "oc-line", label, time),
    note,
    h("div", "oc-bar", fill)
  )
  root.setAttribute("role", "timer")

  return {
    id: "operation-clock",
    zone: "top-centre",
    root,
    update(state: HudState) {
      const operation = state.operation
      show(root, operation !== null)
      if (!operation) {
        return
      }
      setData(root, "phase", operation.phase)
      setData(root, "urgent", operation.phase === "before" && (operation.seconds ?? Infinity) <= URGENT)
      setText(label, operation.label)
      setText(time, operation.seconds === null ? "" : clockSeconds(operation.seconds))
      setText(note, operation.note ?? "")
      show(note, operation.note !== null)
      setVar(fill, "--done", operation.progress)
      root.setAttribute(
        "aria-label",
        operation.seconds === null
          ? `Operation over: ${operation.note ?? ""}`
          : `${operation.label} ${clockSeconds(operation.seconds)}`
      )
    }
  }
}
