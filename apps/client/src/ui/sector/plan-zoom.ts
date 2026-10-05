import type { BattlefieldMap } from "@verdun/map"
import { h } from "../../hud/dom.ts"
import { button } from "../fields.ts"
import { panView, type PlanView, zoomView } from "./view.ts"
import "./plan-zoom.css"

/** Each wheel notch, or press of + and −, zooms by this much. */
const STEP = 1.35
/** A press that moves further than this, in pixels, is a drag, not a click. */
const DRAG = 4

export interface PlanZoom {
  /** The zoom buttons, to place over the plan. */
  readonly controls: HTMLElement
  /** The view now, or null before the first fit. */
  readonly view: PlanView | null
  /** Looks at a view: the fit the plan opens at, or after the size changes. */
  set(view: PlanView): void
  /** Whether the plan's box has changed size since the view was last set, so it should fit again. */
  resized(): boolean
  /** Whether the press just ended was a drag, so the click that follows it isn't taken as one. */
  dragged(): boolean
  dispose(): void
}

/**
 * Zooming and panning a plan of the sector: the wheel zooms toward the pointer, a drag pans, and + and − and Fit sit in
 * a corner for those without a wheel. Buttons on the plan, such as squads' pins, keep their clicks.
 */
export function createPlanZoom(
  surface: HTMLElement,
  {
    map,
    home,
    changed
  }: {
    readonly map: () => BattlefieldMap | null
    /** The view to fit back to. */
    readonly home: () => PlanView | null
    /** Called when the view changes, to redraw. */
    readonly changed: () => void
  }
): PlanZoom {
  let view: PlanView | null = null
  let press: { x: number; y: number; id: number } | null = null
  let moved = false
  let sized = { width: 0, height: 0 }
  const size = () => ({ width: surface.clientWidth || 1, height: surface.clientHeight || 1 })

  function zoom(factor: number, at?: { x: number; y: number }): void {
    const ground = map()
    if (!ground || !view) {
      return
    }
    const { width, height } = size()
    view = zoomView(ground, view, factor, at ?? { x: width / 2, y: height / 2 }, width, height)
    changed()
  }

  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const box = surface.getBoundingClientRect()
    const notches = Math.max(-3, Math.min(3, event.deltaY / (event.deltaMode === 1 ? 3 : 100)))
    zoom(STEP ** -notches, { x: event.clientX - box.left, y: event.clientY - box.top })
  }
  const onDown = (event: PointerEvent) => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest("button"))) {
      return
    }
    press = { x: event.clientX, y: event.clientY, id: event.pointerId }
    moved = false
  }
  const onMove = (event: PointerEvent) => {
    const ground = map()
    if (!press || event.pointerId !== press.id || !ground || !view) {
      return
    }
    const dx = event.clientX - press.x
    const dy = event.clientY - press.y
    if (!moved && Math.hypot(dx, dy) < DRAG) {
      return
    }
    if (!moved) {
      moved = true
      surface.setPointerCapture(event.pointerId)
      surface.classList.add("plan-dragging")
    }
    const { width, height } = size()
    view = panView(ground, view, dx, dy, width, height)
    press = { ...press, x: event.clientX, y: event.clientY }
    changed()
  }
  const onUp = (event: PointerEvent) => {
    if (press && event.pointerId === press.id) {
      press = null
      surface.classList.remove("plan-dragging")
    }
  }
  surface.addEventListener("wheel", onWheel, { passive: false })
  surface.addEventListener("pointerdown", onDown)
  surface.addEventListener("pointermove", onMove)
  surface.addEventListener("pointerup", onUp)
  surface.addEventListener("pointercancel", onUp)

  const zoomIn = button("+", () => zoom(STEP), "plan-zoom-button")
  zoomIn.setAttribute("aria-label", "Zoom in")
  const zoomOut = button("−", () => zoom(1 / STEP), "plan-zoom-button")
  zoomOut.setAttribute("aria-label", "Zoom out")
  const fit = button(
    "Fit",
    () => {
      view = home()
      changed()
    },
    "plan-zoom-button plan-zoom-fit"
  )
  fit.setAttribute("aria-label", "Zoom to fit")
  const controls = h("div", "plan-zoom", zoomIn, zoomOut, fit)

  return {
    controls,
    get view() {
      return view
    },
    set(next) {
      view = next
      sized = size()
    },
    resized() {
      const now = size()
      return now.width !== sized.width || now.height !== sized.height
    },
    dragged() {
      const was = moved
      moved = false
      return was
    },
    dispose() {
      surface.removeEventListener("wheel", onWheel)
      surface.removeEventListener("pointerdown", onDown)
      surface.removeEventListener("pointermove", onMove)
      surface.removeEventListener("pointerup", onUp)
      surface.removeEventListener("pointercancel", onUp)
    }
  }
}
