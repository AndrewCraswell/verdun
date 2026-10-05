import { type BattlefieldMap, heightAt, mapDepth, mapWidth, type Trench } from "@verdun/map"
import { Side } from "@verdun/sim"

/**
 * The sector map's drawing (S4 in docs/design/interface.md), free of the DOM: the ground as a plan directeur shows it,
 * in contours and light shading on paper, squared every 100 m and lettered as the period maps were, and the trenches
 * by whose they are.
 */

/** The squares, in metres, and the letters of their columns: the HUD's war map squares the ground the same way. */
export const SQUARE = 100
const COLUMNS = "ABCDEFGHJKLMNOP"
/** Contours every this many metres of height. */
export const CONTOUR = 2

/** A square's name, as a trench map gives it: its column's letter from the west, its row's number from the north. */
export function squareName(map: BattlefieldMap, x: number, z: number): string {
  const column = Math.min(COLUMNS.length - 1, Math.max(0, Math.floor(x / SQUARE)))
  const rows = Math.ceil(mapDepth(map) / SQUARE)
  const row = Math.min(rows - 1, Math.max(0, Math.floor((mapDepth(map) - z) / SQUARE)))
  return `${COLUMNS[column] ?? "?"}${row + 1}`
}

/** Whose a trench is, for the player's side: our fire trenches, theirs, or a communication trench. */
export function trenchOwner(trench: Trench, side: Side): "ours" | "theirs" | "communication" {
  if (trench.facing === null) {
    return "communication"
  }
  // Each army's fire trenches face the other: the French north, the Germans south.
  const ourFacing = side === Side.French ? "north" : "south"
  return trench.facing === ourFacing ? "ours" : "theirs"
}

/** How the map sits on the screen: north up, the whole sector in view, `scale` pixels to the metre. */
export interface PlanFit {
  readonly scale: number
  readonly left: number
  readonly top: number
}

/** Fits the map into a box of pixels with a margin round it, north up. */
export function fitPlan(map: BattlefieldMap, width: number, height: number, margin = 24): PlanFit {
  const scale = Math.max(0.01, Math.min((width - margin * 2) / mapWidth(map), (height - margin * 2) / mapDepth(map)))
  return {
    scale,
    left: (width - mapWidth(map) * scale) / 2,
    top: (height - mapDepth(map) * scale) / 2
  }
}

/** A stretch of the ground, in metres: the part of the sector a view is about. */
export interface GroundArea {
  readonly minX: number
  readonly maxX: number
  readonly minZ: number
  readonly maxZ: number
}

/** Fits a stretch of the ground into a box of pixels with a margin round it, north up; the rest runs off the edges. */
export function fitArea(map: BattlefieldMap, area: GroundArea, width: number, height: number, margin = 24): PlanFit {
  const wide = Math.max(1, area.maxX - area.minX)
  const deep = Math.max(1, area.maxZ - area.minZ)
  const scale = Math.max(0.01, Math.min((width - margin * 2) / wide, (height - margin * 2) / deep))
  return {
    scale,
    left: (width - wide * scale) / 2 - area.minX * scale,
    top: (height - deep * scale) / 2 - (mapDepth(map) - area.maxZ) * scale
  }
}

/** A ground point on the screen. */
export function toPlan(map: BattlefieldMap, fit: PlanFit, x: number, z: number): { x: number; y: number } {
  return { x: fit.left + x * fit.scale, y: fit.top + (mapDepth(map) - z) * fit.scale }
}

/** A screen point on the ground, or null off the map. */
export function fromPlan(map: BattlefieldMap, fit: PlanFit, x: number, y: number): { x: number; z: number } | null {
  const groundX = (x - fit.left) / fit.scale
  const groundZ = mapDepth(map) - (y - fit.top) / fit.scale
  if (groundX < 0 || groundZ < 0 || groundX > mapWidth(map) || groundZ > mapDepth(map)) {
    return null
  }
  return { x: groundX, z: groundZ }
}

/** The paper, and the brown the ground's contours and shading are drawn in. */
const PAPER = [233, 224, 200] as const
const SHADOW = [120, 96, 60] as const
const CONTOUR_INK = [150, 112, 70] as const

/**
 * The ground as an image, `metres` to the pixel, north up: paper shaded where slopes face away from a light in the
 * north-west, as the hachures of the period maps darkened them, with a contour every `CONTOUR` metres. RGBA rows, top
 * (north) first.
 */
export function groundImage(
  map: BattlefieldMap,
  metres: number
): { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray<ArrayBuffer> } {
  const width = Math.max(1, Math.round(mapWidth(map) / metres))
  const height = Math.max(1, Math.round(mapDepth(map) / metres))
  const depth = mapDepth(map)
  const heights = new Float32Array(width * height)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      heights[row * width + column] = heightAt(map, (column + 0.5) * metres, depth - (row + 0.5) * metres)
    }
  }
  const at = (column: number, row: number) =>
    heights[Math.min(height - 1, Math.max(0, row)) * width + Math.min(width - 1, Math.max(0, column))] ?? 0
  const data = new Uint8ClampedArray(width * height * 4)
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      // The slope east and north, in metres a metre; light from the north-west lights slopes facing it.
      const east = (at(column + 1, row) - at(column - 1, row)) / (2 * metres)
      const north = (at(column, row - 1) - at(column, row + 1)) / (2 * metres)
      const lit = Math.max(-1, Math.min(1, (east - north) * 1.6))
      const shade = Math.max(0, Math.min(0.42, 0.12 + lit * 0.3))
      const here = at(column, row)
      const band = Math.floor(here / CONTOUR)
      const contour =
        Math.floor(at(column + 1, row) / CONTOUR) !== band || Math.floor(at(column, row + 1) / CONTOUR) !== band
      const index = (row * width + column) * 4
      for (let channel = 0; channel < 3; channel++) {
        const paper = PAPER[channel]! + (SHADOW[channel]! - PAPER[channel]!) * shade
        data[index + channel] = contour ? paper + (CONTOUR_INK[channel]! - paper) * 0.55 : paper
      }
      data[index + 3] = 255
    }
  }
  return { width, height, data }
}
