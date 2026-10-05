import { type BattlefieldMap, mapDepth, mapWidth } from "@verdun/map"
import { aidPost, type Side } from "@verdun/sim"
import {
  fitArea,
  fitPlan,
  type GroundArea,
  groundImage,
  type PlanFit,
  SQUARE,
  squareName,
  toPlan,
  trenchOwner
} from "./plan.ts"

/**
 * Drawing the sector as a plan directeur on a canvas: the ground, the lettered squares, the trenches ours and theirs,
 * the wire, the railway, the ruins and trees, and our aid post. Shared by the sector map and the join screen's map,
 * so a squad is found on the same plan the player will steer by.
 */

/** The inks, read from an element's tokens, so the colour-vision palettes change the plan too. */
export function planInks(element: Element) {
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

export type PlanInks = ReturnType<typeof planInks>

/** Sizes a canvas to a box of CSS pixels at the screen's density, and returns its context drawing in CSS pixels. */
export function sizeCanvas(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const ratio = Math.min(2, devicePixelRatio || 1)
  canvas.width = Math.round(width * ratio)
  canvas.height = Math.round(height * ratio)
  const drawing = canvas.getContext("2d")
  drawing?.setTransform(ratio, 0, 0, ratio, 0, 0)
  return drawing
}

/** The ground's shading, drawn once a map and kept. */
const grounds = new WeakMap<BattlefieldMap, HTMLCanvasElement>()

function groundOf(map: BattlefieldMap): HTMLCanvasElement {
  let ground = grounds.get(map)
  if (!ground) {
    const image = groundImage(map, 1)
    ground = document.createElement("canvas")
    ground.width = image.width
    ground.height = image.height
    ground.getContext("2d")?.putImageData(new ImageData(image.data, image.width, image.height), 0, 0)
    grounds.set(map, ground)
  }
  return ground
}

/**
 * Draws the plan into a canvas `width` by `height` CSS pixels, north up, for the player's `side`: the whole sector, or
 * an `area` of it; with `objectives`, their names too, in ink. Returns how the map sits on the canvas, to place marks over it.
 */
export function drawPlan(
  canvas: HTMLCanvasElement,
  map: BattlefieldMap,
  side: Side,
  width: number,
  height: number,
  inks: PlanInks,
  {
    margin = 36,
    objectives = [],
    area
  }: {
    readonly margin?: number
    readonly objectives?: readonly { readonly name: string; readonly x: number; readonly z: number }[]
    /** The stretch of ground to fit; the whole sector without one. */
    readonly area?: GroundArea
  } = {}
): PlanFit {
  const fit = area ? fitArea(map, area, width, height, margin) : fitPlan(map, width, height, margin)
  const drawing = sizeCanvas(canvas, width, height)
  if (!drawing) {
    return fit
  }
  const at = (x: number, z: number) => toPlan(map, fit, x, z)
  const topLeft = at(0, mapDepth(map))
  drawing.imageSmoothingEnabled = true
  drawing.drawImage(groundOf(map), topLeft.x, topLeft.y, mapWidth(map) * fit.scale, mapDepth(map) * fit.scale)
  drawing.strokeStyle = inks.ink2
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
  drawing.strokeStyle = inks.rule
  drawing.lineWidth = 1
  drawing.stroke()
  drawing.font = "600 11px 'Archivo Variable', sans-serif"
  drawing.fillStyle = inks.ink3
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
  drawing.strokeStyle = inks.ink3
  drawing.lineWidth = 1.4
  drawing.stroke()
  drawing.setLineDash([1.5, 3])
  drawing.beginPath()
  for (const belt of map.wire) {
    line(belt.points)
  }
  drawing.strokeStyle = inks.ink
  drawing.lineWidth = 2.4
  drawing.stroke()
  drawing.setLineDash([])
  drawing.lineJoin = "round"
  drawing.lineCap = "round"
  for (const owner of ["communication", "theirs", "ours"] as const) {
    drawing.beginPath()
    for (const trench of map.trenches) {
      if (trenchOwner(trench, side) === owner) {
        line(trench.points)
      }
    }
    drawing.strokeStyle = { communication: inks.ink2, theirs: inks.theirs, ours: inks.ours }[owner]
    drawing.lineWidth = owner === "communication" ? 1.4 : 2.6
    drawing.stroke()
  }

  // Ruins and works as solid blocks, trees as rings, as the plans directeurs marked them.
  for (const item of map.scenery) {
    const point = at(item.x, item.z)
    if (item.kind === "ruin" || item.kind === "landmark" || item.kind === "bunker") {
      const size = Math.max(3, (item.kind === "landmark" ? 9 : 5) * item.scale * fit.scale * 0.6)
      drawing.fillStyle = inks.ink2
      drawing.fillRect(point.x - size / 2, point.y - size / 2, size, size)
    } else if (item.kind === "tree" || item.kind === "fruit-tree") {
      drawing.beginPath()
      drawing.arc(point.x, point.y, 1.6, 0, Math.PI * 2)
      drawing.strokeStyle = inks.ink3
      drawing.lineWidth = 0.8
      drawing.stroke()
    }
  }

  // Our aid post.
  const post = aidPost(map, side)
  const cross = at(post.x, post.z)
  drawing.fillStyle = inks.ink
  drawing.fillRect(cross.x - 5, cross.y - 1.5, 10, 3)
  drawing.fillRect(cross.x - 1.5, cross.y - 5, 3, 10)
  drawing.font = "italic 500 11px 'Archivo Variable', sans-serif"
  drawing.textBaseline = "middle"
  drawing.fillText("Poste de secours", cross.x + 9, cross.y)

  // The objectives' names, to find the way by.
  drawing.font = "600 12px 'Archivo Variable', sans-serif"
  drawing.textAlign = "center"
  for (const objective of objectives) {
    const point = at(objective.x, objective.z)
    drawing.lineWidth = 3
    drawing.strokeStyle = "rgb(233 224 200 / 85%)"
    drawing.strokeText(objective.name, point.x, point.y)
    drawing.fillStyle = inks.ink
    drawing.fillText(objective.name, point.x, point.y)
  }
  drawing.textAlign = "left"
  return fit
}
