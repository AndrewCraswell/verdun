import { describe, expect, it } from "vitest"
import { WEDGES, wedgeAt } from "./order-wheel.ts"

describe("the orders wheel", () => {
  it("chooses the wedge the pointer points toward, clockwise from the top, and nothing in the middle", () => {
    expect(wedgeAt(0, -80, 3)).toBe(0)
    expect(wedgeAt(70, 40, 3)).toBe(1)
    expect(wedgeAt(-70, 40, 3)).toBe(2)
    expect(wedgeAt(5, -5, 3)).toBeNull()
    // Just either side of the top wedge's edges, at 60 degrees from straight up.
    expect(wedgeAt(Math.sin(1), -Math.cos(1), 3, 0.5)).toBe(0)
    expect(wedgeAt(Math.sin(1.1), -Math.cos(1.1), 3, 0.5)).toBe(1)
    expect(wedgeAt(10, 10, 0)).toBeNull()
  })

  it("gives each order, advance to where the wheel was opened", () => {
    const at = { x: 12, z: 34 }
    expect(WEDGES.map((wedge) => wedge.order(at))).toEqual([
      { kind: "advance", x: 12, z: 34 },
      { kind: "hold" },
      { kind: "follow" }
    ])
    expect(WEDGES[0]?.order(null)).toBeNull()
  })
})
