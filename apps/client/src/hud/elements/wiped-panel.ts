import { h, keyCap, setText, setVar, show } from "../dom.ts"
import type { HudElementFactory } from "../element.ts"
import { clockSeconds } from "../format.ts"
import type { HudState } from "../hud-state.ts"
import { keyOf } from "../keys.ts"
import "./wiped-panel.css"

/**
 * H17: the squad is gone. Not a death screen: the battle goes on, and the camera draws back into the war map's view,
 * where the squads that can be taken over are marked (take-over-marks.ts). This strip says what to do: pick one there,
 * by its number or a click, or wait for the replacements coming up to the rear trench, counted down.
 */

/** Seconds the replacements' countdown ring measures: the longest wait for them (packages/sim/src/reinforcements.ts). */
const LONGEST_WAIT = 90
/** The camera draws back at least this far while the squad is lost: far enough for the war map's view, in metres. */
const OVER_THE_SECTOR = 240
/** ...and further if the squads on offer are spread wider than this share of its distance. */
const SPREAD = 0.75

/** Where to look and how far back to stand to see where the squad fell and every squad on offer. */
function framing(points: readonly { readonly x: number; readonly z: number }[]): {
  x: number
  z: number
  distance: number
} {
  const xs = points.map((point) => point.x)
  const zs = points.map((point) => point.z)
  const [left, right, near, far] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  const extent = Math.max(right - left, far - near)
  return { x: (left + right) / 2, z: (near + far) / 2, distance: Math.max(OVER_THE_SECTOR, extent / SPREAD) }
}

export const wipedPanel: HudElementFactory = (context) => {
  const time = h("strong", "wp-time")
  const ring = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  ring.setAttribute("class", "wp-ring")
  ring.setAttribute("viewBox", "0 0 40 40")
  ring.innerHTML =
    '<circle cx="20" cy="20" r="17" class="wp-ring__track"/><circle cx="20" cy="20" r="17" class="wp-ring__arc" pathLength="1"/>'
  const clock = h("div", "wp-clock", ring, time)
  const title = h("h2", "wp-title")
  const wait = h("div", "wp-wait")
  const lastKey = keyCap("5")
  const nearestKey = keyCap(keyOf("take-over"))
  const keys = h(
    "div",
    "wp-keys",
    keyCap("1"),
    "–",
    lastKey,
    h("span", "", "or click a squad ·"),
    nearestKey,
    h("span", "", "the nearest")
  )
  const root = h(
    "section",
    "wiped-panel hud-plate",
    h("div", "wp-text", h("div", "wp-kicker hud-label", "Squad lost"), title, keys),
    h("div", "wp-replacements", clock, wait)
  )
  root.setAttribute("role", "status")
  let offered = false
  let distanceBefore: number | null = null
  let choices: readonly number[] = []

  const onKey = (event: KeyboardEvent) => {
    const digit = /^Digit([1-5])$/.exec(event.code)?.[1]
    const squad = digit ? choices[Number(digit) - 1] : undefined
    if (offered && squad !== undefined && !event.repeat) {
      context.takeOverSquad(squad)
    }
  }
  window.addEventListener("keydown", onKey)

  return {
    id: "wiped-panel",
    zone: "bottom-centre",
    root,
    update(state: HudState) {
      const wiped = state.wiped
      // The handover card has the stage while the last man's fall is told.
      const up = wiped !== null && state.succession === null
      show(root, up)
      if (up && !offered && wiped) {
        // Drawn back over the sector into the war map, over where the squad fell; put back once the player has men.
        distanceBefore = context.cameraDistance()
        const view = framing([wiped.fell, ...wiped.choices.map((choice) => choice.at)])
        context.setCameraDistance(Math.max(distanceBefore, view.distance))
        context.lookAt(view.x, view.z)
      } else if (!up && offered && distanceBefore !== null) {
        context.setCameraDistance(distanceBefore)
        distanceBefore = null
      }
      offered = up
      if (!wiped) {
        choices = []
        return
      }
      choices = wiped.choices.map((choice) => choice.squad)
      const count = choices.length
      setText(title, count > 0 ? "Take over a squad on the map" : "No squad nearby can be taken over")
      show(keys, count > 0)
      setText(lastKey, String(count))
      setText(nearestKey, keyOf("take-over"))
      if (wiped.seconds === null) {
        setText(time, "—")
        setText(wait, "No replacements coming")
        setVar(ring, "--left", 0)
      } else {
        setText(time, clockSeconds(wiped.seconds))
        const men = wiped.men > 0 ? `${wiped.men} replacements` : "Replacements"
        setText(wait, count > 0 ? `or wait: ${men} on their way` : `${men} on their way`)
        setVar(ring, "--left", Math.min(1, wiped.seconds / LONGEST_WAIT))
      }
    },
    dispose() {
      window.removeEventListener("keydown", onKey)
    }
  }
}
