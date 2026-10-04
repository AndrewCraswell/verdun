import { mapDepth, mapWidth } from "@verdun/map"
import { isAlive, Side, soldierIds } from "@verdun/sim"
import type { HudElementFactory, ScreenPoint } from "../element.ts"
import type { HudState } from "../hud-state.ts"
import "./war-map.css"

/**
 * The war map's view (W11 and S4 in docs/design/interface.md, brought into the battle): as the camera pulls back past a
 * hundred and fifty metres, the battlefield turns into a trench map drawn over the ground. Squares of 100 m lettered
 * as on the period maps; every trench, ours in blue and the enemy's in red, as the French plans directeurs drew them;
 * our men as blue dots and the squad in brass; and the enemy in red, but only the men our side can see now. Drawn on
 * one canvas each frame, faded in with the distance.
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
  const canvas = document.createElement("canvas")
  canvas.className = "war-map"
  canvas.setAttribute("aria-hidden", "true")
  const drawing = canvas.getContext("2d")
  const { sim, squad } = context
  const width = mapWidth(sim.map)
  const depth = mapDepth(sim.map)
  let colours = inks(canvas)
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
    if (canvas.width !== pixelsWide || canvas.height !== pixelsHigh) {
      canvas.width = pixelsWide
      canvas.height = pixelsHigh
    }
    drawing?.setTransform(ratio, 0, 0, ratio, 0, 0)
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

  function drawSoldiers(state: HudState): void {
    if (!drawing) {
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
      drawing.beginPath()
      for (const point of points) {
        drawing.moveTo(point.x + radius, point.y)
        drawing.arc(point.x, point.y, radius, 0, Math.PI * 2)
      }
      drawing.fillStyle = colour
      drawing.fill()
      drawing.lineWidth = 1
      drawing.strokeStyle = "rgb(8 7 5 / 70%)"
      drawing.stroke()
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
      drawing.beginPath()
      drawing.arc(ring.x, ring.y, 7.5, 0, Math.PI * 2)
      drawing.strokeStyle = colours.brass
      drawing.lineWidth = 1.8
      drawing.stroke()
    }
  }

  return {
    id: "war-map",
    zone: "world",
    root: canvas,
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
        colours = inks(canvas)
      }
      shown = fade
      canvas.style.opacity = fade.toFixed(3)
      if (!drawing) {
        return
      }
      resize()
      drawing.clearRect(0, 0, innerWidth, innerHeight)
      if (fade <= 0.001) {
        return
      }
      // A wash over the ground, so the map's lines and men read over grass, mud and snow alike.
      drawing.fillStyle = "rgb(16 13 9 / 34%)"
      drawing.fillRect(0, 0, innerWidth, innerHeight)
      drawGrid()
      drawTrenches()
      drawSoldiers(state)
    }
  }
}
