import { describe, expect, it } from "vitest"
import { battleHour, weekLabel } from "./calendar.ts"

const HOUR = 3_600_000

describe("the calendar players see", () => {
  it("names the week of the war by its first day", () => {
    expect(weekLabel(Date.UTC(1916, 1, 21))).toBe("Week of 21 February 1916")
    expect(weekLabel(Date.UTC(1918, 10, 11))).toBe("Week of 11 November 1918")
  })

  it("tells the hour by the French clock, with the wartime summer time", () => {
    const at = (utc: number) => battleHour({ week: utc, elapsed: 0, minutesPerDay: 117 })
    // GMT in 1914 and 1915.
    expect(at(Date.UTC(1914, 7, 4, 12))).toBe("12:00")
    // An hour ahead from 14 June 1916, back on 1 October.
    expect(at(Date.UTC(1916, 5, 14, 12))).toBe("12:00")
    expect(at(Date.UTC(1916, 5, 15, 12))).toBe("13:00")
    expect(at(Date.UTC(1916, 9, 2, 12))).toBe("12:00")
    // From 24 March 1917 and 9 March 1918.
    expect(at(Date.UTC(1917, 3, 1, 12))).toBe("13:00")
    expect(at(Date.UTC(1918, 2, 10, 12))).toBe("13:00")
  })

  it("tells the hour of the day of battle, however many days into the week", () => {
    const week = Date.UTC(1916, 1, 21)
    expect(battleHour({ week, elapsed: 9 * 24 * HOUR + 7.5 * HOUR, minutesPerDay: 117 })).toBe("07:30")
  })
})
