import { mapDepth, mapWidth } from "@verdun/map"
import { isAlive, Side, soldierIds } from "@verdun/sim"
import type { HudElementFactory, ScreenPoint } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import "./war-map.css"

/**
 * The war map's view (W11 and S4 in docs/design/interface.md, brought into the battle): as the camera pulls back past a
 * hundred and fifty metres, the battlefield turns into a trench map drawn over the ground. Squares of 100 m lettered
 * as on the period maps; every trench, ours in blue and the enemy's in red, as the French plans directeurs drew them;
 * our men as blue dots and the squad in brass; and the enemy in red, but only the men our side can see now. Faded in
 * with the distance. Two canvases: the ground's lines (the grid, the trenches, our attack's stretch) are drawn again only
 * when the camera moves, since re-projecting every line each frame cost more than all the rest of the HUD; the men,
 * who move all the time, over them every frame.
 */

/** The camera's distance, in metres, over which the map fades in: from the men to above them. */
const FADE = { from: 150, to: 230 } as const
/** The squares, in metres, and the letters of their columns. */
const SQUARE = 100
const COLUMNS = "ABCDEFGHJKLMNOP"
/** Ground lines are followed over the terrain in steps this long, in metres. */
const STEP = 8

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)))
  return t * t * (3 - 2 * t)
}

/** The colours the map draws with: read from the HUD's tokens, so a colour-vision palette changes them too. */
function inks(element: Element): { ours: string; theirs: string; brass: string; ink: string } {
  const style = getComputedStyle(element)
  const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    ours: token("--hud-ours", "#87a9da"),
    theirs: token("--hud-theirs", "#d4644b"),
    brass: token("--hud-brass-bright", "#e8ca88"),
    ink: token("--hud-ink", "#efe7d3")
  }
}

export const warMap: HudElementFactory = (context) => {
  const root = document.createElement("div")
  root.className = "war-map"
  root.setAttribute("aria-hidden", "true")
  const ground = document.createElement("canvas")
  const men = document.createElement("canvas")
  ground.className = "war-map__layer"
  men.className = "war-map__layer"
  root.append(ground, men)
  const layers = [ground.getContext("2d"), men.getContext("2d")] as const
  // The canvas being drawn on now: the ground's or the men's.
  let drawing: CanvasRenderingContext2D | null = null
  // What the ground's canvas was last drawn for: the camera's view, the screen's size and our attack's stretch.
  let groundDrawn = ""
  let stretchDrawn: unknown = null
  const { sim, squad } = context
  const width = mapWidth(sim.map)
  const depth = mapDepth(sim.map)
  let colours = inks(root)
  let shown = 0

  const project = (x: number, z: number, lift = 0.3): ScreenPoint | null =>
    context.project(x, context.heightAt(x, z) + lift, z)

  /** A line over the ground through points, following its rise and fall between them. */
  function groundLine(points: readonly (readonly [number, number])[]): void {
    if (!drawing) {
      return
    }
    let open = false
    for (let index = 0; index < points.length - 1; index++) {
      const [ax, az] = points[index] ?? [0, 0]
      const [bx, bz] = points[index + 1] ?? [0, 0]
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP))
      for (let step = index === 0 ? 0 : 1; step <= steps; step++) {
        const t = step / steps
        const point = project(ax + (bx - ax) * t, az + (bz - az) * t)
        if (!point) {
          open = false
          continue
        }
        if (open) {
          drawing.lineTo(point.x, point.y)
        } else {
          drawing.moveTo(point.x, point.y)
          open = true
        }
      }
    }
  }

  function resize(): void {
    const ratio = Math.min(2, devicePixelRatio || 1)
    const pixelsWide = Math.round(innerWidth * ratio)
    const pixelsHigh = Math.round(innerHeight * ratio)
    for (const [index, canvas] of [ground, men].entries()) {
      if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
        canvas.width = pixelsWide
        canvas.height = pixelsHigh
        // A canvas resized loses what was on it.
        groundDrawn = ""
      }
      layers[index]?.setTransform(ratio, 0, 0, ratio, 0, 0)
    }
  }

  /** The camera's view, as where three corners of the sector fall on the screen: if none has moved, nor has the view. */
  function viewKey(): string {
    const corner = (x: number, z: number) => {
      const point = context.project(x, 0, z)
      return point ? `${point.x.toFixed(1)},${point.y.toFixed(1)}` : "-"
    }
    return `${innerWidth}x${innerHeight}|${corner(0, 0)}|${corner(width, 0)}|${corner(0, depth)}`
  }

  function drawGrid(): void {
    if (!drawing) {
      return
    }
    drawing.beginPath()
    for (let x = 0; x <= width; x += SQUARE) {
      groundLine([
        [x, 0],
        [x, depth]
      ])
    }
    for (let z = 0; z <= depth; z += SQUARE) {
      groundLine([
        [0, z],
        [width, z]
      ])
    }
    drawing.strokeStyle = "rgb(239 231 211 / 22%)"
    drawing.lineWidth = 1
    drawing.stroke()
    // Each square's name, in its north-west corner, as a trench map squares its sheet: column letter, row number.
    drawing.font = "600 11px 'Archivo Variable', sans-serif"
    drawing.fillStyle = "rgb(239 231 211 / 45%)"
    drawing.textAlign = "left"
    drawing.textBaseline = "top"
    const rows = Math.ceil(depth / SQUARE)
    for (let column = 0; column * SQUARE < width; column++) {
      for (let row = 0; row < rows; row++) {
        const corner = project(column * SQUARE + 4, depth - row * SQUARE - 4)
        if (corner) {
          drawing.fillText(`${COLUMNS[column] ?? "?"}${row + 1}`, corner.x + 2, corner.y + 2)
        }
      }
    }
  }

  function drawTrenches(): void {
    if (!drawing) {
      return
    }
    // Each army's fire trenches face the other: the French north, the Germans south.
    const ourFacing = squad.side === Side.French ? "north" : "south"
    const strokes: { readonly colour: string; readonly width: number; readonly facing: string | null }[] = [
      { colour: "rgb(239 231 211 / 45%)", width: 1.5, facing: null },
      { colour: colours.ours, width: 2.6, facing: ourFacing },
      { colour: colours.theirs, width: 2.6, facing: ourFacing === "north" ? "south" : "north" }
    ]
    for (const { colour, width: lineWidth, facing } of strokes) {
      drawing.beginPath()
      for (const trench of sim.map.trenches) {
        if (trench.facing === facing) {
          groundLine(trench.points)
        }
      }
      drawing.strokeStyle = colour
      drawing.lineWidth = lineWidth
      drawing.lineJoin = "round"
      drawing.stroke()
    }
  }

  /** The stretch of the enemy's line the attack goes in on: brass over their red, for the attackers. */
  function drawStretch(state: HudState): void {
    const stretch = state.operation?.stretch
    if (!drawing || !stretch || stretch.length === 0) {
      return
    }
    drawing.beginPath()
    for (const line of stretch) {
      groundLine(line)
    }
    drawing.lineJoin = "round"
    drawing.lineCap = "round"
    drawing.strokeStyle = "rgb(8 7 5 / 70%)"
    drawing.lineWidth = 9
    drawing.stroke()
    drawing.strokeStyle = colours.brass
    drawing.lineWidth = 5
    drawing.stroke()
    // Named once, over the middle of its longest run.
    const longest = [...stretch].sort((a, b) => b.length - a.length)[0]
    const middle = longest?.[Math.floor(longest.length / 2)]
    const label = middle ? project(middle[0], middle[1], 6) : null
    if (label) {
      drawing.font = "700 12px 'Archivo Variable', sans-serif"
      drawing.textAlign = "center"
      drawing.textBaseline = "bottom"
      drawing.lineWidth = 3.5
      drawing.strokeStyle = "rgb(8 7 5 / 85%)"
      drawing.strokeText("OUR ATTACK", label.x, label.y - 6)
      drawing.fillStyle = colours.brass
      drawing.fillText("OUR ATTACK", label.x, label.y - 6)
    }
  }

  function drawSoldiers(state: HudState): void {
    const pen = drawing
    if (!pen) {
      return
    }
    const ours: ScreenPoint[] = []
    const theirs: ScreenPoint[] = []
    for (const soldier of soldierIds(sim)) {
      if (!isAlive(sim, soldier) || squad.members.includes(soldier)) {
        continue
      }
      const friend = sim.soldiers.side.value[soldier] === squad.side
      if (!friend && !context.seen(soldier)) {
        continue
      }
      const point = project(sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier], 1)
      if (point && friend) {
        ours.push(point)
      } else if (point) {
        theirs.push(point)
      }
    }
    const dots = (points: readonly ScreenPoint[], colour: string, radius: number) => {
      pen.beginPath()
      for (const point of points) {
        pen.moveTo(point.x + radius, point.y)
        pen.arc(point.x, point.y, radius, 0, Math.PI * 2)
      }
      pen.fillStyle = colour
      pen.fill()
      pen.lineWidth = 1
      pen.strokeStyle = "rgb(8 7 5 / 70%)"
      pen.stroke()
    }
    dots(ours, colours.ours, 2.6)
    dots(theirs, colours.theirs, 2.8)
    // The player's own squad, in brass, the man under control ringed.
    const squadPoints: ScreenPoint[] = []
    for (const member of squad.members) {
      if (!isAlive(sim, member)) {
        continue
      }
      const point = project(sim.soldiers.position.x[member], sim.soldiers.position.z[member], 1)
      if (point) {
        squadPoints.push(point)
      }
    }
    dots(squadPoints, colours.brass, 3.4)
    const leader = state.soldier
    const ring = leader ? project(leader.position.x, leader.position.z, 1) : null
    if (ring) {
      pen.beginPath()
      pen.arc(ring.x, ring.y, 7.5, 0, Math.PI * 2)
      pen.strokeStyle = colours.brass
      pen.lineWidth = 1.8
      pen.stroke()
    }
  }

  return {
    id: "war-map",
    zone: "world",
    root,
    update() {
      // Everything it draws moves every frame: see frame().
    },
    frame(state) {
      const fade = smoothstep(FADE.from, FADE.to, context.cameraDistance())
      if (fade <= 0.001 && shown <= 0.001) {
        return
      }
      if (shown <= 0.001) {
        // Coming into view: read the inks again, in case the colour-vision palette has changed since.
        colours = inks(root)
        groundDrawn = ""
      }
      shown = fade
      root.style.opacity = fade.toFixed(3)
      const [groundLayer, menLayer] = layers
      if (!groundLayer || !menLayer) {
        return
      }
      resize()
      if (fade <= 0.001) {
        groundLayer.clearRect(0, 0, innerWidth, innerHeight)
        menLayer.clearRect(0, 0, innerWidth, innerHeight)
        groundDrawn = ""
        return
      }
      const view = viewKey()
      const stretch = state.operation?.stretch ?? null
      if (view !== groundDrawn || stretch !== stretchDrawn) {
        groundDrawn = view
        stretchDrawn = stretch
        drawing = groundLayer
        drawing.clearRect(0, 0, innerWidth, innerHeight)
        // A wash over the ground, so the map's lines and men read over grass, mud and snow alike.
        drawing.fillStyle = "rgb(16 13 9 / 34%)"
        drawing.fillRect(0, 0, innerWidth, innerHeight)
        drawGrid()
        drawTrenches()
        drawStretch(state)
      }
      drawing = menLayer
      drawing.clearRect(0, 0, innerWidth, innerHeight)
      drawSoldiers(state)
    }
  }
}
