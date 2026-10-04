import { h, setData, setText } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { icon, type IconName } from "../icons.ts"
import "./effects-list.css"

/**
 * H2: every condition acting on the man under control, each an icon with its reason in a soldier's words. A new one
 * shows its reason for a few seconds, then folds to its icon; hovering the column opens them all again. Beside the
 * soldier card, worst at the bottom.
 */

const ICONS: Readonly<Record<string, IconName>> = {
  mask: "mask",
  gas: "gas",
  pinned: "pinned",
  "under-fire": "under-fire",
  broken: "broken",
  shaken: "shaken",
  wounded: "wound",
  wire: "wire",
  flare: "flare",
  spent: "breath",
  winded: "breath",
  masked: "mask",
  mud: "mud",
  night: "moon",
  fog: "fog",
  rain: "rain",
  snow: "snowfall",
  parapet: "parapet",
  dugout: "dugout"
}

/** Effects shown at once; the rest fold into a count. */
const MOST = 6
/** Milliseconds a new effect shows its reason before folding to its icon. */
const FRESH = 4500
/** Milliseconds a lifted effect takes to fade before it goes. */
const LEAVING = 320

interface Chip {
  readonly root: HTMLLIElement
  readonly reason: HTMLElement
  readonly since: number
}

export const effectsList: HudElementFactory = () => {
  const root = h("ul", "effects-list")
  root.setAttribute("aria-label", "What's acting on your soldier")
  const more = h("li", "fx-more")
  const chips = new Map<string, Chip>()

  function chipFor(id: string, now: number): Chip {
    const reason = h("span", "fx-chip__reason")
    const disc = h("span", "fx-chip__disc", icon(ICONS[id] ?? "alarm", "fx-chip__icon"))
    const chip = { root: h("li", "fx-chip", disc, reason), reason, since: now }
    chips.set(id, chip)
    return chip
  }

  return {
    id: "effects-list",
    zone: "bottom-left",
    root,
    update(state: HudState) {
      const now = performance.now()
      const shown = state.effects.slice(0, MOST)
      const present = new Set(shown.map((effect) => effect.id))
      for (const [id, chip] of chips) {
        if (!present.has(id)) {
          chips.delete(id)
          chip.root.classList.add("is-leaving")
          root.append(chip.root)
          window.setTimeout(() => chip.root.remove(), LEAVING)
        }
      }
      shown.forEach((effect, index) => {
        const chip = chips.get(effect.id) ?? chipFor(effect.id, now)
        setData(chip.root, "severity", effect.severity)
        setText(chip.reason, effect.reason)
        chip.root.classList.toggle("is-settled", now - chip.since > FRESH)
        const at = root.children[index]
        if (at !== chip.root) {
          root.insertBefore(chip.root, at ?? null)
        }
      })
      const hidden = state.effects.length - shown.length
      setText(more, hidden > 0 ? `+${hidden}` : "")
      if (hidden > 0) {
        root.insertBefore(more, root.children[shown.length] ?? null)
      } else {
        more.remove()
      }
    }
  }
}
