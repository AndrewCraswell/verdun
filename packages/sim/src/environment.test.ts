import { createFlatMap } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { shotEvents } from "./combat.ts"
import { Side } from "./components.ts"
import { clockAt, clockMoment, DAY, DEFAULT_ELAPSED, DEFAULT_WEEK, timeScale, WEEK } from "./environment.ts"
import { createLineOfSight } from "./physics-sight.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { WeatherPattern } from "./weather.ts"

const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 })

function run(sim: Simulation, steps: number): Simulation {
  for (let step = 0; step < steps; step++) {
    stepSimulation(sim)
  }
  return sim
}

describe("the world clock", () => {
  it("starts in the week of the attack on Fleury, at 07:00 French time, and runs a day in 117 real minutes", () => {
    const sim = createSimulation({ map, seed: 1 })
    const { clock } = sim.environment
    expect(clock.week).toBe(DEFAULT_WEEK)
    expect(clockMoment(clock)).toBe(Date.UTC(1916, 5, 23, 6))
    expect(timeScale(clock)).toBeCloseTo(1440 / 117)
    run(sim, TICK_RATE * 10)
    expect(clock.elapsed - DEFAULT_ELAPSED).toBeCloseTo((10_000 * 1440) / 117)
  })

  it("brings night round about a third of a cycle later each real day, never at the same real hour", () => {
    const sim = createSimulation({ map, seed: 1 })
    const gameTimePerRealDay = 86_400_000 * timeScale(sim.environment.clock)
    const drift = (gameTimePerRealDay % DAY) / DAY
    expect(drift).toBeGreaterThan(0.25)
    expect(drift).toBeLessThan(0.4)
  })

  it("steps the sky through the week's dates, day by day, and starts the week again after the seventh", () => {
    const week = Date.UTC(1916, 1, 21)
    expect(clockMoment({ week, elapsed: 1.5 * DAY, minutesPerDay: 117 })).toBe(week + 1.5 * DAY)
    expect(clockMoment({ week, elapsed: WEEK + 0.25 * DAY, minutesPerDay: 117 })).toBe(week + 0.25 * DAY)
    expect(clockMoment({ week, elapsed: -0.25 * DAY, minutesPerDay: 117 })).toBe(week + 6.75 * DAY)
    expect(clockAt(Date.UTC(1916, 5, 30, 23))).toEqual({ week: Date.UTC(1916, 5, 30), elapsed: 23 * 3_600_000 })
  })

  it("moves on a week at the campaign's turn, keeping the hour and easing the weather into the new week", () => {
    const sim = createSimulation({ map, seed: 1, environment: { forecast: { kind: "cycle", seed: 4 } } })
    enqueueCommand(sim, { type: "clock", shift: 3 * DAY })
    run(sim, 1)
    const before = sim.environment.weather
    const hour = sim.environment.clock.elapsed % DAY
    const next = DEFAULT_WEEK + 26 * WEEK
    enqueueCommand(sim, { type: "clock", week: next })
    run(sim, 1)
    const { clock } = sim.environment
    expect(clock.week).toBe(next)
    expect(clock.elapsed).toBeLessThan(DAY)
    expect(clock.elapsed - hour).toBeLessThan(1000)
    // Still close to the old week's weather, then the new week's an hour of game time later.
    expect(sim.environment.blend).not.toBeNull()
    expect(sim.environment.weather.cloudCover).toBeCloseTo(before.cloudCover, 1)
    enqueueCommand(sim, { type: "clock", shift: 2 * 3_600_000 })
    run(sim, 1)
    expect(sim.environment.blend).toBeNull()
    expect(sim.environment.weather.cloudCover).toBeCloseTo(
      sim.environment.forecast.at(clockMoment(clock)).cloudCover,
      2
    )
  })

  it("eases the weather when the week's days start again", () => {
    const sim = createSimulation({
      map,
      seed: 1,
      environment: { forecast: { kind: "cycle", seed: 4 }, elapsed: WEEK - 300 }
    })
    expect(sim.environment.blend).toBeNull()
    run(sim, 2)
    expect(sim.environment.blend).not.toBeNull()
  })

  it("can be set, shifted, and sped up or slowed down, by command", () => {
    const sim = createSimulation({ map, seed: 1 })
    const night = Date.UTC(1916, 5, 30, 23)
    enqueueCommand(sim, { type: "clock", at: night, minutesPerDay: 1440 })
    run(sim, TICK_RATE)
    expect(clockMoment(sim.environment.clock)).toBeCloseTo(night + 1000)
    expect(sim.environment.sky.sun.altitude).toBeLessThan(-10)

    enqueueCommand(sim, { type: "clock", shift: -12 * 3_600_000 })
    run(sim, 1)
    expect(sim.environment.sky.sun.altitude).toBeGreaterThan(30)

    enqueueCommand(sim, { type: "clock", minutesPerDay: -5, at: Number.NaN, week: Infinity, shift: Number.NaN })
    run(sim, 1)
    expect(sim.environment.clock.minutesPerDay).toBe(1440)
    expect(sim.environment.clock.week).toBe(Date.UTC(1916, 5, 30))
  })
})

describe("the light", () => {
  it("lets men see for kilometres by day and only tens of metres on a moonless night", () => {
    const sim = createSimulation({ map, seed: 1 })
    expect(sim.environment.sightRange).toBeGreaterThan(5000)
    enqueueCommand(sim, { type: "clock", at: Date.UTC(1916, 5, 30, 23) })
    run(sim, 1)
    expect(sim.environment.illuminance).toBeLessThan(0.01)
    expect(sim.environment.sightRange).toBeLessThan(40)
  })

  it("keeps riflemen from firing at men they can't make out in the dark", async () => {
    const lineOfSight = await createLineOfSight(map)
    const shotsFired = (utc: number) => {
      const sim = createSimulation({ map, seed: 1, environment: clockAt(utc) })
      sim.lineOfSight = lineOfSight
      spawnSoldier(sim, { side: Side.French, x: 100, z: 40 })
      spawnSoldier(sim, { side: Side.German, x: 100, z: 160 })
      let shots = 0
      for (let step = 0; step < TICK_RATE * 20; step++) {
        stepSimulation(sim)
        shots += shotEvents(sim.events).length
      }
      return shots
    }
    expect(shotsFired(Date.UTC(1916, 5, 23, 10))).toBeGreaterThan(0)
    expect(shotsFired(Date.UTC(1916, 5, 30, 23))).toBe(0)
    lineOfSight.dispose()
  })
})

describe("the weather", () => {
  it("drives the wind that carries gas and smoke", () => {
    const sim = createSimulation({ map, seed: 1, environment: { forecast: { kind: "cycle", seed: 3 } } })
    run(sim, 1)
    expect(sim.wind).toEqual(sim.environment.weather.wind)
    enqueueCommand(sim, { type: "clock", shift: 3 * DAY })
    run(sim, 1)
    expect(sim.wind).toEqual(sim.environment.weather.wind)
  })

  it("holds steady with a set wind once the wind is commanded", () => {
    const sim = createSimulation({ map, seed: 1, environment: { forecast: { kind: "cycle", seed: 3 } } })
    enqueueCommand(sim, { type: "wind", x: -4, z: 1 })
    run(sim, TICK_RATE * 3)
    expect(sim.wind).toEqual({ x: -4, z: 1 })
    expect(sim.environment.forecast.spec.kind).toBe("steady")
  })

  it("changes source by command: a fog bank closes sight in to about a hundred metres", () => {
    const sim = createSimulation({ map, seed: 1 })
    const fog = {
      pattern: WeatherPattern.Fog,
      cloudCover: 1,
      precipitation: 0,
      snowFraction: 0,
      temperature: 8,
      visibility: 150,
      wind: { x: 0.3, z: 0 },
      wetness: 0.4,
      snowCover: 0
    }
    enqueueCommand(sim, { type: "forecast", forecast: { kind: "steady", weather: fog } })
    run(sim, 1)
    expect(sim.environment.weather.pattern).toBe(WeatherPattern.Fog)
    expect(sim.environment.sightRange).toBe(90)
  })

  it("saves with the world and resumes exactly, mid-way between weather readings", () => {
    const original = createSimulation({ map, seed: 7, environment: { forecast: { kind: "cycle", seed: 11 } } })
    run(original, TICK_RATE * 5 + 7)
    // Through JSON, as a save file would go.
    const file = JSON.stringify(takeSnapshot(original))
    const restored = restoreSimulation(map, JSON.parse(file))
    expect(takeSnapshot(restored)).toEqual(takeSnapshot(original))
    expect(takeSnapshot(run(restored, TICK_RATE * 3))).toEqual(takeSnapshot(run(original, TICK_RATE * 3)))
  })
})
