import { describe, expect, it } from "vitest"
import { createRng } from "./rng.ts"

function draw(count: number, seed: number): number[] {
  const rng = createRng(seed)
  return Array.from({ length: count }, () => rng.next())
}

describe("createRng", () => {
  it("repeats the same sequence for the same seed", () => {
    expect(draw(100, 42)).toEqual(draw(100, 42))
  })

  it("gives different sequences for different seeds", () => {
    expect(draw(10, 42)).not.toEqual(draw(10, 43))
  })

  it("returns values in [0, 1) spread across the range", () => {
    const values = draw(10_000, 7)

    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    expect(mean).toBeGreaterThan(0.48)
    expect(mean).toBeLessThan(0.52)
  })

  it("resumes exactly from its saved state", () => {
    const original = createRng(1916)
    original.next()
    original.next()
    const resumed = createRng(original.state)

    expect(Array.from({ length: 5 }, () => resumed.next())).toEqual(Array.from({ length: 5 }, () => original.next()))
  })
})
