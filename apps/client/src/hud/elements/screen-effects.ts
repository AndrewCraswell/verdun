import { h, setVar } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import "./screen-effects.css"

/**
 * E1-E8: how the man under control's state feels, over the whole picture. Rounds landing close darken the edges in;
 * a wound pulses slowly at them; gas tints them; the mask narrows the view to its two lenses; a close burst throws dust
 * across it; failing morale drains its colour; the fall dims it. All subtle, since the player aims through them, and
 * all scaled by the player's effects setting. No red screen, no blood on the lens.
 */
export const screenEffects: HudElementFactory = (context) => {
  const root = h(
    "div",
    "screen-effects",
    h("div", "sfx sfx--suppression"),
    h("div", "sfx sfx--wound"),
    h("div", "sfx sfx--gas"),
    h("div", "sfx sfx--mask"),
    h("div", "sfx sfx--burst"),
    h("div", "sfx sfx--fallen")
  )
  root.setAttribute("aria-hidden", "true")
  let filter = ""

  return {
    id: "screen-effects",
    zone: "screen",
    root,
    update(state: HudState) {
      const { screen } = state
      setVar(root, "--suppression", screen.suppression, 2)
      setVar(root, "--wound", screen.wounded, 2)
      setVar(root, "--gas", screen.gas, 2)
      setVar(root, "--mask", screen.mask, 2)
      setVar(root, "--burst", screen.burst, 2)
      setVar(root, "--fallen", screen.fallen, 2)
      root.classList.toggle("is-wounded", screen.wounded > 0)
      // Colour drains from the battlefield itself as morale goes, and as the man falls.
      const saturation = 1 - 0.5 * screen.shaken - 0.75 * screen.fallen
      const brightness = 1 - 0.25 * screen.fallen
      const next =
        saturation > 0.995 && brightness > 0.995
          ? ""
          : `saturate(${saturation.toFixed(2)}) brightness(${brightness.toFixed(2)})`
      if (next !== filter && context.canvas) {
        filter = next
        context.canvas.style.filter = next
      }
    },
    dispose() {
      if (context.canvas) {
        context.canvas.style.filter = ""
      }
    }
  }
}
