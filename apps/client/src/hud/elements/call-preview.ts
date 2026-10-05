import { CALL_KEYS } from "../../control/browser-input.ts"
import { canonicalCode, keymap } from "../../ui/keymap.ts"
import type { HudElementFactory, ScreenPoint } from "../element.ts"
import { type CallKind, type CallPreview, callPreview } from "../fire-preview.ts"
import type { HudState } from "../hud-state.ts"
import "./call-preview.css"

/**
 * H10 and W6: a call for fire before it's made. While V (or X) is held, the ground the shells would fall on shows at the
 * pointer, with the margin a burst still kills in (or gas drifts over), the delay and how long they'd fire. Our own men
 * inside turn it red and say so: the call then goes only on a second press. Let go to call; right-click puts it away.
 */

const SVG = "http://www.w3.org/2000/svg"
/** The footprint's edges follow the ground in steps this long, in metres. */
const STEP = 4

const KINDS: ReadonlyMap<string, CallKind> = new Map([
  [canonicalCode("fire-mission"), "fire"],
  [canonicalCode("gas"), "gas"]
])

const TITLES: Readonly<Record<CallKind, string>> = { fire: "Fire mission", gas: "Gas shoot" }

function svg<K extends keyof SVGElementTagNameMap>(tag: K, className: string): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag)
  element.setAttribute("class", className)
  return element
}

export const callPreviewMarks: HudElementFactory = (context) => {
  const root = svg("svg", "call-preview")
  root.setAttribute("aria-hidden", "true")
  const margin = svg("path", "cpv-margin")
  const area = svg("path", "cpv-area")
  // Gas only: where the wind carries the cloud, and an arrow from the bursts to it.
  const drifted = svg("path", "cpv-drift")
  const driftArrow = svg("path", "cpv-drift-arrow")
  const centre = svg("path", "cpv-centre")
  const title = svg("text", "cpv-title")
  const detail = svg("text", "cpv-detail")
  title.setAttribute("y", "-12")
  detail.setAttribute("y", "4")
  const label = svg("g", "cpv-label")
  label.append(title, detail)
  root.append(drifted, driftArrow, margin, area, centre, label)
  root.style.display = "none"

  let aiming: CallKind | null = null
  const onDown = (event: KeyboardEvent) => {
    const code = keymap().canonical(event.code)
    if (code && CALL_KEYS.has(code) && !event.repeat) {
      aiming = KINDS.get(code) ?? null
    }
  }
  const onUp = (event: KeyboardEvent) => {
    const code = keymap().canonical(event.code)
    if (code && KINDS.get(code) === aiming) {
      aiming = null
    }
  }
  const putAway = (event: PointerEvent) => {
    if (event.button === 2) {
      aiming = null
    }
  }
  const onBlur = () => {
    aiming = null
  }
  window.addEventListener("keydown", onDown)
  window.addEventListener("keyup", onUp)
  window.addEventListener("pointerdown", putAway)
  window.addEventListener("blur", onBlur)

  /** A rectangle on the ground, its edges following the ground's rise and fall. */
  function outline(fromX: number, toX: number, nearZ: number, farZ: number): string {
    const corners: (readonly [number, number])[] = [
      [fromX, nearZ],
      [toX, nearZ],
      [toX, farZ],
      [fromX, farZ],
      [fromX, nearZ]
    ]
    const points: (ScreenPoint | null)[] = []
    for (let index = 0; index < corners.length - 1; index++) {
      const [ax, az] = corners[index] ?? [0, 0]
      const [bx, bz] = corners[index + 1] ?? [0, 0]
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP))
      for (let step = 0; step < steps; step++) {
        const x = ax + ((bx - ax) * step) / steps
        const z = az + ((bz - az) * step) / steps
        points.push(context.project(x, context.heightAt(x, z) + 0.3, z))
      }
    }
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
    return path ? `${path}Z` : ""
  }

  function draw(preview: CallPreview, at: { x: number; z: number }): void {
    root.dataset.kind = preview.kind
    root.dataset.danger = String(preview.ourMen > 0)
    const { fromX, toX, nearZ, farZ, reach } = preview
    area.setAttribute("d", outline(fromX, toX, nearZ, farZ))
    margin.setAttribute("d", outline(fromX - reach, toX + reach, nearZ - reach, farZ + reach))
    const { drift } = preview
    const drifting = Math.hypot(drift.x, drift.z) > 2
    drifted.setAttribute("d", drifting ? outline(fromX + drift.x, toX + drift.x, nearZ + drift.z, farZ + drift.z) : "")
    const downwind = drifting
      ? context.project(at.x + drift.x, context.heightAt(at.x + drift.x, at.z + drift.z) + 0.3, at.z + drift.z)
      : null
    const middle = context.project(at.x, context.heightAt(at.x, at.z) + 0.3, at.z)
    if (middle) {
      const { x, y } = middle
      centre.setAttribute("d", `M${x - 9} ${y}H${x + 9}M${x} ${y - 9}V${y + 9}`)
    }
    if (middle && downwind) {
      const angle = Math.atan2(downwind.y - middle.y, downwind.x - middle.x)
      const head = (turn: number) =>
        `${(downwind.x - Math.cos(angle + turn) * 10).toFixed(1)} ${(downwind.y - Math.sin(angle + turn) * 10).toFixed(1)}`
      driftArrow.setAttribute(
        "d",
        `M${middle.x.toFixed(1)} ${middle.y.toFixed(1)}L${downwind.x.toFixed(1)} ${downwind.y.toFixed(1)}M${head(0.5)}L${downwind.x.toFixed(1)} ${downwind.y.toFixed(1)}L${head(-0.5)}`
      )
    } else {
      driftArrow.setAttribute("d", "")
    }
    // The words go under whichever edge of the footprint is nearer the camera, where they stay on the screen.
    const edges = [nearZ - reach, farZ + reach].map((z) => context.project(at.x, context.heightAt(at.x, z) + 0.3, z))
    const bottom = edges.reduce<ScreenPoint | null>(
      (low, point) => (point && (!low || point.y > low.y) ? point : low),
      null
    )
    if (bottom) {
      label.setAttribute("transform", `translate(${bottom.x.toFixed(1)} ${(bottom.y + 26).toFixed(1)})`)
    }
    if (preview.ourMen > 0) {
      title.textContent = "Our men in the beaten zone"
      detail.textContent = `${preview.ourMen === 1 ? "1 man" : `${preview.ourMen} men`}, call twice to fire`
    } else {
      title.textContent = TITLES[preview.kind]
      const carried = Math.round(Math.hypot(preview.drift.x, preview.drift.z))
      detail.textContent =
        carried > 2
          ? `Lands in about ${preview.delay} s, fires ${preview.duration} s, drifts ${carried} m downwind`
          : `Lands in about ${preview.delay} s, fires ${preview.duration} s`
    }
  }

  return {
    id: "call-preview",
    zone: "world",
    root,
    update(state: HudState) {
      // Nobody to make the call once the squad is gone.
      if (!state.soldier) {
        aiming = null
      }
    },
    frame() {
      const at = aiming ? context.pointerGround() : null
      root.style.display = at && aiming ? "" : "none"
      // The cursor turns plain while a call is aimed: the footprint on the ground says where it goes.
      if (context.canvas) {
        if (aiming) {
          context.canvas.dataset.orderMode = "call"
        } else if (context.canvas.dataset.orderMode === "call") {
          delete context.canvas.dataset.orderMode
        }
      }
      if (at && aiming) {
        draw(callPreview(context.sim, context.squad.side, aiming, at), at)
      }
    },
    dispose() {
      window.removeEventListener("keydown", onDown)
      window.removeEventListener("keyup", onUp)
      window.removeEventListener("pointerdown", putAway)
      window.removeEventListener("blur", onBlur)
    }
  }
}
