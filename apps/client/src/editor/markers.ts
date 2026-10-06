import type { Camera } from "@babylonjs/core/Cameras/camera"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Scene } from "@babylonjs/core/scene"

/**
 * The kinds of place the editor marks, most important first, and how far off each is still labelled, in metres. Where
 * labels would overlap, the more important kind's is shown.
 */
export const PLACE_KINDS = {
  area: { label: "Battle area", reach: 100_000 },
  town: { label: "Towns", reach: 60_000 },
  fort: { label: "Forts and ouvrages", reach: 100_000 },
  village: { label: "Villages", reach: 40_000 },
  hill: { label: "Hills and côtes", reach: 100_000 },
  ravine: { label: "Ravines", reach: 20_000 },
  wood: { label: "Woods", reach: 15_000 }
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
  /** Its Wikipedia article, where it has one. */
  readonly wikipedia?: string
}

export function isPlaceKind(value: unknown): value is PlaceKind {
  return typeof value === "string" && value in PLACE_KINDS
}

export interface Markers {
  /** Shows or hides the labels of one kind of place. */
  show(kind: PlaceKind, shown: boolean): void
  /** Hides labels that would cover a more important one, or stops and shows them all. */
  declutter(on: boolean): void
  /** Finds where each place is drawn afresh, after the ground has changed shape. */
  relocate(): void
  /** Moves the labels to where their places are drawn: call once a frame. */
  update(): void
}

/**
 * Labels over the named places, drawn in the page over the canvas: each at its place's spot on the ground, hidden
 * behind the camera, beyond its kind's reach, and where it would cover a label of a more important kind, or a nearer
 * one of its own. `toScene` gives where a Lambert-93 point is drawn, ground and all.
 */
export function createMarkers(
  scene: Scene,
  camera: Camera,
  canvas: HTMLCanvasElement,
  places: readonly Place[],
  toScene: (x: number, y: number) => Vector3,
  onPick: (place: Place) => void = () => undefined
): Markers {
  const layer = document.createElement("div")
  layer.className = "markers"
  canvas.after(layer)
  const shown = new Set<PlaceKind>(DEFAULT_KINDS)
  const rank = (kind: PlaceKind) => Object.keys(PLACE_KINDS).indexOf(kind)
  const ordered = [...places].sort((a, b) => rank(a.kind) - rank(b.kind))
  interface Entry {
    place: Place
    label: HTMLDivElement
    covers: HTMLSpanElement
    at: Vector3
    wide: number
    /** Where the label was put this frame, in the page's pixels. */
    left: number
    top: number
    /** The labels this one hides this frame, where they'd overlap it. */
    hidden: Entry[]
  }
  const labels: Entry[] = ordered.map((place) => {
    const label = document.createElement("div")
    label.className = `marker marker-${place.kind}`
    label.textContent = place.name
    // A link to the place's Wikipedia article, where it has one, opening in a new tab.
    if (place.wikipedia) {
      const link = document.createElement("a")
      link.className = "marker-wiki"
      link.href = place.wikipedia
      link.target = "_blank"
      link.rel = "noopener noreferrer"
      link.title = `${place.name} on Wikipedia`
      link.textContent = "W"
      link.addEventListener("click", (event) => event.stopPropagation())
      label.append(link)
    }
    // How many labels this one hides where they'd overlap. Clicking a label that hides others spreads them out under it,
    // and again folds them; clicking one that hides none takes the camera to its place.
    const covers = document.createElement("span")
    covers.className = "marker-covers"
    label.append(covers)
    layer.append(label)
    // How much of the page the label takes, roughly: its text at the labels' size, and a margin.
    const wide = place.name.length * (place.kind === "town" ? 9 : 7) + 16
    return { place, label, covers, at: toScene(place.x, place.y), wide, left: 0, top: 0, hidden: [] }
  })
  /** The labels spread out, by their place. */
  const spread = new Set<Place>()
  for (const entry of labels) {
    entry.label.addEventListener("click", () => {
      if (spread.has(entry.place)) {
        spread.delete(entry.place)
      } else if (entry.hidden.length > 0) {
        spread.add(entry.place)
      } else {
        onPick(entry.place)
      }
    })
  }
  /** The page in cells this many pixels wide and high, marked as labels take them. */
  const CELL = { wide: 24, high: 20 } as const
  /** Labels spread out under another stand this many pixels apart. */
  const STACK = 19
  const projected = new Vector3()
  let decluttered = true
  return {
    declutter(on) {
      decluttered = on
    },
    relocate() {
      for (const entry of labels) {
        entry.at = toScene(entry.place.x, entry.place.y)
      }
    },
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
      /** Which label took each cell of the page, by its index. */
      const taken = new Map<number, number>()
      for (const entry of labels) {
        entry.hidden = []
      }
      labels.forEach((entry, index) => {
        const { place, at, wide } = entry
        const distance = Vector3.Distance(camera.globalPosition, at)
        let visible = shown.has(place.kind) && distance < PLACE_KINDS[place.kind].reach
        if (visible) {
          Vector3.ProjectToRef(at, Matrix.IdentityReadOnly, transform, viewport, projected)
          entry.left = projected.x * scaleX
          entry.top = projected.y * scaleY
          visible =
            projected.z > 0 &&
            projected.z < 1 &&
            entry.left > -wide &&
            entry.top > -20 &&
            entry.left < canvas.clientWidth &&
            entry.top < canvas.clientHeight
        }
        if (visible && decluttered) {
          // The cells the label would cover: shown only if none is taken by a label placed before it.
          const cells: number[] = []
          const { left, top } = entry
          for (let row = Math.floor((top - 10) / CELL.high); row <= Math.floor((top + 10) / CELL.high); row++) {
            for (let column = Math.floor(left / CELL.wide); column <= Math.floor((left + wide) / CELL.wide); column++) {
              cells.push(row * 4096 + column)
            }
          }
          const owner = cells.map((cell) => taken.get(cell)).find((taker) => taker !== undefined)
          visible = owner === undefined
          if (owner === undefined) {
            for (const cell of cells) {
              taken.set(cell, index)
            }
          } else {
            labels[owner]?.hidden.push(entry)
          }
        }
        entry.label.hidden = !visible
        if (visible) {
          entry.label.style.transform = `translate(${entry.left}px, ${entry.top}px)`
        }
      })
      // A label spread out shows those it hides in a column under it.
      for (const entry of labels) {
        const open = spread.has(entry.place) && !entry.label.hidden && entry.hidden.length > 0
        entry.hidden.forEach((covered, index) => {
          covered.label.hidden = !open
          if (open) {
            covered.label.style.transform = `translate(${entry.left + 10}px, ${entry.top + STACK * (index + 1)}px)`
          }
        })
        let text = ""
        if (entry.hidden.length > 0) {
          text = open ? "−" : `+${entry.hidden.length}`
        }
        if (entry.covers.textContent !== text) {
          entry.covers.textContent = text
        }
        entry.label.classList.toggle("marker-spread", open)
      }
    }
  }
}
