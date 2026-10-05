import { describe, expect, it } from "vitest"
import { weekAtVerdun } from "./verdun-1916.ts"

describe("the week at Verdun", () => {
  it("tells what happened in the week being fought", () => {
    // The week of 20 June 1916 holds the attack of 23 June.
    expect(weekAtVerdun(Date.UTC(1916, 5, 20))).toMatch(/phosgene/)
    expect(weekAtVerdun(Date.UTC(1916, 1, 15))).toMatch(/^21 February/)
  })

  it("keeps the last news for a few weeks, then has nothing to say", () => {
    expect(weekAtVerdun(Date.UTC(1916, 5, 13))).toMatch(/Fort Vaux surrenders/)
    expect(weekAtVerdun(Date.UTC(1916, 8, 26))).toBeNull()
  })

  it("says nothing of the years before and after", () => {
    expect(weekAtVerdun(Date.UTC(1915, 5, 1))).toBeNull()
    expect(weekAtVerdun(Date.UTC(1917, 5, 1))).toBeNull()
  })
})
