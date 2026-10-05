import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { icon } from "../icons.ts"
import type { SpottedGun } from "../spotted-guns.ts"
import "./gun-marks.css"

/**
 * Machine guns given away by their fire, marked where they last fired: an enemy gun our side has spotted in red, with a
 * solid ring once one of our men has seen it (an observer can bring fire on it) and a broken one while it's only been
 * heard; our own squad's gun, once the enemy has spotted it, in amber, to say move it. Each fades out over the minute
 * after its last burst.
 */

const SVG = "http://www.w3.org/2000/svg"
/** Metres above the ground the mark floats. */
const LIFT = 1.4

interface Mark {
  readonly group: SVGGElement
  readonly ring: SVGCircleElement
  readonly label: SVGTextElement
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, className: string): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag)
  element.setAttribute("class", className)
  return element
}

/** What the mark says: ours to move, theirs placed by sight or only by ear. */
function labelOf(gun: SpottedGun): string {
  if (gun.ours) {
    return "Your gun is spotted"
  }
  return gun.seen ? "Machine gun" : "Machine gun, heard"
}

const keyOfGun = (gun: SpottedGun) => `${gun.ours ? "ours" : "theirs"}:${gun.soldier}`

export const gunMarks: HudElementFactory = (context) => {
  const root = svg("svg", "gun-marks")
  root.setAttribute("aria-hidden", "true")
  const marks = new Map<string, Mark>()

  function markFor(gun: SpottedGun): Mark {
    const key = keyOfGun(gun)
    const existing = marks.get(key)
    if (existing) {
      return existing
    }
    const group = svg("g", "gm-mark")
    const ring = svg("circle", "gm-ring")
    ring.setAttribute("r", "13")
    const glyph = icon("machine-gun", "gm-icon")
    glyph.setAttribute("x", "-8")
    glyph.setAttribute("y", "-8")
    glyph.setAttribute("width", "16")
    glyph.setAttribute("height", "16")
    const label = svg("text", "gm-label")
    label.setAttribute("y", "26")
    group.append(ring, glyph, label)
    root.append(group)
    const mark = { group, ring, label }
    marks.set(key, mark)
    return mark
  }

  return {
    id: "gun-marks",
    zone: "world",
    root,
    update(state: HudState) {
      const wanted = new Set(state.guns.map(keyOfGun))
      for (const [key, mark] of marks) {
        if (!wanted.has(key)) {
          mark.group.remove()
          marks.delete(key)
        }
      }
      for (const gun of state.guns) {
        const mark = markFor(gun)
        mark.group.dataset.side = gun.ours ? "ours" : "theirs"
        mark.group.dataset.seen = String(gun.seen)
        mark.label.textContent = labelOf(gun)
        // Never quite gone until it is: a faint mark still says where it was.
        mark.group.style.opacity = (0.35 + 0.65 * gun.fresh).toFixed(2)
      }
    },
    frame(state: HudState) {
      for (const gun of state.guns) {
        const mark = marks.get(keyOfGun(gun))
        if (!mark) {
          continue
        }
        const point = context.project(gun.x, context.heightAt(gun.x, gun.z) + LIFT, gun.z)
        if (point) {
          mark.group.setAttribute("transform", `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`)
          mark.group.style.display = ""
        } else {
          mark.group.style.display = "none"
        }
      }
    }
  }
}
