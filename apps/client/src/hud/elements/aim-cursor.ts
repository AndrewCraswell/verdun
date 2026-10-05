import { WEAPONS } from "@verdun/sim"
import type { HudElementFactory } from "../element.ts"
import type { HudState, ShotChance } from "../hud-state.ts"
import { interfaceSettings } from "../interface-settings.ts"
import { weaponOf } from "../squad-names.ts"
import "./aim-cursor.css"

/**
 * H8: the pointer over the battlefield, where the man aims. The battlefield's own reticle (style.css) is the resting
 * one; this draws its states over it: closed into a red ring over the man a shot would hit now, the ring filling as his
 * aim steadies on him; a bar under the mark when his own parapet or crater lip is in the way; a grey dashed ring on a
 * man only a squadmate can see; a dotted one on a man too dark or smoky to make out; spread wide when his aim is
 * spoiled; a ring filling while he works the bolt. Drawn as the browser's own cursor, so it never lags the mouse however
 * busy the frame. With no man under control it hands the pointer back to the stylesheet's.
 */

const SIZE = 32
const CENTRE = SIZE / 2
/** Reload frames drawn ahead: the ring fills in this many steps. */
const RELOAD_STEPS = 8
/** Steadying frames drawn ahead: the red ring closes in this many steps. */
const STEADY_STEPS = 6

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
  /** A bar under the mark: his own cover is in the way. */
  readonly bar?: boolean
  /** The ring drawn dashed or dotted, as an SVG dash pattern. */
  readonly dash?: string
  /** The rest of the ring drawn faint behind a partial one, so it reads as filling. */
  readonly ringTrack?: boolean
}

/** A reticle as a cursor, drawn `scale` times its size: the player's marker size. */
function svgOf(reticle: Reticle, scale: number): string {
  const size = Math.round(SIZE * scale)
  return `url("${imageOf(reticle, scale)}") ${Math.round(size / 2)} ${Math.round(size / 2)}, crosshair`
}

/** A reticle as an SVG image's URL, drawn `scale` times its size. */
function imageOf(
  { gap, tick, colour, ring, ringColour, dot, pips, slash, bar, dash, ringTrack }: Reticle,
  scale: number
): string {
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
  const pattern = dash ?? `${(Math.max(0, ring ?? 0) * circumference).toFixed(2)} ${circumference.toFixed(2)}`
  const track = ringTrack
    ? `<circle cx="${CENTRE}" cy="${CENTRE}" r="${radius}" fill="none" stroke="${ringColour ?? colour}" stroke-opacity=".35" stroke-width="1.2"/>`
    : ""
  const arc =
    ring === null
      ? ""
      : `<circle cx="${CENTRE}" cy="${CENTRE}" r="${radius}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="3.6"/>` +
        track +
        `<circle cx="${CENTRE}" cy="${CENTRE}" r="${radius}" fill="none" stroke="${ringColour ?? colour}" stroke-width="1.8" ` +
        `stroke-dasharray="${pattern}" transform="rotate(-90 ${CENTRE} ${CENTRE})"/>`
  const ledge = bar
    ? `<path d="M${CENTRE - 7} ${CENTRE + 4.5}H${CENTRE + 7}" stroke="#000" stroke-opacity=".6" stroke-width="4.4" stroke-linecap="round"/>` +
      `<path d="M${CENTRE - 7} ${CENTRE + 4.5}H${CENTRE + 7}" stroke="${colour}" stroke-width="2.4" stroke-linecap="round"/>`
    : ""
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
    `<path d="${lines}" stroke="${colour}" stroke-width="1.7" stroke-linecap="round"/>${arc}${centre}${pipMarks}${struck}${ledge}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** The image inside a cursor made by `svgOf`, for the aim view's reticle. */
function imageIn(cursor: string): string {
  return /^url\("([^"]+)"\)/.exec(cursor)?.[1] ?? ""
}

/** The squad markers' gold, as the battlefield's own reticle (style.css) draws it, so the two read as one. */
const INK = "#f2d973"
const DANGER = "#ff6a43"
/** A man his soldier can't make out: grey, like the ghosted men a squadmate reports. */
const HIDDEN = "#c9c6bb"

interface Cursors {
  readonly aim: string
  readonly spoiled: string
  /** Over the sky or past the map's edge: a shot or a call there does nothing. */
  readonly offMap: string
  /** Beyond the weapon's reach: it can fire, but won't carry there. */
  readonly outOfRange: string
  /** Giving an order or a call (the orders wheel, a call's preview): a plain mark, the rest is on the ground. */
  readonly order: string
  /** His own cover is in the way of the man he aims at: step up, or out. */
  readonly blocked: string
  /** Aiming at a man only a squadmate can see. */
  readonly unseen: string
  /** Aiming at a man too dark, too far in the murk or behind smoke to make out. */
  readonly dark: string
  /** On target, by how steady the aim is (`STEADY_STEPS` + 1 frames), with the shot's chance shown or not. */
  readonly targets: readonly string[]
  readonly chances: Readonly<Record<ShotChance, readonly string[]>>
  readonly reloading: readonly string[]
}

/** The cursors at a size, drawn once each. */
function cursorsAt(scale: number): Cursors {
  const steadying = (pips?: number) =>
    Array.from({ length: STEADY_STEPS + 1 }, (_, step) =>
      svgOf(
        {
          gap: 7.5,
          tick: 4.5,
          colour: DANGER,
          ring: 0.25 + (0.75 * step) / STEADY_STEPS,
          ringColour: DANGER,
          ringTrack: true,
          dot: true,
          ...(pips === undefined ? {} : { pips })
        },
        scale
      )
    )
  return {
    aim: svgOf({ gap: 4.5, tick: 5, colour: INK, ring: null, dot: true }, scale),
    spoiled: svgOf({ gap: 8.5, tick: 4.5, colour: INK, ring: null, dot: true }, scale),
    offMap: svgOf({ gap: 4.5, tick: 3.5, colour: "rgba(242,217,115,.55)", ring: null, dot: false, slash: true }, scale),
    outOfRange: svgOf({ gap: 10, tick: 3, colour: "rgba(242,217,115,.6)", ring: null, dot: true }, scale),
    order: svgOf({ gap: 2.5, tick: 7, colour: INK, ring: null, dot: false }, scale),
    blocked: svgOf({ gap: 4.5, tick: 4, colour: INK, ring: null, dot: true, bar: true }, scale),
    unseen: svgOf({ gap: 7.5, tick: 3.5, colour: HIDDEN, ring: 1, dash: "2.4 2.2", dot: false }, scale),
    dark: svgOf({ gap: 7.5, tick: 3, colour: "rgba(242,217,115,.55)", ring: 1, dash: "0.6 2.6", dot: false }, scale),
    targets: steadying(),
    chances: {
      good: steadying(PIPS.good),
      fair: steadying(PIPS.fair),
      poor: steadying(PIPS.poor)
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
  // In the aim view the pointer is locked and hidden: the same marks sit in the middle of the screen, where he aims.
  const root = document.createElement("img")
  root.className = "aim-reticle"
  root.alt = ""
  root.hidden = true
  let centred = ""

  return {
    id: "aim-cursor",
    zone: "screen",
    root,
    frame() {
      const share = context.aimView()
      root.hidden = share <= 0.05 || shown === ""
      root.style.opacity = share.toFixed(2)
    },
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
      const aiming = cursor.state !== "reload" && cursor.state !== "none"
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
      } else if ((cursor.state === "aim" && far) || cursor.state === "range") {
        next = cursors.outOfRange
      } else if (cursor.state === "target") {
        const frames = showChance && cursor.chance ? cursors.chances[cursor.chance] : cursors.targets
        next = frames[Math.round(cursor.steadiness * STEADY_STEPS)] ?? frames[0] ?? cursors.aim
      } else if (cursor.state === "blocked") {
        next = cursors.blocked
      } else if (cursor.state === "unseen") {
        next = cursors.unseen
      } else if (cursor.state === "dark") {
        next = cursors.dark
      } else if (cursor.state === "reload") {
        next = cursors.reloading[Math.min(RELOAD_STEPS, Math.floor(cursor.ready * RELOAD_STEPS))] ?? cursors.aim
      } else if (cursor.state === "aim") {
        next = cursor.shaken ? cursors.spoiled : cursors.aim
      }
      if (next !== shown) {
        shown = next
        canvas.style.cursor = next
      }
      const image = imageIn(next)
      if (image !== centred) {
        centred = image
        root.src = image
        root.style.width = `${Math.round(SIZE * size)}px`
      }
    },
    dispose() {
      if (context.canvas) {
        context.canvas.style.cursor = ""
      }
    }
  }
}
