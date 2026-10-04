import { createFlatMap, layOutFront, Surface } from "@verdun/map"
import { createSimulation, Shell, type Simulation, TICK_RATE, WeatherPattern } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { atmosphereLevels, createAtmosphereModel } from "./atmosphere-model.ts"
import type { Listener } from "./battle-sound-model.ts"

const CLOSE: Listener = { x: 100, z: 40, height: 40, rightX: 1, rightZ: 0 }
const HIGH: Listener = { ...CLOSE, height: 300 }

function battle(): Simulation {
  const flat = createFlatMap({ name: "sector", cellSize: 0.5, columns: 600, rows: 400 }, 5, Surface.Grass)
  return createSimulation({ map: { ...flat, trenches: layOutFront(flat) }, seed: 1 })
}

function weather(sim: Simulation, changes: Partial<Simulation["environment"]["weather"]>): void {
  sim.environment.weather = { ...sim.environment.weather, ...changes }
}

describe("atmosphereLevels", () => {
  it("plays rain by how hard it falls, but not snow", () => {
    const sim = battle()
    weather(sim, { precipitation: 3, snowFraction: 0 })
    expect(atmosphereLevels(sim, CLOSE, 0).rain).toBeCloseTo(0.5)
    weather(sim, { precipitation: 12, snowFraction: 1 })
    expect(atmosphereLevels(sim, CLOSE, 0).rain).toBe(0)
  })

  it("plays the wind once it blows harder than a breeze", () => {
    const sim = battle()
    weather(sim, { wind: { x: 2, z: 0 } })
    expect(atmosphereLevels(sim, CLOSE, 0).wind).toBe(0)
    weather(sim, { wind: { x: 0, z: 12 } })
    expect(atmosphereLevels(sim, CLOSE, 0).wind).toBe(1)
  })

  it("brings up the front's roar as the camera climbs, louder for heavier fighting", () => {
    const sim = battle()
    expect(atmosphereLevels(sim, CLOSE, 1).roar).toBe(0)
    expect(atmosphereLevels(sim, HIGH, 0).roar).toBeCloseTo(0.3)
    expect(atmosphereLevels(sim, HIGH, 1).roar).toBe(1)
  })
})

describe("createAtmosphereModel", () => {
  it("measures the fighting from the bursts and shots of each step", () => {
    const sim = battle()
    const model = createAtmosphereModel(sim)
    expect(model.intensity()).toBe(0)
    for (let step = 0; step < 10 * TICK_RATE; step++) {
      sim.events.length = 0
      sim.events.push({ type: "burst", shell: Shell.FieldHighExplosive, at: { x: 0, y: 0, z: 0 }, crater: null })
      model.step(CLOSE)
    }
    expect(model.intensity()).toBe(1)
    expect(model.levels(HIGH).roar).toBe(1)
  })

  it("thunders now and then in a storm, from far off, and never otherwise", () => {
    const sim = battle()
    const model = createAtmosphereModel(sim)
    sim.events.length = 0
    weather(sim, { pattern: WeatherPattern.Fair })
    const fair = Array.from({ length: 60 * TICK_RATE }, () => model.step(CLOSE)).flat()
    expect(fair).toEqual([])
    weather(sim, { pattern: WeatherPattern.Storm })
    const storm = Array.from({ length: 60 * TICK_RATE }, () => model.step(CLOSE)).flat()
    expect(storm.length).toBeGreaterThanOrEqual(2)
    expect(storm.every((call) => call.cue === "thunder" && call.delay > 2 && call.cutoff < 3000)).toBe(true)
  })
})
