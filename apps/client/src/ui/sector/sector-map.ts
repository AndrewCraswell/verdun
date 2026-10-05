import { mapDepth, mapWidth } from "@verdun/map"
import { aidPost, enqueueCommand, isAlive, soldierIds } from "@verdun/sim"
import { h, setText } from "../../hud/dom.ts"
import { clockSeconds, metres } from "../../hud/format.ts"
import type { HudState } from "../../hud/hud-state.ts"
import type { BattleParts } from "../battle.ts"
import type { MenuPage } from "../page.ts"
import { fitPlan, fromPlan, groundImage, type PlanFit, SQUARE, squareName, toPlan, trenchOwner } from "./plan.ts"
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

/** The inks, read from the page's tokens, so the colour-vision palettes change the map too. */
function inks(element: Element) {
  const style = getComputedStyle(element)
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    ink: token("--paper-ink", "#2c261b"),
    ink2: token("--paper-ink-2", "rgb(44 38 27 / 72%)"),
    ink3: token("--paper-ink-3", "rgb(44 38 27 / 48%)"),
    rule: token("--paper-rule", "rgb(44 38 27 / 14%)"),
    ours: token("--paper-ours", "#2f5d9e"),
    theirs: token("--paper-theirs", "#b0341f"),
    brass: token("--paper-brass", "#8a6420"),
    caution: token("--paper-caution", "#b9780f")
  }
}

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
  let ground: HTMLCanvasElement | null = null
  let colours = inks(root)
  let flashTimer = 0

  function size(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
    const ratio = Math.min(2, devicePixelRatio || 1)
    canvas.width = Math.round(width * ratio)
    canvas.height = Math.round(height * ratio)
    const drawing = canvas.getContext("2d")
    drawing?.setTransform(ratio, 0, 0, ratio, 0, 0)
    return drawing
  }

  /** The ground, the squares, the trenches, the wire and what stands on the ground: drawn once a size. */
  function drawBase(parts: BattleParts): void {
    const width = canvasBox.clientWidth
    const height = canvasBox.clientHeight
    const { sim, squad } = parts
    const map = sim.map
    fit = fitPlan(map, width, height, 36)
    const drawing = size(base, width, height)
    size(live, width, height)
    if (!drawing) {
      return
    }
    colours = inks(root)
    if (!ground) {
      const image = groundImage(map, 1)
      ground = document.createElement("canvas")
      ground.width = image.width
      ground.height = image.height
      ground.getContext("2d")?.putImageData(new ImageData(image.data, image.width, image.height), 0, 0)
    }
    const at = (x: number, z: number) => toPlan(map, fit!, x, z)
    const topLeft = at(0, mapDepth(map))
    drawing.imageSmoothingEnabled = true
    drawing.drawImage(ground, topLeft.x, topLeft.y, mapWidth(map) * fit.scale, mapDepth(map) * fit.scale)
    drawing.strokeStyle = colours.ink2
    drawing.lineWidth = 1.2
    drawing.strokeRect(topLeft.x, topLeft.y, mapWidth(map) * fit.scale, mapDepth(map) * fit.scale)

    // The squares, lettered in their north-west corners.
    drawing.beginPath()
    for (let x = SQUARE; x < mapWidth(map); x += SQUARE) {
      const from = at(x, 0)
      const to = at(x, mapDepth(map))
      drawing.moveTo(from.x, from.y)
      drawing.lineTo(to.x, to.y)
    }
    for (let z = SQUARE; z < mapDepth(map); z += SQUARE) {
      const from = at(0, z)
      const to = at(mapWidth(map), z)
      drawing.moveTo(from.x, from.y)
      drawing.lineTo(to.x, to.y)
    }
    drawing.strokeStyle = colours.rule
    drawing.lineWidth = 1
    drawing.stroke()
    drawing.font = "600 11px 'Archivo Variable', sans-serif"
    drawing.fillStyle = colours.ink3
    drawing.textBaseline = "top"
    for (let x = 0; x < mapWidth(map); x += SQUARE) {
      for (let z = mapDepth(map); z > 0; z -= SQUARE) {
        const corner = at(x, z)
        drawing.fillText(squareName(map, x + 1, z - 1), corner.x + 4, corner.y + 4)
      }
    }

    const line = (points: readonly (readonly [number, number])[]) => {
      points.forEach(([x, z], index) => {
        const point = at(x, z)
        if (index === 0) {
          drawing.moveTo(point.x, point.y)
        } else {
          drawing.lineTo(point.x, point.y)
        }
      })
    }
    // The field railway, then the wire, then the trenches over them.
    drawing.setLineDash([7, 3])
    drawing.beginPath()
    for (const railway of map.railways) {
      line(railway.points)
    }
    drawing.strokeStyle = colours.ink3
    drawing.lineWidth = 1.4
    drawing.stroke()
    drawing.setLineDash([1.5, 3])
    drawing.beginPath()
    for (const belt of map.wire) {
      line(belt.points)
    }
    drawing.strokeStyle = colours.ink
    drawing.lineWidth = 2.4
    drawing.stroke()
    drawing.setLineDash([])
    drawing.lineJoin = "round"
    drawing.lineCap = "round"
    for (const owner of ["communication", "theirs", "ours"] as const) {
      drawing.beginPath()
      for (const trench of map.trenches) {
        if (trenchOwner(trench, squad.side) === owner) {
          line(trench.points)
        }
      }
      drawing.strokeStyle = { communication: colours.ink2, theirs: colours.theirs, ours: colours.ours }[owner]
      drawing.lineWidth = owner === "communication" ? 1.4 : 2.6
      drawing.stroke()
    }

    // Ruins and works as solid blocks, trees as rings, as the plans directeurs marked them.
    for (const item of map.scenery) {
      const point = at(item.x, item.z)
      if (item.kind === "ruin" || item.kind === "landmark" || item.kind === "bunker") {
        const side = Math.max(3, (item.kind === "landmark" ? 9 : 5) * item.scale * fit.scale * 0.6)
        drawing.fillStyle = colours.ink2
        drawing.fillRect(point.x - side / 2, point.y - side / 2, side, side)
      } else if (item.kind === "tree" || item.kind === "fruit-tree") {
        drawing.beginPath()
        drawing.arc(point.x, point.y, 1.6, 0, Math.PI * 2)
        drawing.strokeStyle = colours.ink3
        drawing.lineWidth = 0.8
        drawing.stroke()
      }
    }

    // Our aid post.
    const post = aidPost(map, squad.side)
    const cross = at(post.x, post.z)
    drawing.fillStyle = colours.ink
    drawing.fillRect(cross.x - 5, cross.y - 1.5, 10, 3)
    drawing.fillRect(cross.x - 1.5, cross.y - 5, 3, 10)
    drawing.font = "italic 500 11px 'Archivo Variable', sans-serif"
    drawing.textBaseline = "middle"
    drawing.fillText("Poste de secours", cross.x + 9, cross.y)
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
