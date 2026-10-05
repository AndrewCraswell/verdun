import { DEFAULT_SCHEDULE, warDayAt } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { battleHour, countdownLabel, turnLabel, weekLabel } from "./calendar.ts"

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

const DAY = 24 * HOUR

describe("what players see of the war", () => {
  const schedule = { ...DEFAULT_SCHEDULE, begins: Date.UTC(2027, 0, 1, 5) }
  const at = (offset: number) => warDayAt(schedule, schedule.begins + offset)

  it("names the turn in its season, and counts down to the next communiqué", () => {
    const day = at(3 * DAY + 6 * HOUR)
    expect(turnLabel(day)).toBe("Day 4 of 22, 1914")
    expect(countdownLabel(day, schedule.begins + 3 * DAY + 6 * HOUR)).toBe("Next communiqué in 18 h 0 min")
    expect(countdownLabel(day, schedule.begins + 4 * DAY - 5 * 60_000)).toBe("Next communiqué in 5 min")
    expect(countdownLabel(at(60_000), schedule.begins + 60_000)).toBe("Stand-to: the communiqué is coming in")
  })

  it("tells players where the war stands outside its turns", () => {
    expect(turnLabel(at(-HOUR))).toBe("The war has not begun")
    expect(countdownLabel(at(-3 * DAY), schedule.begins - 3 * DAY)).toBe("The war begins in 3 days")
    const between = at(23 * DAY)
    expect(turnLabel(between)).toBe("The 1914 season is over")
    expect(countdownLabel(between, schedule.begins + 23 * DAY)).toBe("1915 begins in 6 days")
    const over = at(400 * DAY)
    expect(turnLabel(over)).toBe("The armistice is signed")
    expect(countdownLabel(over, schedule.begins + 400 * DAY)).toBe("The last communiqué is published")
  })
})
