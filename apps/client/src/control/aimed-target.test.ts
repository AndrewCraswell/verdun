import { createFlatMap, Surface } from "@verdun/map"
import { createSimulation, type LineOfSight, Side, spawnSoldier } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { aimedTargetNow } from "./aimed-target.ts"

describe("aimedTargetNow", () => {
  it("answers again from memory while nothing moves, and looks again once the aim, the place or the step changes", () => {
    const sim = createSimulation({
      map: createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 3, Surface.Grass),
      seed: 1
    })
    let casts = 0
    const clear: LineOfSight = {
      isClear: () => {
        casts++
        return true
      },
      rebuildRegion: () => 1,
      setSightHeight: () => undefined,
      dispose: () => undefined
    }
    sim.lineOfSight = clear
    const shooter = spawnSoldier(sim, { side: Side.French, x: 50, z: 50, facing: { x: 0, z: 1 } })
    const ahead = spawnSoldier(sim, { side: Side.German, x: 50, z: 70 })

    expect(aimedTargetNow(sim, shooter)).toBe(ahead)
    const looked = casts
    expect(aimedTargetNow(sim, shooter)).toBe(ahead)
    expect(casts).toBe(looked)

    sim.soldiers.facing.x[shooter] = 1
    sim.soldiers.facing.z[shooter] = 0
    expect(aimedTargetNow(sim, shooter)).toBe(-1)
    sim.tick += 1
    sim.soldiers.facing.x[shooter] = 0
    sim.soldiers.facing.z[shooter] = 1
    expect(aimedTargetNow(sim, shooter)).toBe(ahead)
  })
})
