import type { Camera } from "@babylonjs/core/Cameras/camera"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateLines } from "@babylonjs/core/Meshes/Builders/linesBuilder"
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh"
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import type { Scene } from "@babylonjs/core/scene"
import type { BattleMap } from "./battle-maps.ts"
import { type ControlPoint, georeference } from "./georeference.ts"
import { THEATRE } from "./ground.ts"

export interface Alignment {
  /** Starts or stops taking control points from clicks. */
  setActive(active: boolean): void
  /** Shows a map's control points to align it by, or none. */
  setMap(map: BattleMap | null): void
}

export interface AlignmentOptions {
  readonly scene: Scene
  readonly camera: Camera
  readonly canvas: HTMLCanvasElement
  /** The theatre's frame, which the battle map is drawn under. */
  readonly frame: TransformNode
  /** Where the panel lists the control points. */
  readonly list: HTMLElement
  readonly status: HTMLElement
  /** The ground's height in the theatre's frame, for drawing the points. */
  readonly heightAt: (x: number, z: number) => number
  /** Called with the map and its new control points, to fit and draw it again. */
  readonly onChange: (map: BattleMap) => void
}

/**
 * Aligning a battle map by hand, as a georeferencer does: click a place on the draped scan, then where that place lies
 * on the ground, and it becomes a control point; the map is fitted again at once. The points are listed with how far
 * the fit misses each, and drawn on the ground as a line from where the scan puts the place to where it is. Deleting a
 * point fits without it.
 */
export function createAlignment({
  scene,
  camera,
  canvas,
  frame,
  list,
  status,
  heightAt,
  onChange
}: AlignmentOptions): Alignment {
  let map: BattleMap | null = null
  let active = false
  /** The scan's pixel clicked first, waiting for its place on the ground. */
  let pending: [number, number] | null = null
  let lines: LinesMesh[] = []

  const toLocal = (x: number, y: number) => {
    const lx = x - THEATRE.west
    const lz = y - THEATRE.south
    return new Vector3(lx, heightAt(lx, lz) + 30, lz)
  }

  const redraw = () => {
    for (const line of lines) {
      line.dispose()
    }
    lines = []
    list.replaceChildren()
    if (!map) {
      return
    }
    let fit: ReturnType<typeof georeference> | null = null
    try {
      fit = georeference(map.controlPoints, map.order)
    } catch {
      fit = null
    }
    map.controlPoints.forEach((point, index) => {
      const row = document.createElement("div")
      row.className = "align-point"
      const miss = fit?.residuals[index]?.metres
      row.textContent = `${point.name}${miss === undefined ? "" : `: ${Math.round(miss)} m`}`
      const remove = document.createElement("button")
      remove.type = "button"
      remove.textContent = "Delete"
      remove.addEventListener("click", () => {
        if (map) {
          map = { ...map, controlPoints: map.controlPoints.filter((_, at) => at !== index) }
          onChange(map)
          redraw()
        }
      })
      row.append(remove)
      list.append(row)
      // A line from where the scan's pixel falls under the fit's inverse... drawn simply as a mark at the true place.
      const at = toLocal(point.ground[0], point.ground[1])
      const mark = CreateLines(
        `align-${index}`,
        { points: [at.add(new Vector3(0, 60, 0)), at.subtract(new Vector3(0, 40, 0))] },
        scene
      )
      mark.color = new Color3(0.3, 0.8, 1)
      mark.parent = frame
      mark.isPickable = false
      lines.push(mark)
    })
    if (fit) {
      status.textContent = `${map.controlPoints.length} points, fitted to within ${Math.round(fit.rms)} m (order ${fit.order})`
    }
  }

  canvas.addEventListener("pointerup", (event) => {
    if (!active || !map || event.button !== 0 || event.altKey) {
      return
    }
    const rect = canvas.getBoundingClientRect()
    const engine = scene.getEngine()
    const x = ((event.clientX - rect.left) * engine.getRenderWidth()) / rect.width
    const y = ((event.clientY - rect.top) * engine.getRenderHeight()) / rect.height
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera)
    if (!pending) {
      // First, a place on the scan: the pixel under the click.
      const hit = scene.pickWithRay(ray, (mesh) => mesh.name.startsWith("battle-map-"))
      const uv = hit?.getTextureCoordinates()
      if (!uv) {
        status.textContent = "Click a place on the battle map first"
        return
      }
      const [width, height] = map.size
      pending = [Math.round(uv.x * width), Math.round((1 - uv.y) * height)]
      status.textContent = `Scan pixel ${pending.join(", ")}: now click where that place lies on the ground`
      return
    }
    // Then where it lies on the ground, under the scan.
    const hit = scene.pickWithRay(
      ray,
      (mesh) => mesh.isPickable && mesh.isEnabled() && !mesh.name.startsWith("battle-map-")
    )
    if (!hit?.pickedPoint) {
      status.textContent = "Click the ground where that place lies"
      return
    }
    const local = hit.pickedPoint.subtract(frame.position)
    const point: ControlPoint = {
      name: `Point ${map.controlPoints.length + 1}`,
      pixel: pending,
      ground: [Math.round(local.x + THEATRE.west), Math.round(local.z + THEATRE.south)]
    }
    pending = null
    map = { ...map, controlPoints: [...map.controlPoints, point] }
    onChange(map)
    redraw()
  })

  return {
    setActive(next) {
      active = next
      pending = null
      if (active) {
        status.textContent = "Click a place on the battle map, then where it lies on the ground"
      } else {
        redraw()
      }
    },
    setMap(next) {
      map = next
      pending = null
      redraw()
    }
  }
}
