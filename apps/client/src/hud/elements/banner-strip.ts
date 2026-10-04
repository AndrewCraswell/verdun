import type { BannerTone } from "../banners.ts"
import { h, setData, setText, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import "./banner-strip.css"

/**
 * H15: banners across the upper screen for what changes everyone's next minute: zero hour, the gas, an objective won or
 * lost, the counter-attack, stand-to. A kicker between rules, a Didone headline, a line under it. While the battle waits
 * for the daily turn, its banner stays up.
 */

/** Where in its time a banner starts to go. */
const LEAVING = 0.86

export const bannerStrip: HudElementFactory = () => {
  const kicker = h("span", "bn-kicker__text")
  const title = h("div", "bn-title")
  const detail = h("div", "bn-detail")
  const root = h(
    "div",
    "banner-strip",
    h("div", "bn-kicker", h("span", "bn-rule"), kicker, h("span", "bn-rule")),
    title,
    detail
  )
  root.setAttribute("role", "status")
  let shown: number | string | null = null

  function put(key: number | string, tone: BannerTone, top: string, headline: string, line: string | null): void {
    if (shown !== key) {
      shown = key
      root.classList.remove("is-in")
      void root.offsetWidth
      root.classList.add("is-in")
    }
    setData(root, "tone", tone)
    setText(kicker, top)
    setText(title, headline)
    setText(detail, line ?? "")
    show(detail, line !== null && line !== "")
  }

  return {
    id: "banner-strip",
    zone: "centre",
    root,
    update(state: HudState) {
      if (state.war?.banner) {
        // The battle waits on the war's calendar: the stand-to at the daily cutoff, or the break between seasons.
        const standTo = state.war.standTo
        put(
          "war",
          "routine",
          standTo ? "Daily turn" : "The war",
          standTo ? "Stand-to" : state.war.turn,
          state.war.countdown
        )
        root.classList.remove("is-leaving")
        show(root, true)
        return
      }
      const current = state.banner
      show(root, current !== null)
      if (!current) {
        shown = null
        return
      }
      put(current.banner.id, current.banner.tone, current.banner.kicker, current.banner.title, current.banner.detail)
      root.classList.toggle("is-leaving", current.progress >= LEAVING)
    }
  }
}
