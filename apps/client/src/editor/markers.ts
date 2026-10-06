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
  const labels: {
    place: Place
    label: HTMLDivElement
    covers: HTMLSpanElement
    at: Vector3
    wide: number
    hiding: number
    /** The places this label hides, as of the last frame. */
    hidden: Place[]
  }[] = ordered.map((place) => {
    const label = document.createElement("div")
    label.className = `marker marker-${place.kind}`
    label.textContent = place.name
    // How many labels this one hides where they'd overlap: zoom in to see them.
    const covers = document.createElement("span")
    covers.className = "marker-covers"
    label.append(covers)
    layer.append(label)
    // How much of the page the label takes, roughly: its text at the labels' size, and a margin.
    const wide = place.name.length * (place.kind === "town" ? 9 : 7) + 16
    return { place, label, covers, at: toScene(place.x, place.y), wide, hiding: 0, hidden: [] }
  })
  /** The page in cells this many pixels wide and high, marked as labels take them. */
  const CELL = { wide: 24, high: 20 } as const
  const projected = new Vector3()
  let decluttered = true

  // The list a label's count opens: the places it hides, each a button that takes the camera there.
  const list = document.createElement("div")
  list.className = "marker-list"
  list.hidden = true
  layer.append(list)
  let listOwner: (typeof labels)[number] | null = null
  const closeList = () => {
    list.hidden = true
    listOwner = null
  }
  for (const entry of labels) {
    entry.covers.addEventListener("click", (event) => {
      event.stopPropagation()
      if (listOwner === entry) {
        closeList()
        return
      }
      listOwner = entry
      list.replaceChildren(
        ...entry.hidden.map((place) => {
          const item = document.createElement("button")
          item.type = "button"
          item.className = `marker-list-item marker-${place.kind}`
          item.textContent = place.name
          item.addEventListener("click", () => {
            closeList()
            onPick(place)
          })
          return item
        })
      )
      list.hidden = false
    })
  }
  addEventListener("pointerdown", (event) => {
    if (listOwner && event.target instanceof Node && !list.contains(event.target)) {
      closeList()
    }
  })
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
        entry.hiding = 0
        entry.hidden = []
      }
      labels.forEach((entry, index) => {
        const { place, label, at, wide } = entry
        const distance = Vector3.Distance(camera.globalPosition, at)
        let visible = shown.has(place.kind) && distance < PLACE_KINDS[place.kind].reach
        let left = 0
        let top = 0
        if (visible) {
          Vector3.ProjectToRef(at, Matrix.IdentityReadOnly, transform, viewport, projected)
          left = projected.x * scaleX
          top = projected.y * scaleY
          visible =
            projected.z > 0 &&
            projected.z < 1 &&
            left > -wide &&
            top > -20 &&
            left < canvas.clientWidth &&
            top < canvas.clientHeight
        }
        if (visible && decluttered) {
          // The cells the label would cover: shown only if none is taken by a label placed before it.
          const cells: number[] = []
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
            const covering = labels[owner]
            if (covering) {
              covering.hiding += 1
              covering.hidden.push(place)
            }
          }
        }
        label.hidden = !visible
        if (visible) {
          label.style.transform = `translate(${left}px, ${top}px)`
        }
      })
      // The open list follows its label, and closes when the label goes.
      if (listOwner) {
        if (listOwner.label.hidden) {
          closeList()
        } else {
          list.style.transform = `${listOwner.label.style.transform} translate(0, 14px)`
        }
      }
      for (const { covers, hiding } of labels) {
        const text = hiding > 0 ? `+${hiding}` : ""
        if (covers.textContent !== text) {
          covers.textContent = text
        }
      }
    }
  }
}
