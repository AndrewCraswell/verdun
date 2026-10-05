import { describe, expect, it } from "vitest"
import { thinned, thinning } from "./emission-lod.ts"

describe("thinning", () => {
  it("leaves bursts near the eye whole, and with no camera", () => {
    expect(thinning({ x: 30, y: 40, z: 30 }, 50, 0, 50)).toEqual({ share: 1, boost: 1 })
    expect(thinning(null, 900, 0, 900)).toEqual({ share: 1, boost: 1 })
  })

  it("thins far bursts to a quarter, each drawn larger, and no further", () => {
    const middle = thinning({ x: 0, y: 0, z: 0 }, 190, 0, 0)
    const far = thinning({ x: 0, y: 0, z: 0 }, 300, 0, 0)
    const further = thinning({ x: 0, y: 0, z: 0 }, 2000, 0, 0)

    expect(middle.share).toBeCloseTo(0.625)
    expect(far.share).toBeCloseTo(0.25)
    expect(far.boost).toBeCloseTo(Math.SQRT2)
    expect(further).toEqual(far)
    expect(middle.boost).toBeGreaterThan(1)
    expect(middle.boost).toBeLessThan(far.boost)
  })
})

describe("thinned", () => {
  it("rounds up or down at random so the average is right, never to none", () => {
    expect(thinned(40, 0.25, () => 0)).toBe(10)
    expect(thinned(10, 0.25, () => 0.4)).toBe(2)
    expect(thinned(10, 0.25, () => 0.6)).toBe(3)
    expect(thinned(2, 0.25, () => 0)).toBe(1)
    expect(thinned(0, 1)).toBe(0)
    expect(thinned(16, 1)).toBe(16)
  })
})
