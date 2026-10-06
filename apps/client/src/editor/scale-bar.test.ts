import { describe, expect, it } from "vitest"
import { lengthLabel, rulerFor } from "./scale-bar.ts"

describe("the scale bar", () => {
  it("is marked at even round steps far enough apart to read, as many as fit", () => {
    // 10 m a pixel: 500 m steps are 50 px, too close; 1 km steps are 100 px, three of them fit in 330.
    const ruler = rulerFor(10)
    expect(ruler.marks.map((mark) => mark.metres)).toEqual([0, 1000, 2000, 3000])
    expect(ruler.pixels).toBe(300)
    // 4 m a pixel: 250 m steps of 62.5 px, five of them.
    expect(rulerFor(4).marks.map((mark) => mark.metres)).toEqual([0, 250, 500, 750, 1000, 1250])
  })

  it("says lengths in metres under a kilometre and in kilometres above", () => {
    expect(lengthLabel(500)).toBe("500 m")
    expect(lengthLabel(1500)).toBe("1.5 km")
  })
})
