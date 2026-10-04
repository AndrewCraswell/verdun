import { createFlatMap, sampleIndex, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Side } from "./components.ts"
import { releaseGas } from "./gas.ts"
import { burstReach, sodden, weatherPace } from "./ground.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { typicalWeather, type Weather, WeatherPattern } from "./weather.ts"

/** Mud everywhere but a strip of grass along x < 20. */
function field(): ReturnType<typeof createFlatMap> {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Mud)
  for (let row = 0; row <= map.rows; row++) {
    for (let column = 0; column < 40; column++) {
      map.surfaces[sampleIndex(map, column, row)] = Surface.Grass
    }
  }
  return map
}

function weathered(weather: Partial<Weather>): Simulation {
  const sim = createSimulation({ map: field(), seed: 1, wind: { x: 0, z: 0 } })
  const held = { ...typicalWeather(WeatherPattern.Overcast, { x: 0, z: 0 }), ...weather }
  enqueueCommand(sim, { type: "forecast", forecast: { kind: "steady", weather: held } })
  stepSimulation(sim)
  return sim
}

describe("the ground in the weather", () => {
  it("goes as usual in fair weather", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    expect(sodden(sim)).toBe(0)
    expect(weatherPace(sim, 100, 100)).toBe(1)
    expect(burstReach(sim, 100, 100)).toBe(1)
  })

  it("bogs men down in sodden mud, less on grass, and not at all when frozen", () => {
    const wet = weathered({ wetness: 1, temperature: 8 })
    expect(weatherPace(wet, 100, 100)).toBeCloseTo(0.55)
    expect(weatherPace(wet, 5, 100)).toBeCloseTo(0.85)
    const frozen = weathered({ wetness: 1, temperature: -5 })
    expect(weatherPace(frozen, 100, 100)).toBe(1)
  })

  it("slows men in deep snow", () => {
    expect(weatherPace(weathered({ wetness: 0.1, snowCover: 40 }), 100, 100)).toBeCloseTo(0.75)
  })

  it("smothers shell bursts in sodden mud, but not on firm ground", () => {
    const wet = weathered({ wetness: 1, temperature: 8 })
    expect(burstReach(wet, 100, 100)).toBeCloseTo(0.7)
    expect(burstReach(wet, 5, 100)).toBe(1)
  })

  it("makes men cover less ground after days of rain", () => {
    const walk = (sim: Simulation) => {
      const soldier = spawnSoldier(sim, { side: Side.French, x: 100, z: 20 })
      enqueueCommand(sim, { type: "move-to", soldier, x: 100, z: 190 })
      for (let step = 0; step < TICK_RATE * 30; step++) {
        stepSimulation(sim)
      }
      return sim.soldiers.position.z[soldier] - 20
    }
    const dry = walk(weathered({ wetness: 0.2 }))
    const sodden = walk(weathered({ wetness: 1, temperature: 8 }))
    expect(sodden).toBeLessThan(dry * 0.6)
  })
})

describe("rain and gas", () => {
  it("washes gas and smoke out of the air", () => {
    const remaining = (precipitation: number) => {
      const sim = weathered({ precipitation, snowFraction: 0 })
      releaseGas(sim.gas, 100, 100, 50_000)
      releaseGas(sim.smoke, 100, 100, 50_000)
      for (let step = 0; step < TICK_RATE * 300; step++) {
        stepSimulation(sim)
      }
      const total = (values: Float32Array) => values.reduce((sum, value) => sum + value, 0)
      return { gas: total(sim.gas.concentration), smoke: total(sim.smoke.concentration) }
    }
    const dry = remaining(0)
    const wet = remaining(2)
    expect(wet.gas).toBeLessThan(dry.gas * 0.4)
    expect(wet.smoke).toBeLessThanOrEqual(dry.smoke)
  })
})
