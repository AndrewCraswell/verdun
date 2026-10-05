import { canonicalCode, keymap } from "../../ui/keymap.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { keyOf } from "../keys.ts"
import { DEAD_ZONE, WEDGES, wedgeAt, wedgeRefusal, type WheelContext } from "../order-wheel.ts"
import "./order-wheel.css"

/**
 * H7: the orders wheel. A middle click opens it where it was clicked, while the battle goes on: Advance, Run to,
 * Suppress, Dig in, Withdraw, Rally, Hold and Follow, the ones with their own keys showing them. Point toward one and
 * click to give it; click in the middle, right-click or Esc to give nothing. A middle drag still turns the camera. The
 * orders key works too, held: point and let go. The orders on the ground go to the ground that was under the pointer
 * when the wheel opened, marked in its middle. An order the squad can't take now is greyed; pointed at, the line under
 * the wheel says why.
 */

const SVG = "http://www.w3.org/2000/svg"
/** The wheel's inner and outer radius, in pixels. */
const INNER = DEAD_ZONE + 4
const OUTER = 128
/** Room under the wheel for the line saying why an order can't be given. */
const REASON = 30
const ORDERS_KEY = canonicalCode("orders")
/** A middle press that moves no further than this, in pixels, is a click for the wheel, not a drag for the camera. */
const CLICK_SLOP = 5

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  className: string,
  attributes: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag)
  element.setAttribute("class", className)
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value))
  }
  return element
}

/** An annular wedge's outline, clockwise from straight up, in radians. */
function sector(from: number, to: number): string {
  const point = (radius: number, angle: number) =>
    `${(Math.sin(angle) * radius).toFixed(1)} ${(-Math.cos(angle) * radius).toFixed(1)}`
  const large = to - from > Math.PI ? 1 : 0
  return (
    `M${point(INNER, from)}L${point(OUTER, from)}A${OUTER} ${OUTER} 0 ${large} 1 ${point(OUTER, to)}` +
    `L${point(INNER, to)}A${INNER} ${INNER} 0 ${large} 0 ${point(INNER, from)}Z`
  )
}

export const orderWheel: HudElementFactory = (context) => {
  const size = OUTER * 2 + 8
  const root = svg("svg", "order-wheel", {
    width: size,
    height: size + REASON,
    viewBox: `${-size / 2} ${-size / 2} ${size} ${size + REASON}`
  })
  root.setAttribute("aria-hidden", "true")
  const gap = 0.04
  const span = (Math.PI * 2) / WEDGES.length
  const wedges = WEDGES.map((wedge, index) => {
    const middle = index * span
    const group = svg("g", "ow-wedge")
    group.append(svg("path", "ow-wedge__shape", { d: sector(middle - span / 2 + gap, middle + span / 2 - gap) }))
    const radius = (INNER + OUTER) / 2
    const x = Math.sin(middle) * radius
    const y = -Math.cos(middle) * radius
    group.append(
      svg("use", "ow-wedge__icon", { href: `#hud-i-${wedge.icon}`, x: x - 10, y: y - 21, width: 20, height: 20 }),
      Object.assign(svg("text", "ow-wedge__label", { x, y: y + 10 }), { textContent: wedge.label })
    )
    if (wedge.key) {
      const key = svg("text", "ow-wedge__key", { x, y: y + 23 })
      group.append(key)
      return { group, key }
    }
    return { group, key: null }
  })
  const centre = svg("g", "ow-centre")
  centre.append(
    svg("circle", "ow-centre__ring", { r: INNER - 6 }),
    svg("path", "ow-centre__cross", { d: "M-6 0H6M0 -6V6" })
  )
  const reason = svg("text", "ow-reason", { x: 0, y: OUTER + 20 })
  root.append(...wedges.map(({ group }) => group), centre, reason)
  root.style.display = "none"

  /** Opened by holding the key, given when it's let go; or by a middle click, given with the next click. */
  let open: {
    readonly x: number
    readonly y: number
    readonly ground: { x: number; z: number } | null
    readonly by: "key" | "click"
  } | null = null
  let pointer = { x: 0, y: 0 }
  let chosen: number | null = null
  /** Why each wedge's order can't be given, as the wheel opened; null for those that can. */
  let refusals: (string | null)[] = []
  /** Where the middle button went down on the battlefield, to tell a click from the camera's drag. */
  let middleDown: { readonly x: number; readonly y: number } | null = null
  /** A click that gave or put away the wheel: its button's release mustn't open it again. */
  let swallowUp = false

  function choose(): void {
    chosen = open ? wedgeAt(pointer.x - open.x, pointer.y - open.y, WEDGES.length) : null
    wedges.forEach(({ group }, index) => group.classList.toggle("is-chosen", index === chosen))
    reason.textContent = (chosen === null ? null : refusals[chosen]) ?? ""
  }

  function close(): void {
    if (context.canvas) {
      delete context.canvas.dataset.orderMode
    }
    open = null
    chosen = null
    root.style.display = "none"
  }

  function openAt(x: number, y: number, by: "key" | "click"): void {
    open = { x, y, ground: context.pointerGround(), by }
    root.style.left = `${x - size / 2}px`
    root.style.top = `${y - size / 2}px`
    root.style.display = ""
    if (context.canvas) {
      context.canvas.dataset.orderMode = "wheel"
    }
    const situation: WheelContext = { at: open.ground, sim: context.sim, squad: context.squad }
    refusals = WEDGES.map((wedge) => wedgeRefusal(wedge, situation))
    for (const [index, wedge] of WEDGES.entries()) {
      const shown = wedges[index]
      shown?.group.classList.toggle("is-unavailable", refusals[index] !== null)
      if (shown?.key && wedge.key) {
        shown.key.textContent = keyOf(wedge.key)
      }
    }
    choose()
  }

  /** Gives the order pointed at, if the squad can take it, and puts the wheel away. */
  function give(): void {
    if (!open) {
      return
    }
    const wedge = chosen === null ? undefined : WEDGES[chosen]
    const situation: WheelContext = { at: open.ground, sim: context.sim, squad: context.squad }
    const order = wedge && chosen !== null && refusals[chosen] === null ? wedge.order(situation) : null
    if (order) {
      context.orderSquad(order)
    }
    close()
  }

  const onMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY }
    if (open) {
      choose()
    }
  }
  const onDown = (event: KeyboardEvent) => {
    if (open && event.code === "Escape") {
      close()
      return
    }
    if (event.repeat || open || keymap().canonical(event.code) !== ORDERS_KEY) {
      return
    }
    openAt(pointer.x, pointer.y, "key")
  }
  const onUp = (event: KeyboardEvent) => {
    if (open?.by === "key" && keymap().canonical(event.code) === ORDERS_KEY) {
      give()
    }
  }
  // Heard first, while capturing: with the wheel open, a click is for the wheel, not for the rifle or the camera.
  const onPointerDown = (event: PointerEvent) => {
    if (open) {
      if (event.button === 2) {
        close()
      } else if (open.by === "click" && (event.button === 0 || event.button === 1)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        swallowUp = true
        give()
      }
      return
    }
    middleDown = event.button === 1 && event.target === context.canvas ? { x: event.clientX, y: event.clientY } : null
  }
  const onPointerUp = (event: PointerEvent) => {
    if (swallowUp) {
      swallowUp = false
      event.stopImmediatePropagation()
      return
    }
    // A middle click, not a drag that turned the camera: the wheel opens where it was clicked.
    const start = middleDown
    middleDown = null
    if (event.button === 1 && start && !open && context.squad.leader >= 0) {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= CLICK_SLOP) {
        openAt(event.clientX, event.clientY, "click")
      }
    }
  }
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerdown", onPointerDown, { capture: true })
  window.addEventListener("pointerup", onPointerUp, { capture: true })
  window.addEventListener("keydown", onDown)
  window.addEventListener("keyup", onUp)
  window.addEventListener("blur", close)

  return {
    id: "order-wheel",
    zone: "world",
    root,
    update(state: HudState) {
      // No squad to order once it's gone.
      if (!state.soldier && open) {
        close()
      }
    },
    dispose() {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerdown", onPointerDown, { capture: true })
      window.removeEventListener("pointerup", onPointerUp, { capture: true })
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
      window.removeEventListener("blur", close)
    }
  }
}
