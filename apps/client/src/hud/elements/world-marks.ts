import type { EntityId } from "@verdun/sim"
import type { HudElementFactory, ScreenPoint } from "../element.ts"
import { countdownWord, type Footprint, type MissionView } from "../fire-support.ts"
import { clockSeconds, metres } from "../format.ts"
import type { HudState } from "../hud-state.ts"
import type { IconName } from "../icons.ts"
import type { Holder } from "../sector-state.ts"
import type { RosterSlot } from "../soldier-state.ts"
import "./world-marks.css"

/**
 * W2, W4-W9: marks drawn on the battlefield, following the camera. Where our guns' shells will fall and are falling,
 * with their countdowns, and how far back to keep from a creeping barrage; where the squad was sent or told to hold;
 * the objectives, with who holds them; over the squad's men, the state of any in trouble and where the fallen lie; our
 * aid post, with the men being treated there, near it or in the overview. Where a wiped squad's replacements come up
 * is on the take-over map (take-over-marks.ts).
 * Drawn over the battle and under the panels, a fixed size on the screen at any zoom. Enemies are never marked: the
 * player learns where they are by seeing them.
 */

const SVG = "http://www.w3.org/2000/svg"
/** Footprint edges are followed over the ground in steps this long, in metres. */
const EDGE_STEP = 6
/** Marks over a man's head stand this high above the ground, in metres. */
const OVERHEAD = 2.4
/** Points this far outside the screen, in pixels, are still drawn, so marks slide off the edge rather than pop. */
const MARGIN = 80
/** Objectives closer than this, in metres, are named on the ground even outside the overview. */
const NEAR = 80

function element<K extends keyof SVGElementTagNameMap>(
  tag: K,
  className: string,
  attributes: Record<string, string | number> = {}
): SVGElementTagNameMap[K] {
  const created = document.createElementNS(SVG, tag)
  created.setAttribute("class", className)
  for (const [name, value] of Object.entries(attributes)) {
    created.setAttribute(name, String(value))
  }
  return created
}

function iconUse(name: IconName, size: number): SVGUseElement {
  const use = element("use", "wm-icon", {
    href: `#hud-i-${name}`,
    x: -size / 2,
    y: -size / 2,
    width: size,
    height: size
  })
  return use
}

function setAttribute(target: Element, name: string, value: string): void {
  if (target.getAttribute(name) !== value) {
    target.setAttribute(name, value)
  }
}

function setText(target: Element, text: string): void {
  if (target.textContent !== text) {
    target.textContent = text
  }
}

interface MissionMark {
  readonly group: SVGGElement
  readonly bands: SVGPathElement[]
  readonly standOff: SVGPathElement
  readonly label: SVGGElement
  readonly title: SVGTextElement
  readonly time: SVGTextElement
  mission: MissionView
}

interface ObjectiveMark {
  readonly group: SVGGElement
  readonly name: SVGTextElement
  readonly distance: SVGTextElement
  x: number
  z: number
  holder: Holder
}

interface ManMark {
  readonly group: SVGGElement
  readonly use: SVGUseElement
  slot: RosterSlot
}

const MAN_ICONS: Readonly<Partial<Record<RosterSlot["status"], IconName>>> = {
  shaken: "shaken",
  broken: "broken",
  pinned: "pinned",
  masking: "mask",
  gassed: "gas",
  wounded: "wound",
  down: "stretcher",
  carried: "carried",
  killed: "killed"
}

export const worldMarks: HudElementFactory = (context) => {
  const root = element("svg", "world-marks")
  root.setAttribute("aria-hidden", "true")
  const defs = element("defs", "")
  defs.innerHTML =
    '<pattern id="wm-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="9" height="9" fill="rgb(242 103 63 / 0.13)"/><line x1="0" y1="0" x2="0" y2="9" stroke="rgb(242 103 63 / 0.45)" stroke-width="3"/></pattern>'
  const missionsLayer = element("g", "wm-missions")
  const orderLayer = element("g", "wm-order")
  const objectivesLayer = element("g", "wm-objectives")
  const squadLayer = element("g", "wm-squad")
  const rearLayer = element("g", "wm-rear")
  // The stretch of the enemy's line our attack goes in on, in the overview: the war map draws it further out.
  const stretchPath = element("path", "wm-stretch")
  // Our own line over it, where the squads beside it assemble before zero hour.
  const assemblyPath = element("path", "wm-assembly")
  root.append(defs, stretchPath, assemblyPath, missionsLayer, objectivesLayer, rearLayer, orderLayer, squadLayer)

  const orderLine = element("path", "wm-order__line")
  const orderPin = element("g", "wm-order__pin")
  orderPin.append(
    element("circle", "wm-order__ring", { r: 11 }),
    element("path", "wm-order__cross", { d: "M-17 0H-7M7 0H17M0 -17V-7M0 7V17" }),
    element("circle", "wm-order__dot", { r: 2.2 }),
    iconUse("hold", 14)
  )
  // The order plate names the order: on the ground only how far an advance has to go.
  const orderDistance = element("text", "wm-text wm-order__distance", { y: 32 })
  orderPin.append(orderDistance)
  orderLayer.append(orderLine, orderPin)

  // W9: our aid post, a red cross, with how many men are being treated there.
  const post = element("g", "wm-post")
  const patients = element("text", "wm-text wm-post__count", { y: 27 })
  post.append(element("circle", "wm-post__disc", { r: 11 }), iconUse("aid-post", 15), patients)
  rearLayer.append(post)

  const missions = new Map<number, MissionMark>()
  const objectives = new Map<string, ObjectiveMark>()
  const men = new Map<EntityId, ManMark>()
  let latest: HudState | null = null

  const project = (x: number, z: number, lift = 0): ScreenPoint | null =>
    context.project(x, context.heightAt(x, z) + lift, z)

  const onScreen = (point: ScreenPoint | null): point is ScreenPoint =>
    point !== null &&
    point.x > -MARGIN &&
    point.y > -MARGIN &&
    point.x < innerWidth + MARGIN &&
    point.y < innerHeight + MARGIN

  function place(target: SVGGElement, point: ScreenPoint | null): boolean {
    const visible = onScreen(point)
    setAttribute(target, "visibility", visible ? "visible" : "hidden")
    if (visible) {
      setAttribute(target, "transform", `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`)
    }
    return visible
  }

  /** A path round a footprint, following the ground along its edges. */
  function outline(footprint: Footprint): string {
    const x0 = Math.min(footprint.fromX, footprint.toX)
    const x1 = Math.max(footprint.fromX, footprint.toX)
    const z0 = footprint.z - footprint.band / 2
    const z1 = footprint.z + footprint.band / 2
    const corners: (readonly [number, number])[] = [
      [x0, z0],
      [x1, z0],
      [x1, z1],
      [x0, z1],
      [x0, z0]
    ]
    let path = ""
    let drawing = false
    for (let corner = 0; corner < corners.length - 1; corner++) {
      const [ax, az] = corners[corner] ?? [0, 0]
      const [bx, bz] = corners[corner + 1] ?? [0, 0]
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / EDGE_STEP))
      for (let step = 0; step < steps; step++) {
        const t = step / steps
        const point = project(ax + (bx - ax) * t, az + (bz - az) * t, 0.2)
        if (!point) {
          drawing = false
          continue
        }
        path += `${drawing ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
        drawing = true
      }
    }
    return drawing ? `${path}Z` : path
  }

  /** Lines over the ground, as one path. */
  function groundPath(lines: readonly (readonly (readonly [number, number])[])[] | null | undefined): string {
    let path = ""
    for (const line of lines ?? []) {
      let open = false
      for (const [x, z] of line) {
        const point = project(x, z, 0.4)
        if (!point) {
          open = false
          continue
        }
        path += `${open ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
        open = true
      }
    }
    return path
  }

  /** A line across the ground at `z`, from `fromX` to `toX`. */
  function across(fromX: number, toX: number, z: number): string {
    let path = ""
    let drawing = false
    const steps = Math.max(1, Math.ceil(Math.abs(toX - fromX) / EDGE_STEP))
    for (let step = 0; step <= steps; step++) {
      const point = project(fromX + ((toX - fromX) * step) / steps, z, 0.3)
      if (!point) {
        drawing = false
        continue
      }
      path += `${drawing ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`
      drawing = true
    }
    return path
  }

  function missionMark(mission: MissionView): MissionMark {
    const group = element("g", "wm-mission")
    const standOff = element("path", "wm-mission__standoff")
    const label = element("g", "wm-mission__label")
    const title = element("text", "wm-text wm-mission__title", { y: -8 })
    const time = element("text", "wm-text wm-mission__time", { y: 12 })
    label.append(title, time)
    group.append(standOff, label)
    missionsLayer.append(group)
    return { group, bands: [], standOff, label, title, time, mission }
  }

  function syncMissions(state: HudState): void {
    const live = new Set(state.fire.missions.map((mission) => mission.id))
    for (const [id, mark] of missions) {
      if (!live.has(id)) {
        mark.group.remove()
        missions.delete(id)
      }
    }
    for (const mission of state.fire.missions) {
      const mark = missions.get(mission.id) ?? missionMark(mission)
      missions.set(mission.id, mark)
      mark.mission = mission
      while (mark.bands.length < mission.footprints.length) {
        const band = element("path", "wm-mission__band")
        mark.group.insertBefore(band, mark.standOff)
        mark.bands.push(band)
      }
      mark.group.dataset.phase = mission.phase
      mark.group.dataset.kind = mission.kind
      setText(mark.title, mission.label)
      setText(mark.time, `${countdownWord(mission)} ${clockSeconds(mission.seconds)}`)
    }
  }

  function syncObjectives(state: HudState): void {
    for (const objective of state.sector.objectives) {
      let mark = objectives.get(objective.name)
      if (!mark) {
        const group = element("g", "wm-objective")
        group.append(
          element("path", "wm-objective__shadow", { d: "M0 -26 L9 -15 L0 -4 L-9 -15 Z" }),
          element("path", "wm-objective__glyph", { d: "M0 -26 L9 -15 L0 -4 L-9 -15 Z" }),
          element("circle", "wm-objective__stake", { r: 2.2 })
        )
        const name = element("text", "wm-text wm-objective__name", { y: -32 })
        const distance = element("text", "wm-text wm-objective__distance", { y: 16 })
        group.append(name, distance)
        objectivesLayer.append(group)
        mark = { group, name, distance, x: objective.x, z: objective.z, holder: objective.holder }
        objectives.set(objective.name, mark)
      }
      mark.holder = objective.holder
      mark.group.dataset.holder = objective.holder
      if (objective.contested) {
        mark.group.dataset.contested = ""
      } else {
        delete mark.group.dataset.contested
      }
      // Named on the ground when it's close, contested or just changed hands; otherwise only in the overview.
      const named = objective.contested || state.attention.objectives || (objective.distance ?? Infinity) < NEAR
      if (named) {
        mark.group.dataset.named = ""
      } else {
        delete mark.group.dataset.named
      }
      setText(mark.name, objective.name)
      setText(mark.distance, objective.distance === null ? "" : metres(objective.distance))
    }
  }

  function syncMen(state: HudState): void {
    const marked = new Set<EntityId>()
    for (const slot of state.roster) {
      const glyph = MAN_ICONS[slot.status]
      if (slot.controlled || !glyph) {
        continue
      }
      marked.add(slot.id)
      let mark = men.get(slot.id)
      if (!mark) {
        const group = element("g", "wm-man")
        group.append(element("circle", "wm-man__disc", { r: 9.5 }))
        const use = iconUse(glyph, 13)
        group.append(use)
        squadLayer.append(group)
        mark = { group, use, slot }
        men.set(slot.id, mark)
      }
      mark.slot = slot
      setAttribute(mark.use, "href", `#hud-i-${glyph}`)
      mark.group.dataset.severity = slot.severity
      mark.group.dataset.fighting = String(slot.fighting)
    }
    for (const [id, mark] of men) {
      if (!marked.has(id)) {
        mark.group.remove()
        men.delete(id)
      }
    }
  }

  return {
    id: "world-marks",
    zone: "world",
    root,
    update(state: HudState) {
      latest = state
      // In the overview and the war map's view everything is drawn in full; otherwise only what matters now.
      if (state.view.overview || state.view.tactical > 0.5) {
        root.dataset.full = ""
      } else {
        delete root.dataset.full
      }
      syncMissions(state)
      syncObjectives(state)
      syncMen(state)
      const { order } = state
      orderLayer.dataset.kind = order.kind
      setText(orderDistance, order.kind === "advance" ? (order.detail ?? "") : "")
      const { rear } = state
      const here = state.soldier?.position
      const near = here ? Math.hypot(rear.aidPost.x - here.x, rear.aidPost.z - here.z) < NEAR : false
      setAttribute(post, "display", root.dataset.full !== undefined || near ? "inline" : "none")
      setText(patients, rear.aidPost.patients > 0 ? String(rear.aidPost.patients) : "")
    },
    frame(state) {
      const now = latest ?? state
      const overview = now.view.overview && now.view.tactical <= 0.5
      setAttribute(stretchPath, "d", overview ? groundPath(now.operation?.stretch) : "")
      setAttribute(assemblyPath, "d", overview ? groundPath(now.operation?.assembly) : "")
      const soldier = now.soldier?.position ?? null
      const from = soldier ? project(soldier.x, soldier.z, 0.2) : null

      for (const mark of missions.values()) {
        const { mission } = mark
        mission.footprints.forEach((footprint, index) => {
          const band = mark.bands[index]
          if (band) {
            setAttribute(band, "d", outline(footprint))
          }
        })
        const [first] = mission.footprints
        if (!first) {
          continue
        }
        // The label sits on the footprint at the point nearest the man under control.
        const lowX = Math.min(first.fromX, first.toX) + 8
        const highX = Math.max(first.fromX, first.toX) - 8
        const x = Math.min(highX, Math.max(lowX, soldier?.x ?? (lowX + highX) / 2))
        place(mark.label, project(x, first.z, 1))
        if (mission.creep) {
          // How far back to keep from a creeping barrage: the infantry walk 70 m behind its line.
          const back = mission.creep.z - mission.creep.direction * 70
          setAttribute(mark.standOff, "d", across(first.fromX, first.toX, back))
        } else {
          setAttribute(mark.standOff, "d", "")
        }
      }

      for (const mark of objectives.values()) {
        place(mark.group, project(mark.x, mark.z, 0.5))
      }

      const target = now.order.target
      const showOrder = target !== null && now.soldier !== null && now.order.label !== "In position"
      // Display rather than visibility: a child made visible would show through a hidden parent.
      setAttribute(orderLayer, "display", showOrder ? "inline" : "none")
      if (showOrder) {
        const pin = project(target.x, target.z, 0.2)
        place(orderPin, pin)
        setAttribute(
          orderLine,
          "d",
          from && pin ? `M${from.x.toFixed(1)} ${from.y.toFixed(1)}L${pin.x.toFixed(1)} ${pin.y.toFixed(1)}` : ""
        )
      }

      place(post, project(now.rear.aidPost.x, now.rear.aidPost.z, 0.5))

      for (const mark of men.values()) {
        const at = context.positionOf(mark.slot.id)
        place(mark.group, project(at.x, at.z, mark.slot.fighting ? OVERHEAD : 0.4))
      }
    }
  }
}
