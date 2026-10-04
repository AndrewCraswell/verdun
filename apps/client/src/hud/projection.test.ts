import { describe, expect, it } from "vitest"
import { clockSeconds, metres } from "./format.ts"
import { projectPoint, screenAngleBetween } from "./projection.ts"

/** A view-projection that looks straight down: x across the screen, z up it, 100 m either way of the middle. */
const DOWN = [0.01, 0, 0, 0, 0, 0, 0, 0, 0, 0.01, 0, 0, 0, 0, 0, 1]

describe("projection", () => {
  it("puts world points on the screen in CSS pixels", () => {
    expect(projectPoint(DOWN, 0, 0, 0, 800, 600)).toEqual({ x: 400, y: 300 })
    expect(projectPoint(DOWN, 100, 0, 100, 800, 600)).toEqual({ x: 800, y: 0 })
    expect(projectPoint(DOWN, -50, 0, -100, 800, 600)).toEqual({ x: 200, y: 600 })
  })

  it("gives nothing for a point behind the camera", () => {
    const behind = [...DOWN.slice(0, 15), -1]
    expect(projectPoint(behind, 0, 0, 0, 800, 600)).toBeNull()
  })

  it("measures angles on the screen clockwise from straight up", () => {
    const from = { x: 100, y: 100 }
    expect(screenAngleBetween(from, { x: 100, y: 50 })).toBe(0)
    expect(screenAngleBetween(from, { x: 150, y: 100 })).toBeCloseTo(Math.PI / 2, 10)
    expect(screenAngleBetween(from, { x: 100, y: 150 })).toBeCloseTo(Math.PI, 10)
  })
})

describe("numbers on the HUD", () => {
  it("writes short waits as a watch shows them", () => {
    expect(clockSeconds(42.2)).toBe("0:43")
    expect(clockSeconds(125)).toBe("2:05")
    expect(clockSeconds(-3)).toBe("0:00")
  })

  it("rounds distances the way a man would call them", () => {
    expect(metres(7.6)).toBe("8 m")
    expect(metres(43)).toBe("45 m")
    expect(metres(254)).toBe("250 m")
  })
})
