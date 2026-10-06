import { describe, expect, it } from "vitest"
import { lengthLabel, rulerFor } from "./scale-bar.ts"

describe("the scale bar", () => {
  it("runs to the longest round length that fits, marked at the round lengths far enough apart to read", () => {
    // 10 m a pixel: 2 km is 200 px, 5 km would be 500.
    const ruler = rulerFor(10)
    expect(ruler.metres).toBe(2000)
    expect(ruler.pixels).toBe(200)
    expect(ruler.marks.map((mark) => mark.metres)).toEqual([0, 500, 1000, 2000])
    // 25 m a pixel: 5 km is 200 px; 500 m is too close to 0 to mark.
    expect(rulerFor(25).marks.map((mark) => mark.metres)).toEqual([0, 1000, 2000, 5000])
  })

  it("says lengths in metres under a kilometre and in kilometres above", () => {
    expect(lengthLabel(500)).toBe("500 m")
    expect(lengthLabel(2000)).toBe("2 km")
  })
})
