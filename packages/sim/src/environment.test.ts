import { createFlatMap } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { shotEvents } from "./combat.ts"
import { Side } from "./components.ts"
import { DEFAULT_START, timeScale } from "./environment.ts"
import { createLineOfSight } from "./line-of-sight.ts"
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
  it("starts on the morning of the attack on Fleury and runs a day in two real hours", () => {
    const sim = createSimulation({ map, seed: 1 })
    expect(sim.environment.clock.utc).toBe(DEFAULT_START)
    expect(timeScale(sim.environment.clock)).toBe(12)
    run(sim, TICK_RATE * 10)
    expect(sim.environment.clock.utc - DEFAULT_START).toBeCloseTo(120_000)
  })

  it("can be set, and sped up or slowed down, by command", () => {
    const sim = createSimulation({ map, seed: 1 })
    const midnight = Date.UTC(1916, 5, 30, 23)
    enqueueCommand(sim, { type: "clock", utc: midnight, minutesPerDay: 1440 })
    run(sim, TICK_RATE)
    expect(sim.environment.clock.utc).toBeCloseTo(midnight + 1000)
    expect(sim.environment.sky.sun.altitude).toBeLessThan(-10)

    enqueueCommand(sim, { type: "clock", minutesPerDay: -5, utc: Number.NaN })
    run(sim, 1)
    expect(sim.environment.clock.minutesPerDay).toBe(1440)
  })
})

describe("the light", () => {
  it("lets men see for kilometres by day and only tens of metres on a moonless night", () => {
    const sim = createSimulation({ map, seed: 1 })
    expect(sim.environment.sightRange).toBeGreaterThan(5000)
    enqueueCommand(sim, { type: "clock", utc: Date.UTC(1916, 5, 30, 23) })
    run(sim, 1)
    expect(sim.environment.illuminance).toBeLessThan(0.01)
    expect(sim.environment.sightRange).toBeLessThan(40)
  })

  it("keeps riflemen from firing at men they can't make out in the dark", async () => {
    const lineOfSight = await createLineOfSight(map)
    const shotsFired = (utc: number) => {
      const sim = createSimulation({ map, seed: 1, environment: { start: utc } })
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
    enqueueCommand(sim, { type: "clock", utc: sim.environment.clock.utc + 3 * 24 * 3_600_000 })
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
