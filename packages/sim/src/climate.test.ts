import { createFlatMap } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { craterDepthFactor, exposureFactor, fouling, recoveryFactor, reloadFactor } from "./climate.ts"
import { fireAimed, Weapon, WEAPONS } from "./combat.ts"
import { Side } from "./components.ts"
import { burstReach } from "./ground.ts"
import { createSimulation, enqueueCommand, type Simulation, spawnSoldier, stepSimulation } from "./simulation.ts"
import { typicalWeather, type Weather, WeatherPattern } from "./weather.ts"

function inWeather(change: Partial<Weather>): Simulation {
  const sim = createSimulation({ map: createFlatMap({ name: "field", cellSize: 1, columns: 100, rows: 100 }), seed: 1 })
  const weather = { ...typicalWeather(WeatherPattern.Fair, sim.wind), wetness: 0.15, temperature: 15, ...change }
  enqueueCommand(sim, { type: "forecast", forecast: { kind: "steady", weather } })
  stepSimulation(sim)
  return sim
}

describe("weather in the fighting", () => {
  it("fouls rifles in mud and heavy rain, machine guns less, and leaves them alone in fair weather and frost", () => {
    expect(reloadFactor(inWeather({}), false)).toBe(1)
    const mud = inWeather({ wetness: 1 })
    expect(fouling(mud)).toBe(1)
    expect(reloadFactor(mud, false)).toBeCloseTo(1.35)
    expect(reloadFactor(mud, true)).toBeCloseTo(1.15)
    const downpour = inWeather({ precipitation: 8, snowFraction: 0 })
    expect(reloadFactor(downpour, false)).toBeCloseTo(1.35)
    // Frozen mud and falling snow don't clog a bolt.
    expect(reloadFactor(inWeather({ wetness: 1, temperature: -5, precipitation: 3, snowFraction: 1 }), false)).toBe(1)
  })

  it("slows a rifleman's next shot in the mud", () => {
    for (const [wetness, factor] of [
      [0.15, 1],
      [1, 1.35]
    ] as const) {
      const sim = inWeather({ wetness })
      const rifleman = spawnSoldier(sim, { side: Side.French, x: 50, z: 50 })
      expect(fireAimed(sim, rifleman)).toBe(true)
      expect(sim.soldiers.weapon.cooldown[rifleman]).toBeCloseTo(WEAPONS[Weapon.Rifle].interval * factor, 5)
    }
  })

  it("wears men down in the cold and, less, in the heat, and kills the wounded faster in the cold", () => {
    expect(recoveryFactor(inWeather({ temperature: 15 }))).toBe(1)
    expect(recoveryFactor(inWeather({ temperature: -15 }))).toBeCloseTo(0.65)
    expect(recoveryFactor(inWeather({ temperature: 35 }))).toBeCloseTo(0.8)
    expect(exposureFactor(inWeather({ temperature: 15 }))).toBe(1)
    expect(exposureFactor(inWeather({ temperature: -15 }))).toBeCloseTo(2.5)
  })

  it("bursts shells on frozen ground: further-reaching fragments, shallower craters", () => {
    const frozen = inWeather({ temperature: -6 })
    expect(burstReach(frozen, 50, 50)).toBeCloseTo(1.15)
    expect(craterDepthFactor(frozen)).toBe(0.6)
    const mild = inWeather({})
    expect(burstReach(mild, 50, 50)).toBe(1)
    expect(craterDepthFactor(mild)).toBe(1)
  })
})
