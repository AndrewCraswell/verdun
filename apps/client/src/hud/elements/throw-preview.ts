import { THROW_KEY } from "../../control/browser-input.ts"
import { keymap } from "../../ui/keymap.ts"
import type { HudElementFactory, ScreenPoint } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { interfaceSettings } from "../interface-settings.ts"
import { throwPreview, type ThrowPreview } from "../throw-preview.ts"
import "./throw-preview.css"

/**
 * H9 and W7: the grenade, before it's thrown. While the throw key is held: the arc from the man's hand and its shadow
 * on the ground, a ring as far as he can throw from where he stands and how, the spread a throw that long lands in,
 * and the blast where it would come to rest. If the arc strikes the ground short (the trench wall in front of a man too
 * low to throw clear, a parapet, a crater's rim), a red cross marks where, and the roll back from there. A word says
 * which: clear, won't clear, out of reach, or our own men in the blast. Let go of the key and it's thrown.
 */

const SVG = "http://www.w3.org/2000/svg"
/** Rings on the ground are drawn with this many points. */
const RING_POINTS = 48

function svg<K extends keyof SVGElementTagNameMap>(tag: K, className: string): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag)
  element.setAttribute("class", className)
  return element
}

function pathOf(points: readonly (ScreenPoint | null)[], close = false): string {
  let path = ""
  let open = false
  for (const point of points) {
    if (!point) {
      open = false
      continue
    }
    path += `${open ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
    open = true
  }
  return close && path ? `${path}Z` : path
}

/** Distances on a throw, to the metre: a man judges his own throw closer than he'd call a distance. */
function metres(distance: number): string {
  return `${Math.round(distance)} m`
}

const VERDICTS: Readonly<Record<ThrowPreview["verdict"], string>> = {
  clear: "",
  strikes: "Won't clear",
  short: "Out of reach",
  danger: "Our men in the blast",
  none: "No grenades"
}

export const throwPreviewMarks: HudElementFactory = (context) => {
  const root = svg("svg", "throw-preview")
  root.setAttribute("aria-hidden", "true")
  const reach = svg("path", "tp-reach")
  const track = svg("path", "tp-track")
  const scatter = svg("path", "tp-scatter")
  const blast = svg("path", "tp-blast")
  const arcShadow = svg("path", "tp-arc-halo")
  const arc = svg("path", "tp-arc")
  const roll = svg("path", "tp-roll")
  const strike = svg("path", "tp-strike")
  const rest = svg("circle", "tp-rest")
  rest.setAttribute("r", "3.2")
  const title = svg("text", "tp-title")
  const detail = svg("text", "tp-detail")
  title.setAttribute("y", "-14")
  detail.setAttribute("y", "2")
  const label = svg("g", "tp-label")
  label.append(title, detail)
  // Out of reach: where the throw meets the reach ring, lit; the rest of the way to where the pointer is, dashed, to a
  // hollow mark there.
  const limit = svg("path", "tp-limit")
  const beyond = svg("path", "tp-beyond")
  const wanted = svg("circle", "tp-wanted")
  wanted.setAttribute("r", "6")
  root.append(reach, limit, track, scatter, blast, beyond, wanted, arcShadow, arc, roll, strike, rest, label)
  root.style.display = "none"

  let aiming = false
  // As the input reads the key (control/browser-input.ts): held, or a press to aim and another to throw.
  const toggled = () => interfaceSettings().current.presses.grenade === "toggle"
  const onDown = (event: KeyboardEvent) => {
    if (keymap().canonical(event.code) === THROW_KEY && !event.repeat) {
      aiming = toggled() ? !aiming : true
    }
  }
  const onUp = (event: KeyboardEvent) => {
    if (keymap().canonical(event.code) === THROW_KEY && !toggled()) {
      aiming = false
    }
  }
  const onBlur = () => {
    aiming = false
  }
  window.addEventListener("keydown", onDown)
  window.addEventListener("keyup", onUp)
  window.addEventListener("blur", onBlur)

  const ground = (x: number, z: number, lift = 0.15) => context.project(x, context.heightAt(x, z) + lift, z)
  // Rings lie level at the height of the ground at their centre: a clean ellipse reads better than one that follows
  // every crater's lip.
  const ring = (x: number, z: number, radius: number) => {
    const level = context.heightAt(x, z) + 0.2
    return pathOf(
      Array.from({ length: RING_POINTS }, (_, index) => {
        const angle = (index / RING_POINTS) * Math.PI * 2
        return context.project(x + Math.cos(angle) * radius, level, z + Math.sin(angle) * radius)
      }),
      true
    )
  }

  function set(target: Element, name: string, value: string): void {
    if (target.getAttribute(name) !== value) {
      target.setAttribute(name, value)
    }
  }

  /** The stretch of the reach ring either side of the way he's throwing, `spread` radians each way. */
  function limitArc(preview: ThrowPreview, spread: number): string {
    const { from, reach: radius, flight } = preview
    const heading = Math.atan2(flight.mark.z - from.z, flight.mark.x - from.x)
    const level = context.heightAt(from.x, from.z) + 0.2
    const steps = 16
    return pathOf(
      Array.from({ length: steps + 1 }, (_, index) => {
        const angle = heading - spread + (2 * spread * index) / steps
        return context.project(from.x + Math.cos(angle) * radius, level, from.z + Math.sin(angle) * radius)
      })
    )
  }

  function draw(preview: ThrowPreview, at: { x: number; z: number }): void {
    const { flight } = preview
    root.dataset.verdict = preview.verdict
    set(reach, "d", ring(preview.from.x, preview.from.z, preview.reach))
    if (flight.short) {
      const markPoint = ground(flight.mark.x, flight.mark.z)
      const wantedPoint = ground(at.x, at.z)
      set(limit, "d", limitArc(preview, 0.42))
      set(beyond, "d", pathOf([markPoint, wantedPoint]))
      if (wantedPoint) {
        set(wanted, "cx", wantedPoint.x.toFixed(1))
        set(wanted, "cy", wantedPoint.y.toFixed(1))
      }
      root.dataset.short = ""
    } else {
      delete root.dataset.short
    }
    set(arc, "d", pathOf(flight.path.map((point) => context.project(point.x, point.y, point.z))))
    set(arcShadow, "d", arc.getAttribute("d") ?? "")
    set(track, "d", pathOf(flight.path.map((point) => ground(point.x, point.z, 0.05))))
    set(scatter, "d", ring(flight.mark.x, flight.mark.z, preview.scatter))
    set(blast, "d", ring(flight.rest.x, flight.rest.z, preview.blast))
    const restPoint = ground(flight.rest.x, flight.rest.z)
    if (restPoint) {
      set(rest, "cx", restPoint.x.toFixed(1))
      set(rest, "cy", restPoint.y.toFixed(1))
    }
    if (flight.struck) {
      const hit = ground(flight.struck.x, flight.struck.z, 0.3)
      set(
        strike,
        "d",
        hit
          ? `M${hit.x - 7} ${hit.y - 7}L${hit.x + 7} ${hit.y + 7}M${hit.x + 7} ${hit.y - 7}L${hit.x - 7} ${hit.y + 7}`
          : ""
      )
      set(roll, "d", pathOf([hit, restPoint]))
    } else {
      set(strike, "d", "")
      set(roll, "d", "")
    }
    // The word goes where the grenade would come to rest, just above its blast.
    const anchor = restPoint ?? ground(flight.mark.x, flight.mark.z)
    if (anchor) {
      set(label, "transform", `translate(${anchor.x.toFixed(1)} ${(anchor.y - 18).toFixed(1)})`)
    }
    const word = VERDICTS[preview.verdict]
    const thrown = metres(Math.min(preview.distance, preview.reach))
    switch (preview.verdict) {
      case "clear":
        title.textContent = thrown
        detail.textContent = `bursts ${preview.fuse.toFixed(1)} s after the throw`
        break
      case "strikes":
        title.textContent = word
        detail.textContent = `strikes and rolls back ${metres(flight.rolled)}`
        break
      case "short":
        title.textContent = word
        detail.textContent = `${metres(preview.distance - preview.reach)} too far, lands at ${metres(preview.reach)}`
        break
      case "danger":
        title.textContent = word
        detail.textContent = preview.ourMenInBlast === 1 ? "1 man" : `${preview.ourMenInBlast} men`
        break
      case "none":
        title.textContent = word
        detail.textContent = ""
        break
    }
  }

  return {
    id: "throw-preview",
    zone: "world",
    root,
    update(state: HudState) {
      // Nothing to throw with once nobody is under control.
      if (!state.soldier) {
        aiming = false
      }
    },
    frame() {
      const at = aiming ? context.pointerGround() : null
      const preview = at ? throwPreview(context.sim, context.squad, at) : null
      root.style.display = preview ? "" : "none"
      if (preview && at) {
        draw(preview, at)
      }
    },
    dispose() {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
      window.removeEventListener("blur", onBlur)
    }
  }
}
