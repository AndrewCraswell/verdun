import { type BattlefieldMap, mapDepth, mapWidth } from "@verdun/map"
import { fitArea, type GroundArea, type PlanFit } from "./plan.ts"

/**
 * Where a plan of the sector is looking, as the player zooms and pans it: the ground point in the middle, and how many
 * pixels to the metre. Kept within reason: never further out than the whole sector, never closer than a few squads,
 * and never so far off that the sector leaves the box.
 */
export interface PlanView {
  readonly x: number
  readonly z: number
  /** Pixels to the metre. */
  readonly scale: number
}

/** The closest a plan zooms, in pixels to the metre: a squad's men a few pixels apart. */
const CLOSEST = 8

/** How the plan sits in a box of `width` by `height` pixels under a view. */
export function fitOfView(map: BattlefieldMap, view: PlanView, width: number, height: number): PlanFit {
  return {
    scale: view.scale,
    left: width / 2 - view.x * view.scale,
    top: height / 2 - (mapDepth(map) - view.z) * view.scale
  }
}

/** The view that shows a stretch of ground, as fitArea fits it. */
export function viewOfArea(
  map: BattlefieldMap,
  area: GroundArea,
  width: number,
  height: number,
  margin = 24
): PlanView {
  const fit = fitArea(map, area, width, height, margin)
  return {
    x: (width / 2 - fit.left) / fit.scale,
    z: mapDepth(map) - (height / 2 - fit.top) / fit.scale,
    scale: fit.scale
  }
}

/** Keeps a view in reason: zoomed between the whole sector and CLOSEST, its middle on the sector. */
function clampView(map: BattlefieldMap, view: PlanView, width: number, height: number): PlanView {
  const whole = Math.min(width / mapWidth(map), height / mapDepth(map)) * 0.9
  const scale = Math.min(CLOSEST, Math.max(whole, view.scale))
  return {
    x: Math.min(mapWidth(map), Math.max(0, view.x)),
    z: Math.min(mapDepth(map), Math.max(0, view.z)),
    scale
  }
}

/** Zooms by `factor` (over 1 in, under 1 out), keeping the ground under the pixel `at` where it is on the screen. */
export function zoomView(
  map: BattlefieldMap,
  view: PlanView,
  factor: number,
  at: { readonly x: number; readonly y: number },
  width: number,
  height: number
): PlanView {
  const fit = fitOfView(map, view, width, height)
  const groundX = (at.x - fit.left) / fit.scale
  const groundZ = mapDepth(map) - (at.y - fit.top) / fit.scale
  const zoomed = clampView(map, { ...view, scale: view.scale * factor }, width, height)
  return clampView(
    map,
    {
      scale: zoomed.scale,
      x: groundX - (at.x - width / 2) / zoomed.scale,
      z: groundZ + (at.y - height / 2) / zoomed.scale
    },
    width,
    height
  )
}

/** Pans by a drag of `dx`, `dy` pixels: the ground follows the pointer. */
export function panView(
  map: BattlefieldMap,
  view: PlanView,
  dx: number,
  dy: number,
  width: number,
  height: number
): PlanView {
  return clampView(map, { ...view, x: view.x - dx / view.scale, z: view.z + dy / view.scale }, width, height)
}
