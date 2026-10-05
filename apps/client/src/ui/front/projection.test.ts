import { describe, expect, it } from "vitest"
import { boxOf, offsetLine, pathOf, pointsOf, project } from "./projection.ts"

describe("the war map's projection", () => {
  it("puts Verdun about 260 km east and 40 km south of Paris", () => {
    const paris = project([2.35, 48.86])
    const verdun = project([5.385, 49.16])
    expect(verdun.x - paris.x).toBeGreaterThan(215)
    expect(verdun.x - paris.x).toBeLessThan(230)
    expect(paris.y - verdun.y).toBeCloseTo(33, 0)
  })

  it("makes a box from its edges, north up", () => {
    const box = boxOf([5, 49, 6, 50])
    expect(box.width).toBeGreaterThan(70)
    expect(box.height).toBeCloseTo(110.6, 1)
    expect(project([5, 50])).toEqual({ x: box.x, y: box.y })
  })

  it("reads a flat list of coordinates and draws a path through it", () => {
    const points = pointsOf([4.8, 49.35, 4.8, 49.25, 1])
    expect(points).toEqual([
      [4.8, 49.35],
      [4.8, 49.25]
    ])
    expect(pathOf(points.map(project))).toBe("M0.0 0.0L0.0 11.1")
  })
})

describe("a line alongside another", () => {
  it("lies to the right of a walker: west of a line walked south", () => {
    const line = [
      { x: 0, y: 0 },
      { x: 0, y: 10 }
    ]
    expect(offsetLine(line, 2)).toEqual([
      { x: -2, y: 0 },
      { x: -2, y: 10 }
    ])
    expect(offsetLine(line, -2)[0]).toEqual({ x: 2, y: 0 })
  })

  it("keeps its distance round a right-angled corner", () => {
    const corner = offsetLine(
      [
        { x: 0, y: 0 },
        { x: 0, y: 10 },
        { x: 10, y: 10 }
      ],
      1
    )[1]!
    // Walking south then east, the right side is west then south: the corner sits out at (-1, 11).
    expect(corner.x).toBeCloseTo(-1)
    expect(corner.y).toBeCloseTo(11)
  })
})
