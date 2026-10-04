import { describe, expect, it } from "vitest"
import { warStatus } from "./war-status.ts"

describe("warStatus", () => {
  const now = Date.UTC(2026, 9, 4, 12)
  const turn = {
    phase: "turn" as const,
    season: 1916 as const,
    turn: 25,
    turns: 52,
    week: Date.UTC(1916, 5, 20),
    standTo: false,
    nextCutoff: now + (5 * 60 + 12) * 60_000
  }

  it("gives the turn and the time to the next communiqué, with no banner while the battle runs", () => {
    expect(warStatus(turn, false, now)).toEqual({
      turn: "Day 25 of 52, 1916",
      countdown: "Next communiqué in 5 h 12 min",
      banner: null,
      standTo: false
    })
  })

  it("puts up a banner while the battle waits: the stand-to, or the break between seasons", () => {
    const standTo = warStatus({ ...turn, standTo: true }, true, now)
    expect(standTo.banner).toBe("Stand-to. Stand-to: the communiqué is coming in")
    expect(standTo.standTo).toBe(true)
    const between = {
      phase: "between" as const,
      season: 1916 as const,
      nextSeason: 1917 as const,
      resumesAt: now + 3_600_000
    }
    expect(warStatus(between, true, now).banner).toBe("The 1916 season is over. 1917 begins in 1 h 0 min")
  })
})
