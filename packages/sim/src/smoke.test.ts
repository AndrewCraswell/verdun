import { createFlatMap, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { hitChance } from "./combat.ts"
import { Side } from "./components.ts"
import { releaseGas } from "./gas.ts"
import { createLineOfSight } from "./physics-sight.ts"
import { createSimulation, spawnSoldier, stepSimulation, TICK_RATE } from "./simulation.ts"
import { seesThroughSmoke, smokeBetween } from "./smoke.ts"

const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
const eye = (x: number, z: number) => ({ x, y: 6.65, z })

describe("shell smoke", () => {
  it("rises from every burst and dims sight lines through it, not beside it", () => {
    const sim = createSimulation({ map: { ...map, heights: map.heights.slice() }, seed: 1, wind: { x: 0, z: 0 } })
    expect(smokeBetween(sim, eye(100, 50), eye(100, 150))).toBe(0)
    sim.artillery.shells.push({ shell: Shell.HeavyHighExplosive, side: Side.French, x: 100, z: 100, landsAtTick: 0 })
    stepSimulation(sim)
    for (let step = 0; step < TICK_RATE; step++) {
      stepSimulation(sim)
    }

    expect(smokeBetween(sim, eye(100, 50), eye(100, 150))).toBeGreaterThan(0.5)
    expect(smokeBetween(sim, eye(160, 50), eye(160, 150))).toBe(0)
  })

  it("clears within a minute or two", () => {
    const sim = createSimulation({ map, seed: 1, wind: { x: 0, z: 0 } })
    releaseGas(sim.smoke, 100, 100, 25_000)
    for (let step = 0; step < 150 * TICK_RATE; step++) {
      stepSimulation(sim)
    }

    expect(sim.smoke.active).toBe(false)
  })

  it("spoils aim through thin smoke and hides targets behind thick smoke", async () => {
    const sim = createSimulation({ map, seed: 1, wind: { x: 0, z: 0 } })
    sim.lineOfSight = await createLineOfSight(map)
    const shooter = spawnSoldier(sim, { side: Side.German, x: 100, z: 150 })
    const target = spawnSoldier(sim, { side: Side.French, x: 100, z: 60 })
    const clear = hitChance(sim, shooter, target)
    releaseGas(sim.smoke, 100, 100, 2_000)

    expect(hitChance(sim, shooter, target)).toBeLessThan(clear)
    expect(seesThroughSmoke(sim, eye(100, 150), eye(100, 60))).toBe(true)
    releaseGas(sim.smoke, 100, 104, 200_000)
    expect(seesThroughSmoke(sim, eye(100, 150), eye(100, 60))).toBe(false)
    for (let step = 0; step < 2 * TICK_RATE; step++) {
      stepSimulation(sim)
    }
    expect(sim.soldiers.target.id[shooter]).toBe(-1)
    sim.lineOfSight.dispose()
  })
})
