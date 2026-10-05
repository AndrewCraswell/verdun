import { h, setData, setText, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import type { Fate } from "../succession.ts"
import "./handover-card.css"

/**
 * H16: the man under control falls, and the next takes over. A short, plain beat in the middle of the screen: who went
 * down and how, then who you are now. Never a respawn screen; the fight goes on behind it.
 */

const FATES: Readonly<Record<Fate, string>> = {
  killed: "Killed",
  "badly wounded": "Badly wounded",
  "taken prisoner": "Taken prisoner"
}

/** Where in the handover the card turns from the fallen man to the next. */
const TURN = 0.42

export const handoverCard: HudElementFactory = () => {
  const fallenFate = h("div", "ho-kicker")
  const fallenName = h("div", "ho-name")
  const fallen = h("div", "ho-face ho-face--fallen", fallenFate, fallenName)
  const nextName = h("div", "ho-name")
  const nextRole = h("div", "ho-role")
  const next = h("div", "ho-face ho-face--next", h("div", "ho-kicker", "You are now"), nextName, nextRole)
  const root = h("div", "handover-card", fallen, next)
  root.setAttribute("role", "status")
  let shown = -1

  return {
    id: "handover-card",
    zone: "centre",
    root,
    update(state: HudState) {
      const handover = state.succession
      show(root, handover !== null)
      if (!handover) {
        return
      }
      if (handover.id !== shown) {
        shown = handover.id
        root.classList.remove("is-in")
        void root.offsetWidth
        root.classList.add("is-in")
      }
      const { name, fate } = handover.fallen
      setText(fallenFate, FATES[fate])
      setText(fallenName, `${name.rank} ${name.surname}`)
      setData(root, "fate", fate.replace(" ", "-"))
      const turned = handover.next !== null && handover.progress >= TURN
      setData(root, "turned", turned)
      if (handover.next) {
        setText(nextName, `${handover.next.name.rank} ${handover.next.name.surname}`)
        setText(nextRole, `${handover.next.role}, slot ${handover.next.slot}`)
      }
      root.classList.toggle("is-leaving", handover.progress > 0.9)
    }
  }
}
