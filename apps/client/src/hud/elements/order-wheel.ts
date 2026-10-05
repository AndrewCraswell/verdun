import { canonicalCode, keymap } from "../../ui/keymap.ts"
import type { HudElementFactory } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import { keyOf } from "../keys.ts"
import { DEAD_ZONE, WEDGES, wedgeAt, wedgeRefusal, type WheelContext } from "../order-wheel.ts"
import "./order-wheel.css"

/**
 * H7: the orders wheel. Held (R), it opens round the pointer while the battle goes on: Advance, Run to, Suppress, Dig
 * in, Withdraw, Rally, Hold and Follow, the ones with their own keys showing them. Point toward one and let go to give
 * it; let go in the middle, or right-click, to give nothing. The orders on the ground go to the ground that was under
 * the pointer when the wheel opened, marked in its middle. An order the squad can't take now is greyed; pointed at, the
 * line under the wheel says why.
 */

const SVG = "http://www.w3.org/2000/svg"
/** The wheel's inner and outer radius, in pixels. */
const INNER = DEAD_ZONE + 4
const OUTER = 128
/** Room under the wheel for the line saying why an order can't be given. */
const REASON = 30
const ORDERS_KEY = canonicalCode("orders")

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

  let open: { readonly x: number; readonly y: number; readonly ground: { x: number; z: number } | null } | null = null
  let pointer = { x: 0, y: 0 }
  let chosen: number | null = null
  /** Why each wedge's order can't be given, as the wheel opened; null for those that can. */
  let refusals: (string | null)[] = []

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

  const onMove = (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY }
    if (open) {
      choose()
    }
  }
  const onDown = (event: KeyboardEvent) => {
    if (event.repeat || keymap().canonical(event.code) !== ORDERS_KEY) {
      return
    }
    open = { x: pointer.x, y: pointer.y, ground: context.pointerGround() }
    root.style.left = `${open.x - size / 2}px`
    root.style.top = `${open.y - size / 2}px`
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
  const onUp = (event: KeyboardEvent) => {
    if (!open || keymap().canonical(event.code) !== ORDERS_KEY) {
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
  const onPointerDown = (event: PointerEvent) => {
    if (open && event.button === 2) {
      close()
    }
  }
  window.addEventListener("pointermove", onMove)
  window.addEventListener("pointerdown", onPointerDown)
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
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
      window.removeEventListener("blur", close)
    }
  }
}
