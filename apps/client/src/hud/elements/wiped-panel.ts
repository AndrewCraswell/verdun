import { h, setText, setVar, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import { clockSeconds } from "../format.ts"
import type { HudState } from "../hud-state.ts"
import { icon, type IconName } from "../icons.ts"
import type { SlotStatus } from "../soldier-state.ts"
import "./wiped-panel.css"

/**
 * H17: the squad is gone. A quiet panel, not a death screen: the men who were lost, by name and fate, and the
 * replacements coming up to the rear trench, counted down. The battle stays in view behind it.
 */

const FATES: Readonly<Partial<Record<SlotStatus, readonly [IconName, string]>>> = {
  killed: ["killed", "killed"],
  captured: ["captured", "taken prisoner"],
  down: ["stretcher", "lying wounded"],
  carried: ["carried", "being carried back"],
  "aid-post": ["aid-post", "at the aid post"],
  returned: ["returned", "back in the reserves"],
  hospital: ["hospital", "sent to hospital"]
}

/** Seconds the replacements' countdown ring measures: the longest wait for them (packages/sim/src/reinforcements.ts). */
const LONGEST_WAIT = 90

export const wipedPanel: HudElementFactory = () => {
  const time = h("strong", "wp-time")
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  ring.setAttribute("class", "wp-ring")
  ring.setAttribute("viewBox", "0 0 40 40")
  ring.innerHTML =
    '<circle cx="20" cy="20" r="17" class="wp-ring__track"/><circle cx="20" cy="20" r="17" class="wp-ring__arc" pathLength="1"/>'
  const coming = h("div", "wp-coming")
  const reserves = h("div", "wp-reserves")
  const list = h("ul", "wp-fallen")
  const clock = h("div", "wp-clock", ring, time)
  const root = h(
    "section",
    "wiped-panel hud-plate",
    h("div", "wp-kicker hud-label", "Squad lost"),
    h("h2", "wp-title", "Your squad is gone"),
    h("div", "wp-replacements", clock, h("div", "wp-replacements__text", coming, reserves)),
    h("div", "wp-roll", h("span", "hud-label", "The men of the squad"), list)
  )
  root.setAttribute("role", "status")
  let roll = ""

  return {
    id: "wiped-panel",
    zone: "centre",
    root,
    update(state: HudState) {
      const wiped = state.wiped
      // The handover card has the stage while the last man's fall is told.
      show(root, wiped !== null && state.succession === null)
      if (!wiped) {
        return
      }
      if (wiped.seconds === null) {
        setText(time, "—")
        setText(coming, "No replacements are coming")
        setVar(ring, "--left", 0)
      } else {
        setText(time, clockSeconds(wiped.seconds))
        setText(
          coming,
          wiped.men > 0 ? `${wiped.men} men coming up to the rear trench` : "Replacements coming up to the rear trench"
        )
        setVar(ring, "--left", Math.min(1, wiped.seconds / LONGEST_WAIT))
      }
      setText(reserves, wiped.reserves === null ? "" : `${wiped.reserves} men left in reserve`)
      const names = wiped.fallen.map((man) => `${man.name.surname}:${man.status}`).join()
      if (names !== roll) {
        roll = names
        list.replaceChildren(
          ...wiped.fallen.map((man) => {
            const [glyph, words] = FATES[man.status] ?? ["killed", "lost"]
            return h(
              "li",
              "wp-man",
              icon(glyph, "wp-man__icon"),
              h("span", "wp-man__name", `${man.name.rank} ${man.name.surname}`),
              h("span", "wp-man__fate", words)
            )
          })
        )
      }
    }
  }
}
