import { h, setText } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { icon, type IconName } from "../icons.ts"
import type { SquadKit, TakeOverChoice } from "../take-over.ts"
import "./take-over-marks.css"

/**
 * H17 on the map: with the squad lost, the camera draws back into the war map's view, and each squad that can be taken
 * over is a marker where its leader stands: its number (the key that takes it), how many men, and what it carries
 * that matters. Pointing at one tells who leads it and what it's doing; clicking it takes it over. A cross marks where
 * the player's squad fell, and a brass pill where its replacements come up (W10).
 */

/** Metres above the ground the markers sit. */
const LIFT = 2

const KITS: Readonly<Record<SquadKit, readonly [IconName, string]>> = {
  "machine-gun": ["machine-gun", "a machine gun"],
  sniper: ["sniper", "a sniper"],
  grenadier: ["rifle-grenade", "a rifle grenadier"]
}

interface Marker {
  readonly root: HTMLButtonElement
  readonly number: HTMLElement
  readonly men: HTMLElement
  readonly kit: HTMLElement
  readonly name: HTMLElement
  readonly about: HTMLElement
  choice: TakeOverChoice
  kitKey: string
}

export const takeOverMarks: HudElementFactory = (context) => {
  const root = h("div", "take-over-marks")
  const fell = h("div", "tom-fell", icon("killed", "tom-fell__icon"), h("span", "tom-fell__text", "Your squad"))
  // W10: where the replacements come up, while they're on their way.
  const arrival = h("div", "tom-arrival", icon("men", "tom-arrival__icon"), h("span", "", "Replacements"))
  root.append(fell, arrival)
  const markers = new Map<number, Marker>()

  function markerFor(choice: TakeOverChoice): Marker {
    const existing = markers.get(choice.squad)
    if (existing) {
      return existing
    }
    const number = h("span", "tom-number")
    const men = h("span", "tom-men")
    const kit = h("span", "tom-kit")
    const name = h("strong", "tom-card__name")
    const about = h("span", "tom-card__about")
    const button = h(
      "button",
      "tom-marker",
      h("span", "tom-badge", number, h("span", "tom-strength", icon("men", "tom-icon"), men, kit)),
      h("span", "tom-card", name, about)
    )
    button.type = "button"
    const marker: Marker = { root: button, number, men, kit, name, about, choice, kitKey: "" }
    button.addEventListener("click", () => context.takeOverSquad(marker.choice.squad))
    root.append(button)
    markers.set(choice.squad, marker)
    return marker
  }

  return {
    id: "take-over-marks",
    zone: "world",
    root,
    update(state: HudState) {
      const wiped = state.wiped
      root.hidden = wiped === null
      const choices = wiped?.choices ?? []
      const wanted = new Set(choices.map((choice) => choice.squad))
      for (const [squad, marker] of markers) {
        if (!wanted.has(squad)) {
          marker.root.remove()
          markers.delete(squad)
        }
      }
      choices.forEach((choice, index) => {
        const marker = markerFor(choice)
        marker.choice = choice
        setText(marker.number, String(index + 1))
        setText(marker.men, String(choice.men))
        setText(marker.name, choice.name)
        setText(marker.about, `${choice.men} men, ${choice.order.toLowerCase()}`)
        const kitKey = choice.kit.join()
        if (kitKey !== marker.kitKey) {
          marker.kitKey = kitKey
          marker.kit.replaceChildren(...choice.kit.map((kit) => icon(KITS[kit][0], "tom-icon")))
        }
        const carries = choice.kit.map((kit) => KITS[kit][1]).join(", ")
        marker.root.setAttribute(
          "aria-label",
          `${index + 1}: ${choice.name}, ${choice.men} men${carries ? `, with ${carries}` : ""}, ${choice.order}`
        )
      })
    },
    frame(state: HudState) {
      const wiped = state.wiped
      if (!wiped) {
        return
      }
      const place = (element: HTMLElement, x: number, z: number) => {
        const point = context.project(x, context.heightAt(x, z) + LIFT, z)
        element.style.display = point ? "" : "none"
        if (point) {
          element.style.transform = `translate(${point.x.toFixed(1)}px, ${point.y.toFixed(1)}px)`
        }
      }
      place(fell, wiped.fell.x, wiped.fell.z)
      if (wiped.arrival) {
        place(arrival, wiped.arrival.x, wiped.arrival.z)
      } else {
        arrival.style.display = "none"
      }
      for (const choice of wiped.choices) {
        const marker = markers.get(choice.squad)
        if (marker) {
          place(marker.root, choice.at.x, choice.at.z)
        }
      }
    }
  }
}
