import { createFlatMap } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { createSimulation, stepSimulation } from "./simulation.ts"
import { DEFAULT_SCHEDULE, scheduleForWeek, WAR_BEGINS } from "./war-calendar.ts"
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
