import { describe, expect, it } from "vitest"
import {
  ARMISTICE,
  DEFAULT_SCHEDULE,
  lastCutoff,
  scheduleForWeek,
  SEASONS,
  seasonWeeks,
  WAR_BEGINS,
  warDayAt,
  warWeekOf
} from "./war-calendar.ts"

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** A war whose first turn began at 05:00 UTC on 1 March 2027. */
const schedule = { ...DEFAULT_SCHEDULE, begins: Date.UTC(2027, 2, 1, 5) }

describe("the war's calendar", () => {
  it("gives each year of the war its season of weeks: 22, 52, 52, 52 and 45", () => {
    expect(SEASONS.map((season) => seasonWeeks(season).length)).toEqual([22, 52, 52, 52, 45])
    expect(seasonWeeks(1914)[0]).toBe(WAR_BEGINS)
    const last = seasonWeeks(1918).at(-1)!
    expect(ARMISTICE - last).toBeLessThan(7 * DAY)
    expect(ARMISTICE).toBeGreaterThanOrEqual(last)
  })

  it("runs weeks from Tuesdays, counted from 4 August 1914", () => {
    expect(new Date(WAR_BEGINS).getUTCDay()).toBe(2)
    expect(warWeekOf(Date.UTC(1916, 1, 21, 7))).toBe(Date.UTC(1916, 1, 15))
    expect(warWeekOf(Date.UTC(1916, 5, 23))).toBe(Date.UTC(1916, 5, 20))
  })

  it("is not yet at war before the first turn", () => {
    expect(warDayAt(schedule, schedule.begins - HOUR)).toEqual({ phase: "before", startsAt: schedule.begins })
  })

  it("moves on a week each real day at the cutoff, standing to for its first ten minutes", () => {
    const first = warDayAt(schedule, schedule.begins + 2 * 60_000)
    expect(first).toMatchObject({ phase: "turn", season: 1914, turn: 1, turns: 22, week: WAR_BEGINS, standTo: true })
    const later = warDayAt(schedule, schedule.begins + 3 * DAY + 5 * HOUR)
    expect(later).toMatchObject({
      phase: "turn",
      season: 1914,
      turn: 4,
      week: WAR_BEGINS + 3 * 7 * DAY,
      standTo: false,
      nextCutoff: schedule.begins + 4 * DAY
    })
  })

  it("takes a week off between seasons, then starts the next year", () => {
    const between = warDayAt(schedule, schedule.begins + 22 * DAY + HOUR)
    expect(between).toEqual({
      phase: "between",
      season: 1914,
      nextSeason: 1915,
      resumesAt: schedule.begins + 29 * DAY
    })
    expect(warDayAt(schedule, schedule.begins + 29 * DAY + HOUR)).toMatchObject({
      phase: "turn",
      season: 1915,
      turn: 1,
      week: Date.UTC(1915, 0, 5)
    })
  })

  it("ends after the week of the armistice", () => {
    const days = [22, 52, 52, 52, 45].reduce((sum, turns) => sum + turns + 7, 0) - 7
    expect(warDayAt(schedule, schedule.begins + (days - 1) * DAY + HOUR)).toMatchObject({ phase: "turn", season: 1918 })
    expect(warDayAt(schedule, schedule.begins + days * DAY + HOUR)).toEqual({
      phase: "over",
      endedAt: schedule.begins + days * DAY
    })
  })

  it("finds the last cutoff, at 05:00 UTC", () => {
    expect(lastCutoff(Date.UTC(2027, 2, 3, 4, 59))).toBe(Date.UTC(2027, 2, 2, 5))
    expect(lastCutoff(Date.UTC(2027, 2, 3, 5))).toBe(Date.UTC(2027, 2, 3, 5))
  })

  it("schedules a war so a chosen week is today's turn", () => {
    const now = Date.UTC(2027, 5, 10, 18)
    const fleury = scheduleForWeek(Date.UTC(1916, 5, 23), now)
    expect(warDayAt(fleury, now)).toMatchObject({ phase: "turn", season: 1916, week: Date.UTC(1916, 5, 20) })
    expect(warDayAt(fleury, now + DAY)).toMatchObject({ phase: "turn", season: 1916, week: Date.UTC(1916, 5, 27) })
    expect(() => scheduleForWeek(Date.UTC(1920, 0, 1), now)).toThrow("not a week of the war")
  })
})
