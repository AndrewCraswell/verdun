import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import type { Threat, ThreatKind } from "../threats.ts"
import "./threat-edges.css"

/**
 * Where the danger comes from, at the edge of the screen: a vermilion chevron toward fire at the man under control,
 * pointing the way it came; a shell's mark toward where one is about to land near him, larger for a heavy shell. Each
 * fades as it passes. Works without sound, for players who play without it.
 */

const SVG = "http://www.w3.org/2000/svg"
/** The marks sit this far in from the screen's edge, in pixels. */
const INSET = 56
/** The most marks shown at once: the freshest. */
const MOST = 8

const SHAPES: Readonly<Record<ThreatKind, string>> = {
  // A chevron pointing out, toward the fire.
  fire: "M-11 6L0 -9L11 6L0 1Z",
  // A shell falling: a dot ringed.
  shell: "M0 -7A7 7 0 1 1 0 7A7 7 0 1 1 0 -7ZM0 -3A3 3 0 1 0 0 3A3 3 0 1 0 0 -3Z",
  heavy: "M0 -10A10 10 0 1 1 0 10A10 10 0 1 1 0 -10ZM0 -4.5A4.5 4.5 0 1 0 0 4.5A4.5 4.5 0 1 0 0 -4.5Z"
}

export const threatEdges: HudElementFactory = (context) => {
  const root = document.createElementNS(SVG, "svg")
  root.setAttribute("class", "threat-edges")
  root.setAttribute("aria-hidden", "true")
  const marks = Array.from({ length: MOST }, () => {
    const mark = document.createElementNS(SVG, "path")
    mark.style.display = "none"
    root.append(mark)
    return mark
  })

  function place(mark: SVGPathElement, threat: Threat, from: { x: number; z: number }): void {
    // The way to it on the screen, clockwise from straight up, as the camera sees the ground.
    const angle = context.screenAngle(from.x, from.z, threat.x - from.x, threat.z - from.z)
    const halfWide = innerWidth / 2 - INSET
    const halfHigh = innerHeight / 2 - INSET
    const x = innerWidth / 2 + Math.sin(angle) * halfWide
    const y = innerHeight / 2 - Math.cos(angle) * halfHigh
    mark.setAttribute("class", `te-mark te-mark--${threat.kind}`)
    mark.setAttribute("d", SHAPES[threat.kind])
    mark.setAttribute(
      "transform",
      `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${((angle * 180) / Math.PI).toFixed(1)})`
    )
    mark.style.opacity = (0.25 + 0.75 * threat.strength).toFixed(2)
    mark.style.display = ""
  }

  return {
    id: "threat-edges",
    zone: "screen",
    root,
    update() {
      // Placed each frame, as the camera turns: see frame().
    },
    frame(state: HudState) {
      const from = state.soldier?.position ?? null
      const shown = from ? [...state.threats].sort((a, b) => b.strength - a.strength).slice(0, MOST) : []
      marks.forEach((mark, index) => {
        const threat = shown[index]
        if (threat && from) {
          place(mark, threat, from)
        } else if (mark.style.display !== "none") {
          mark.style.display = "none"
        }
      })
    }
  }
}
