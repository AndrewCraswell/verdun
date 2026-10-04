import { createFlatMap } from "@verdun/map"
import { createSimulation, DEFAULT_SCHEDULE, scheduleForWeek, stepSimulation, WAR_BEGINS } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { countdownLabel, turnLabel } from "./calendar.ts"
import { createWarClock } from "./war-clock.ts"

const HOUR = 3_600_000
const DAY = 24 * HOUR
const map = createFlatMap({ name: "field", cellSize: 1, columns: 50, rows: 50 })

describe("the war clock", () => {
  it("keeps the battle on today's week, and moves it on a week at the cutoff", () => {
    const sim = createSimulation({ map, seed: 1 })
    const now = Date.UTC(2027, 5, 10, 18)
    const war = createWarClock(sim, scheduleForWeek(sim.environment.clock.week, now), now)
    expect(war.day).toMatchObject({ phase: "turn", season: 1916, week: Date.UTC(1916, 5, 20) })
    expect(sim.pendingCommands).toHaveLength(0)
    expect(war.paused).toBe(false)

    const cutoff = Date.UTC(2027, 5, 11, 5)
    war.update(cutoff + 60_000)
    expect(war.paused).toBe(true)
    stepSimulation(sim)
    expect(sim.environment.clock.week).toBe(Date.UTC(1916, 5, 27))
    war.update(cutoff + 2 * 60_000)
    expect(sim.pendingCommands).toHaveLength(0)
    war.update(cutoff + 11 * 60_000)
    expect(war.paused).toBe(false)
  })

  it("waits before the war and between seasons", () => {
    const sim = createSimulation({ map, seed: 1 })
    const schedule = { ...DEFAULT_SCHEDULE, begins: Date.UTC(2027, 0, 1, 5) }
    const war = createWarClock(sim, schedule, schedule.begins - HOUR)
    expect(war.paused).toBe(true)
    war.update(schedule.begins + 22 * DAY + HOUR)
    expect(war.paused).toBe(true)
    war.update(schedule.begins + HOUR)
    expect(war.paused).toBe(false)
    stepSimulation(sim)
    expect(sim.environment.clock.week).toBe(WAR_BEGINS)
  })
})

describe("what players see of the war", () => {
  const schedule = { ...DEFAULT_SCHEDULE, begins: Date.UTC(2027, 0, 1, 5) }
  const at = (offset: number) => {
    const sim = createSimulation({ map, seed: 1 })
    return createWarClock(sim, schedule, schedule.begins + offset).day
  }

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
