import type { Camera } from "@babylonjs/core/Cameras/camera"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Scene } from "@babylonjs/core/scene"

/** The kinds of place the editor marks, and how far off each is still labelled, in metres. */
export const PLACE_KINDS = {
  area: { label: "Battle area", reach: 100_000 },
  town: { label: "Towns", reach: 60_000 },
  fort: { label: "Forts and ouvrages", reach: 100_000 },
  village: { label: "Villages", reach: 40_000 },
  hill: { label: "Hills and côtes", reach: 100_000 },
  ravine: { label: "Ravines", reach: 6000 },
  wood: { label: "Woods", reach: 5000 }
} as const

export type PlaceKind = keyof typeof PLACE_KINDS

/** The kinds labelled until the editor is told otherwise. */
export const DEFAULT_KINDS: readonly PlaceKind[] = ["area", "town", "fort", "hill"]

/** A named place, in Lambert-93 metres. */
export interface Place {
  readonly name: string
  readonly kind: PlaceKind
  readonly x: number
  readonly y: number
}

export function isPlaceKind(value: unknown): value is PlaceKind {
  return typeof value === "string" && value in PLACE_KINDS
}

export interface Markers {
  /** Shows or hides the labels of one kind of place. */
  show(kind: PlaceKind, shown: boolean): void
  /** Moves the labels to where their places are drawn: call once a frame. */
  update(): void
}

/**
 * Labels over the named places, drawn in the page over the canvas: each at its place's spot on the ground, hidden
 * behind the camera and beyond its kind's reach. `toScene` gives where a Lambert-93 point is drawn, ground and all.
 */
export function createMarkers(
  scene: Scene,
  camera: Camera,
  canvas: HTMLCanvasElement,
  places: readonly Place[],
  toScene: (x: number, y: number) => Vector3
): Markers {
  const layer = document.createElement("div")
  layer.className = "markers"
  canvas.after(layer)
  const shown = new Set<PlaceKind>(DEFAULT_KINDS)
  const labels = places.map((place) => {
    const label = document.createElement("div")
    label.className = `marker marker-${place.kind}`
    label.textContent = place.name
    layer.append(label)
    return { place, label, at: toScene(place.x, place.y) }
  })
  const projected = new Vector3()
  return {
    show(kind, visible) {
      if (visible) {
        shown.add(kind)
      } else {
        shown.delete(kind)
      }
    },
    update() {
      const engine = scene.getEngine()
      const width = engine.getRenderWidth()
      const height = engine.getRenderHeight()
      const viewport = camera.viewport.toGlobal(width, height)
      const transform = scene.getTransformMatrix()
      const scaleX = canvas.clientWidth / width
      const scaleY = canvas.clientHeight / height
      for (const { place, label, at } of labels) {
        const distance = Vector3.Distance(camera.globalPosition, at)
        let visible = shown.has(place.kind) && distance < PLACE_KINDS[place.kind].reach
        if (visible) {
          Vector3.ProjectToRef(at, Matrix.IdentityReadOnly, transform, viewport, projected)
          visible = projected.z > 0 && projected.z < 1
        }
        label.hidden = !visible
        if (visible) {
          label.style.transform = `translate(${projected.x * scaleX}px, ${projected.y * scaleY}px)`
        }
      }
    }
  }
}
