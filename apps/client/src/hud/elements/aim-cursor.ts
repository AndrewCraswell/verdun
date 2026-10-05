import { WEAPONS } from "@verdun/sim"
import type { HudElementFactory } from "../element.ts"
import type { HudState, ShotChance } from "../hud-state.ts"
import { interfaceSettings } from "../interface-settings.ts"
import { weaponOf } from "../squad-names.ts"

/**
 * H8: the pointer over the battlefield, where the man aims. The battlefield's own reticle (style.css) is the resting
 * one; this draws its states over it: closed into a red ring over the man a shot would hit now, spread wide when his
 * aim is spoiled, a ring filling while he works the bolt. Drawn as the browser's own cursor, so it never lags the mouse
 * however busy the frame. With no man under control it hands the pointer back to the stylesheet's.
 */

const SIZE = 32
const CENTRE = SIZE / 2
/** Reload frames drawn ahead: the ring fills in this many steps. */
const RELOAD_STEPS = 8

/** Pips under the ring for a shot's chance: three for good, two for fair, one for poor. */
const PIPS: Readonly<Record<ShotChance, number>> = { good: 3, fair: 2, poor: 1 }

interface Reticle {
  /** Gap from the centre to the ticks, and their length, in pixels. */
  readonly gap: number
  readonly tick: number
  readonly colour: string
  readonly ring: number | null
  readonly ringColour?: string
  readonly dot: boolean
  /** Chance pips under it, out of three, or none. */
  readonly pips?: number
  /** Struck through: nothing will happen here. */
  readonly slash?: boolean
}

/** A reticle as a cursor, drawn `scale` times its size: the player's marker size. */
function svgOf({ gap, tick, colour, ring, ringColour, dot, pips, slash }: Reticle, scale: number): string {
  const lines = [
    [CENTRE, CENTRE - gap, CENTRE, CENTRE - gap - tick],
    [CENTRE, CENTRE + gap, CENTRE, CENTRE + gap + tick],
    [CENTRE - gap, CENTRE, CENTRE - gap - tick, CENTRE],
    [CENTRE + gap, CENTRE, CENTRE + gap + tick, CENTRE]
  ]
    .map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`)
    .join("")
  const radius = 6.5
  const circumference = 2 * Math.PI * radius
  const arc =
    ring === null
      ? ""
      : `<circle cx="${CENTRE}" cy="${CENTRE}" r="${radius}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="3.6"/>` +
        `<circle cx="${CENTRE}" cy="${CENTRE}" r="${radius}" fill="none" stroke="${ringColour ?? colour}" stroke-width="1.8" ` +
        `stroke-dasharray="${(ring * circumference).toFixed(2)} ${circumference.toFixed(2)}" transform="rotate(-90 ${CENTRE} ${CENTRE})"/>`
  const centre = dot
    ? `<circle cx="${CENTRE}" cy="${CENTRE}" r="2.1" fill="#000" fill-opacity=".6"/><circle cx="${CENTRE}" cy="${CENTRE}" r="1.25" fill="${colour}"/>`
    : ""
  // Three small pips in a row under the ring, the ones not earned left hollow: readable without words or numbers.
  const pipMarks =
    pips === undefined
      ? ""
      : [0, 1, 2]
          .map((index) => {
            const x = CENTRE - 5 + index * 5
            const solid = index < pips
            return (
              `<circle cx="${x}" cy="${SIZE - 3.2}" r="2.1" fill="#000" fill-opacity=".6"/>` +
              `<circle cx="${x}" cy="${SIZE - 3.2}" r="1.3" fill="${solid ? colour : "none"}" stroke="${colour}" stroke-width=".6"/>`
            )
          })
          .join("")
  const struck = slash
    ? `<path d="M${CENTRE - 7} ${CENTRE + 7}L${CENTRE + 7} ${CENTRE - 7}" stroke="#000" stroke-opacity=".6" stroke-width="3.4" stroke-linecap="round"/>` +
      `<path d="M${CENTRE - 7} ${CENTRE + 7}L${CENTRE + 7} ${CENTRE - 7}" stroke="${colour}" stroke-width="1.5" stroke-linecap="round"/>`
    : ""
  const size = Math.round(SIZE * scale)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<path d="${lines}" stroke="#000" stroke-opacity=".6" stroke-width="3.6" stroke-linecap="round"/>` +
    `<path d="${lines}" stroke="${colour}" stroke-width="1.7" stroke-linecap="round"/>${arc}${centre}${pipMarks}${struck}</svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${Math.round(size / 2)} ${Math.round(size / 2)}, crosshair`
}

/** The squad markers' gold, as the battlefield's own reticle (style.css) draws it, so the two read as one. */
const INK = "#f2d973"
const DANGER = "#ff6a43"

interface Cursors {
  readonly aim: string
  readonly spoiled: string
  /** Over the sky or past the map's edge: a shot or a call there does nothing. */
  readonly offMap: string
  /** Beyond the weapon's reach: it can fire, but won't carry there. */
  readonly outOfRange: string
  /** Giving an order or a call (the orders wheel, a call's preview): a plain mark, the rest is on the ground. */
  readonly order: string
  readonly target: string
  /** On target, with the shot's chance shown. */
  readonly chances: Readonly<Record<ShotChance, string>>
  readonly reloading: readonly string[]
}

/** The cursors at a size, drawn once each. */
function cursorsAt(scale: number): Cursors {
  const onTarget = (pips: number) =>
    svgOf({ gap: 7.5, tick: 4.5, colour: DANGER, ring: 1, ringColour: DANGER, dot: true, pips }, scale)
  return {
    aim: svgOf({ gap: 4.5, tick: 5, colour: INK, ring: null, dot: true }, scale),
    spoiled: svgOf({ gap: 8.5, tick: 4.5, colour: INK, ring: null, dot: true }, scale),
    offMap: svgOf({ gap: 4.5, tick: 3.5, colour: "rgba(242,217,115,.55)", ring: null, dot: false, slash: true }, scale),
    outOfRange: svgOf({ gap: 10, tick: 3, colour: "rgba(242,217,115,.6)", ring: null, dot: true }, scale),
    order: svgOf({ gap: 2.5, tick: 7, colour: INK, ring: null, dot: false }, scale),
    target: svgOf({ gap: 7.5, tick: 4.5, colour: DANGER, ring: 1, ringColour: DANGER, dot: true }, scale),
    chances: {
      good: onTarget(PIPS.good),
      fair: onTarget(PIPS.fair),
      poor: onTarget(PIPS.poor)
    },
    reloading: Array.from({ length: RELOAD_STEPS + 1 }, (_, step) =>
      svgOf(
        { gap: 4.5, tick: 4, colour: "rgba(242,217,115,.5)", ring: step / RELOAD_STEPS, ringColour: INK, dot: false },
        scale
      )
    )
  }
}

export const aimCursor: HudElementFactory = (context) => {
  let shown = ""
  let size = 1
  let cursors = cursorsAt(size)

  return {
    id: "aim-cursor",
    zone: "none",
    root: null,
    update(state: HudState) {
      const canvas = context.canvas
      if (!canvas) {
        return
      }
      const { markers: wanted, hitChance: showChance } = interfaceSettings().current
      if (wanted !== size) {
        size = wanted
        cursors = cursorsAt(size)
      }
      const { cursor } = state
      let next = ""
      const aiming = cursor.state === "aim" || cursor.state === "target"
      const ground = aiming ? context.pointerGround() : null
      const soldier = state.soldier
      const reach = soldier ? WEAPONS[weaponOf(context.sim, soldier.id)].range : Infinity
      const far =
        ground !== null &&
        soldier !== null &&
        Math.hypot(ground.x - soldier.position.x, ground.z - soldier.position.z) > reach
      if (cursor.state !== "none" && canvas.dataset.orderMode) {
        next = cursors.order
      } else if (aiming && ground === null) {
        next = cursors.offMap
      } else if (cursor.state === "aim" && far) {
        next = cursors.outOfRange
      } else if (cursor.state === "target") {
        next = showChance && cursor.chance ? cursors.chances[cursor.chance] : cursors.target
      } else if (cursor.state === "reload") {
        next = cursors.reloading[Math.min(RELOAD_STEPS, Math.floor(cursor.ready * RELOAD_STEPS))] ?? cursors.aim
      } else if (cursor.state === "aim") {
        next = cursor.shaken ? cursors.spoiled : cursors.aim
      }
      if (next !== shown) {
        shown = next
        canvas.style.cursor = next
      }
    },
    dispose() {
      if (context.canvas) {
        context.canvas.style.cursor = ""
      }
    }
  }
}
