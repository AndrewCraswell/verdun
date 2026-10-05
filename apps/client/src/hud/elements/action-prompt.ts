import { h, keyCap, setText, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { keyOf } from "../keys.ts"
import "./action-prompt.css"

/**
 * What the action key would do now, over the head of the man under control: "[Space] Man the gun", "[Space] Climb
 * over". Shown only while there's something to do, so the key is learnt where it matters.
 */

/** Metres above the ground the prompt floats, over a standing man's head. */
const LIFT = 2.4

export const actionPrompt: HudElementFactory = (context) => {
  const key = keyCap(keyOf("act"))
  const label = h("span", "ap-label")
  const root = h("div", "action-prompt", key, label)
  root.setAttribute("aria-live", "polite")
  show(root, false)

  return {
    id: "action-prompt",
    zone: "world",
    root,
    update(state: HudState) {
      const action = state.soldier?.action ?? null
      show(root, action !== null)
      if (action) {
        setText(key, keyOf("act"))
        setText(label, action)
      }
    },
    frame(state: HudState) {
      const soldier = state.soldier
      if (!soldier?.action) {
        return
      }
      const { x, z } = soldier.position
      const point = context.project(x, context.heightAt(x, z) + LIFT, z)
      root.style.visibility = point ? "" : "hidden"
      if (point) {
        root.style.transform = `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px)`
      }
    }
  }
}
