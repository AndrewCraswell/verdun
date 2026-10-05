import { createFlatMap, Surface } from "@verdun/map"
import { Side } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { fitPlan, fromPlan, groundImage, squareName, toPlan, trenchOwner } from "./plan.ts"

// 300 m east to west, 200 m north to south.
const flat = createFlatMap({ name: "sector", cellSize: 0.5, columns: 600, rows: 400 }, 5, Surface.Grass)

describe("the sector map", () => {
  it("names squares by column from the west and row from the north", () => {
    expect(squareName(flat, 10, 190)).toBe("A1")
    expect(squareName(flat, 150, 10)).toBe("B2")
    expect(squareName(flat, 299, 0)).toBe("C2")
  })

  it("tells our fire trenches from theirs by the way they face, for either side", () => {
    const north = { kind: "fire", facing: "north", points: [] } as const
    const communication = { kind: "communication", facing: null, points: [] } as const
    expect(trenchOwner(north, Side.French)).toBe("ours")
    expect(trenchOwner(north, Side.German)).toBe("theirs")
    expect(trenchOwner(communication, Side.French)).toBe("communication")
  })

  it("fits the sector north up, and finds the ground again under a point", () => {
    const fit = fitPlan(flat, 660, 600, 30)
    expect(fit.scale).toBe(2)
    const corner = toPlan(flat, fit, 0, 200)
    expect(corner).toEqual({ x: 30, y: fit.top })
    expect(fromPlan(flat, fit, corner.x + 20, corner.y + 40)).toEqual({ x: 10, z: 180 })
    expect(fromPlan(flat, fit, 5, 5)).toBeNull()
  })

  it("draws flat ground as plain paper, without contours", () => {
    const image = groundImage(flat, 10)
    expect(image.width).toBe(30)
    expect(image.height).toBe(20)
    const first = Array.from(image.data.slice(0, 4))
    const middle = Array.from(image.data.slice((10 * 30 + 15) * 4, (10 * 30 + 15) * 4 + 4))
    expect(middle).toEqual(first)
    expect(first[3]).toBe(255)
  })
})
