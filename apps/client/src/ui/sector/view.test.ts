import { createFlatMap, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { toPlan } from "./plan.ts"
import { fitOfView, panView, viewOfArea, zoomView } from "./view.ts"

// 300 m east to west, 200 m north to south, on a 600 by 400 box.
const flat = createFlatMap({ name: "sector", cellSize: 0.5, columns: 600, rows: 400 }, 5, Surface.Grass)

describe("zooming and panning the plan", () => {
  it("starts on a stretch of ground, fitted to the box", () => {
    const view = viewOfArea(flat, { minX: 100, maxX: 200, minZ: 50, maxZ: 150 }, 600, 400, 0)
    expect(view).toEqual({ x: 150, z: 100, scale: 4 })
    expect(toPlan(flat, fitOfView(flat, view, 600, 400), 150, 100)).toEqual({ x: 300, y: 200 })
  })

  it("keeps the ground under the pointer where it is as it zooms", () => {
    const view = { x: 150, z: 100, scale: 2 }
    const pointer = { x: 450, y: 100 }
    const before = fitOfView(flat, view, 600, 400)
    const ground = { x: (pointer.x - before.left) / before.scale, z: 200 - (pointer.y - before.top) / before.scale }
    const zoomed = zoomView(flat, view, 2, pointer, 600, 400)
    expect(zoomed.scale).toBe(4)
    const after = toPlan(flat, fitOfView(flat, zoomed, 600, 400), ground.x, ground.z)
    expect(after.x).toBeCloseTo(pointer.x)
    expect(after.y).toBeCloseTo(pointer.y)
  })

  it("zooms no closer than a few squads and no further out than the whole sector", () => {
    const view = { x: 150, z: 100, scale: 2 }
    expect(zoomView(flat, view, 100, { x: 300, y: 200 }, 600, 400).scale).toBe(8)
    expect(zoomView(flat, view, 0.01, { x: 300, y: 200 }, 600, 400).scale).toBeCloseTo(1.8)
  })

  it("pans with the drag, and never off the sector", () => {
    const view = { x: 150, z: 100, scale: 2 }
    expect(panView(flat, view, 100, -50, 600, 400)).toEqual({ x: 100, z: 75, scale: 2 })
    expect(panView(flat, view, -10000, 10000, 600, 400)).toEqual({ x: 300, z: 200, scale: 2 })
  })
})
