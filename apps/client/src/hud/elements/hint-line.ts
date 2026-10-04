import { h, setText, show, withKeys } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import "./hint-line.css"

/**
 * H18: teaching by doing. One short prompt at a time above the bottom edge, keys drawn as key caps, gone as soon as the
 * player does what it says.
 */
export const hintLine: HudElementFactory = () => {
  const step = h("span", "hl-step")
  const text = h("span", "hl-text")
  const root = h("div", "hint-line hud-plate", step, text)
  root.setAttribute("role", "status")
  let shown: string | null = null

  return {
    id: "hint-line",
    zone: "bottom-centre",
    root,
    update(state: HudState) {
      const hint = state.hint
      show(root, hint !== null)
      if (!hint || hint.id === shown) {
        return
      }
      shown = hint.id
      setText(step, hint.step ? `${hint.step.index} / ${hint.step.of}` : "Note")
      text.replaceChildren(withKeys(hint.text))
      root.classList.remove("is-in")
      void root.offsetWidth
      root.classList.add("is-in")
    }
  }
}
