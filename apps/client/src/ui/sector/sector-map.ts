import { enqueueCommand, isAlive, soldierIds } from "@verdun/sim"
import { h, setText } from "../../hud/dom.ts"
import { clockSeconds, metres } from "../../hud/format.ts"
import type { HudState } from "../../hud/hud-state.ts"
import type { BattleParts } from "../battle.ts"
import type { MenuPage } from "../page.ts"
import { drawPlan, planInks, sizeCanvas } from "./plan-canvas.ts"
import { fromPlan, type PlanFit, squareName, toPlan } from "./plan.ts"
import "./sector-map.css"

/** How often the men and the fire on the map are redrawn while it's open, in milliseconds. */
const REDRAW = 200
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const

/** "140 m north-east", from one point on the ground to another. */
function bearing(from: { x: number; z: number }, to: { x: number; z: number }): string {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const distance = Math.hypot(dx, dz)
  if (distance < 10) {
    return "here"
  }
  const sector = Math.round((Math.atan2(dx, dz) / (Math.PI * 2)) * 8 + 8) % 8
  return `${metres(distance)} ${COMPASS[sector]}`
}

const HOLDERS = { ours: "Ours", theirs: "Theirs", none: "No one's" } as const

/**
 * The sector map (S4 in docs/design/interface.md): the sector as a plan directeur, squared every 100 m, with the
 * trenches (ours blue, theirs red), the wire, the ruins and the field railway, and on it, live, the squad and its order,
 * our men, the enemy our side can see now, the objectives and their holders, and our side's fire. The battle goes on
 * while it's open. Click to look there; right-click to send the squad there.
 */
export function createSectorMapPage({
  battle,
  close
}: {
  readonly battle: () => BattleParts | null
  /** Puts the map away, after a click sends the camera somewhere. */
  readonly close: () => void
}): MenuPage {
  const base = h("canvas", "sector-base")
  const live = h("canvas", "sector-live")
  live.setAttribute("aria-label", "The sector map. Click to look there; right-click to send the squad there.")
  const readout = h("div", "sector-readout")
  const flash = h("div", "sector-flash")
  flash.setAttribute("role", "status")
  const canvasBox = h("div", "sector-canvas", base, live, readout, flash)
  const order = h("p", "sector-order")
  const objectives = h("div", "sector-objectives")
  const missions = h("div", "sector-missions")
  const side = h(
    "aside",
    "sector-side",
    h("h3", "ui-settings-heading", "Your squad"),
    order,
    h("p", "sector-help", "Click the map to look there. Right-click to send the squad there."),
    h("h3", "ui-settings-heading", "Objectives"),
    objectives,
    h("h3", "ui-settings-heading", "Our guns"),
    missions
  )
  const legend = h(
    "div",
    "sector-legend",
    h("span", "sector-key sector-key--ours", "Our trenches"),
    h("span", "sector-key sector-key--theirs", "Theirs"),
    h("span", "sector-key sector-key--wire", "Wire"),
    h("span", "sector-key sector-key--squad", "Your squad"),
    h("span", "sector-key sector-key--men", "Our men"),
    h("span", "sector-key sector-key--enemy", "Enemy seen now")
  )
  const root = h("div", "sector-page", h("div", "sector-main", canvasBox, legend), side)

  let fit: PlanFit | null = null
  let timer = 0
  let colours = planInks(root)
  let flashTimer = 0

  /** The ground, the squares, the trenches, the wire and what stands on the ground: drawn once a size. */
  function drawBase(parts: BattleParts): void {
    const width = canvasBox.clientWidth
    const height = canvasBox.clientHeight
    colours = planInks(root)
    fit = drawPlan(base, parts.sim.map, parts.squad.side, width, height, colours)
    sizeCanvas(live, width, height)
  }

  /** The live layer: objectives and holders, our fire, the men, the squad and its order. */
  function drawLive(parts: BattleParts, state: HudState | null): void {
    const drawing = live.getContext("2d")
    if (!drawing || !fit) {
      return
    }
    const { sim, squad, seen } = parts
    const map = sim.map
    const at = (x: number, z: number) => toPlan(map, fit!, x, z)
    drawing.clearRect(0, 0, live.width, live.height)

    for (const mission of state?.fire.missions ?? []) {
      for (const footprint of mission.footprints) {
        const a = at(footprint.fromX, footprint.z + footprint.band / 2)
        const b = at(footprint.toX, footprint.z - footprint.band / 2)
        if (mission.phase === "firing") {
          drawing.fillStyle = "rgb(176 52 31 / 18%)"
          drawing.fillRect(a.x, a.y, b.x - a.x, b.y - a.y)
          drawing.setLineDash([])
          drawing.strokeStyle = colours.theirs
        } else {
          drawing.setLineDash([6, 4])
          drawing.strokeStyle = colours.caution
        }
        drawing.lineWidth = 1.5
        drawing.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y)
      }
    }
    drawing.setLineDash([])

    drawing.textBaseline = "bottom"
    drawing.textAlign = "center"
    for (const objective of state?.sector.objectives ?? []) {
      const point = at(objective.x, objective.z)
      const radius = Math.max(
        8,
        (sim.objectives.find((each) => each.name === objective.name)?.radius ?? 15) * fit.scale
      )
      drawing.beginPath()
      drawing.arc(point.x, point.y, radius, 0, Math.PI * 2)
      drawing.setLineDash(objective.contested ? [4, 3] : [])
      drawing.strokeStyle = { ours: colours.ours, theirs: colours.theirs, none: colours.ink2 }[objective.holder]
      drawing.lineWidth = 2
      drawing.stroke()
      drawing.setLineDash([])
      drawing.font = "600 12px 'Archivo Variable', sans-serif"
      drawing.lineWidth = 3
      drawing.strokeStyle = "rgb(233 224 200 / 85%)"
      drawing.strokeText(objective.name, point.x, point.y - radius - 3)
      drawing.fillStyle = colours.ink
      drawing.fillText(objective.name, point.x, point.y - radius - 3)
    }
    drawing.textAlign = "left"

    const dots = (points: { x: number; y: number }[], colour: string, radius: number) => {
      drawing.beginPath()
      for (const point of points) {
        drawing.moveTo(point.x + radius, point.y)
        drawing.arc(point.x, point.y, radius, 0, Math.PI * 2)
      }
      drawing.fillStyle = colour
      drawing.fill()
      drawing.strokeStyle = "rgb(233 224 200 / 90%)"
      drawing.lineWidth = 0.8
      drawing.stroke()
    }
    const ours: { x: number; y: number }[] = []
    const theirs: { x: number; y: number }[] = []
    for (const soldier of soldierIds(sim)) {
      if (!isAlive(sim, soldier) || squad.members.includes(soldier)) {
        continue
      }
      const friend = sim.soldiers.side.value[soldier] === squad.side
      if (!friend && !seen(soldier)) {
        continue
      }
      ;(friend ? ours : theirs).push(at(sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier]))
    }
    dots(ours, colours.ours, 2.4)
    dots(theirs, colours.theirs, 2.6)

    const target = state?.order.target
    const leader = state?.soldier
    if (target && leader) {
      const from = at(leader.position.x, leader.position.z)
      const to = at(target.x, target.z)
      drawing.setLineDash([3, 4])
      drawing.beginPath()
      drawing.moveTo(from.x, from.y)
      drawing.lineTo(to.x, to.y)
      drawing.strokeStyle = colours.brass
      drawing.lineWidth = 1.5
      drawing.stroke()
      drawing.setLineDash([])
      drawing.beginPath()
      drawing.arc(to.x, to.y, 6, 0, Math.PI * 2)
      drawing.moveTo(to.x - 10, to.y)
      drawing.lineTo(to.x + 10, to.y)
      drawing.moveTo(to.x, to.y - 10)
      drawing.lineTo(to.x, to.y + 10)
      drawing.stroke()
    }
    dots(
      squad.members
        .filter((member) => isAlive(sim, member))
        .map((member) => at(sim.soldiers.position.x[member], sim.soldiers.position.z[member])),
      colours.brass,
      3.4
    )
    if (leader) {
      const ring = at(leader.position.x, leader.position.z)
      drawing.beginPath()
      drawing.arc(ring.x, ring.y, 8, 0, Math.PI * 2)
      drawing.strokeStyle = colours.brass
      drawing.lineWidth = 2
      drawing.stroke()
    }
  }

  /** The side panel: the squad's order, the objectives with their bearings, our fire. */
  function describe(state: HudState | null): void {
    if (!state) {
      return
    }
    setText(order, state.order.detail ? `${state.order.label}: ${state.order.detail}` : state.order.label)
    const from = state.soldier?.position ?? null
    objectives.replaceChildren(
      ...state.sector.objectives.map((objective) => {
        const item = h(
          "button",
          `sector-objective sector-objective--${objective.holder}`,
          h("span", "sector-objective-name", objective.name),
          h(
            "span",
            "sector-objective-state",
            `${objective.contested ? "Contested" : HOLDERS[objective.holder]}${from ? `, ${bearing(from, objective)}` : ""}`
          )
        )
        item.type = "button"
        item.addEventListener("click", () => lookThere(objective.x, objective.z))
        return item
      })
    )
    missions.replaceChildren(
      ...(state.fire.missions.length === 0
        ? [h("p", "sector-none", "No fire called.")]
        : state.fire.missions.map((mission) =>
            h(
              "p",
              `sector-mission sector-mission--${mission.phase}`,
              `${mission.label}, ${mission.place}: ${mission.phase === "pending" ? "rounds in" : "for"} ${clockSeconds(mission.seconds)}`
            )
          ))
    )
  }

  function redraw(): void {
    const parts = battle()
    if (!parts) {
      return
    }
    const state = parts.hud.state
    drawLive(parts, state)
    describe(state)
  }

  function say(text: string): void {
    setText(flash, text)
    flash.classList.add("sector-flash--on")
    clearTimeout(flashTimer)
    flashTimer = window.setTimeout(() => flash.classList.remove("sector-flash--on"), 2200)
  }

  function lookThere(x: number, z: number): void {
    battle()?.look(x, z)
    close()
  }

  function groundUnder(event: MouseEvent): { x: number; z: number } | null {
    const parts = battle()
    if (!parts || !fit) {
      return null
    }
    const box = live.getBoundingClientRect()
    return fromPlan(parts.sim.map, fit, event.clientX - box.left, event.clientY - box.top)
  }

  live.addEventListener("mousemove", (event) => {
    const parts = battle()
    const point = groundUnder(event)
    if (!parts || !point) {
      readout.hidden = true
      return
    }
    readout.hidden = false
    const leader = parts.hud.state?.soldier
    setText(
      readout,
      `Square ${squareName(parts.sim.map, point.x, point.z)}${leader ? `, ${bearing(leader.position, point)} of you` : ""}`
    )
  })
  live.addEventListener("mouseleave", () => {
    readout.hidden = true
  })
  live.addEventListener("click", (event) => {
    const point = groundUnder(event)
    if (point) {
      lookThere(point.x, point.z)
    }
  })
  live.addEventListener("contextmenu", (event) => {
    event.preventDefault()
    const parts = battle()
    const point = groundUnder(event)
    if (!parts || !point) {
      return
    }
    if (parts.squad.leader < 0) {
      say("Your squad is gone: there's no one to send.")
      return
    }
    enqueueCommand(parts.sim, {
      type: "squad-order",
      squad: parts.squad.id,
      order: { kind: "advance", x: point.x, z: point.z }
    })
    say(`Advancing to square ${squareName(parts.sim.map, point.x, point.z)}`)
    redraw()
  })

  const resize = new ResizeObserver(() => {
    const parts = battle()
    if (parts) {
      drawBase(parts)
      redraw()
    }
  })

  return {
    id: "sector",
    title: "Sector map",
    root,
    opened() {
      readout.hidden = true
      // Drawn at once, at the size it opens at; the observer redraws it when that changes.
      const parts = battle()
      if (parts) {
        drawBase(parts)
        redraw()
      }
      resize.observe(canvasBox)
      clearInterval(timer)
      timer = window.setInterval(redraw, REDRAW)
    },
    closed() {
      resize.disconnect()
      clearInterval(timer)
    },
    dispose() {
      resize.disconnect()
      clearInterval(timer)
      clearTimeout(flashTimer)
    }
  }
}
