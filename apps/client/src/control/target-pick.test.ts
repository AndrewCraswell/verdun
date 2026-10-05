import { describe, expect, it } from "vitest"
import { pickOnScreen } from "./target-pick.ts"

describe("pickOnScreen", () => {
  const men = [
    { id: 4, x: 100, y: 100 },
    { id: 7, x: 130, y: 100 },
    { id: 9, x: 400, y: 300 }
  ]

  it("picks the man nearest the pointer within the radius, or nobody", () => {
    expect(pickOnScreen(men, { x: 105, y: 102 }, 28, -1)).toBe(4)
    expect(pickOnScreen(men, { x: 124, y: 100 }, 28, -1)).toBe(7)
    expect(pickOnScreen(men, { x: 250, y: 200 }, 28, -1)).toBe(-1)
    expect(pickOnScreen([], { x: 0, y: 0 }, 28, 4)).toBe(-1)
  })

  it("keeps the man already picked until another is clearly nearer", () => {
    // Just past halfway to the next man: still the first.
    expect(pickOnScreen(men, { x: 118, y: 100 }, 28, 4)).toBe(4)
    // Well over to him: his.
    expect(pickOnScreen(men, { x: 126, y: 100 }, 28, 4)).toBe(7)
    // A little past the radius, the pick holds; well past it, it goes.
    expect(pickOnScreen(men, { x: 70, y: 100 }, 28, 4)).toBe(4)
    expect(pickOnScreen(men, { x: 60, y: 100 }, 28, 4)).toBe(-1)
  })

  it("lets go of a man no longer on the screen", () => {
    expect(pickOnScreen(men, { x: 402, y: 300 }, 28, 12)).toBe(9)
  })
})
