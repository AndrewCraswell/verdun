import { createFlatMap } from "@verdun/map"
import { hasComponent } from "bitecs"
import { describe, expect, it } from "vitest"
import { Side } from "./components.ts"
import {
  createSimulation,
  enqueueCommand,
  soldierIds,
  STEP_SECONDS,
  stepSimulation,
  TICK_RATE,
  WALKING_SPEED,
  spawnSoldier
} from "./simulation.ts"

// 100 m x 50 m of flat ground.
const map = createFlatMap({ name: "test", cellSize: 1, columns: 100, rows: 50 })

function stepFor(sim: ReturnType<typeof createSimulation>, seconds: number) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
  }
}

describe("spawnSoldier", () => {
  it("places a soldier with its side and walking speed", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.German, x: 10, z: 20 })

    expect(Array.from(soldierIds(sim))).toEqual([soldier])
    expect(sim.soldiers.position.x[soldier]).toBe(10)
    expect(sim.soldiers.position.z[soldier]).toBe(20)
    expect(sim.soldiers.side.value[soldier]).toBe(Side.German)
    expect(sim.soldiers.speed.value[soldier]).toBeCloseTo(WALKING_SPEED)
  })

  it("keeps soldiers on the map", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: -5, z: 900 })

    expect(sim.soldiers.position.x[soldier]).toBe(0)
    expect(sim.soldiers.position.z[soldier]).toBe(50)
  })

  it("refuses to spawn past the store capacity", () => {
    const sim = createSimulation({ map, seed: 1, capacity: 2 })
    spawnSoldier(sim, { side: Side.French, x: 0, z: 0 })

    expect(() => spawnSoldier(sim, { side: Side.French, x: 0, z: 0 })).toThrow(RangeError)
  })
})

describe("move-to command", () => {
  it("takes effect on the next step, not when queued", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 0, z: 0 })
    enqueueCommand(sim, { type: "move-to", soldier, x: 10, z: 0 })

    expect(hasComponent(sim.world, soldier, sim.soldiers.moveOrder)).toBe(false)
    stepSimulation(sim)
    expect(sim.tick).toBe(1)
    expect(sim.soldiers.position.x[soldier]).toBeCloseTo(WALKING_SPEED * STEP_SECONDS)
  })

  it("walks the soldier at its speed and stops at the target", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 0, z: 0, speed: 2 })
    enqueueCommand(sim, { type: "move-to", soldier, x: 30, z: 40 })

    stepFor(sim, 10)
    expect(Math.hypot(sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier])).toBeCloseTo(20, 4)

    stepFor(sim, 20)
    expect(sim.soldiers.position.x[soldier]).toBe(30)
    expect(sim.soldiers.position.z[soldier]).toBe(40)
    expect(hasComponent(sim.world, soldier, sim.soldiers.moveOrder)).toBe(false)
  })

  it("clamps targets to the map", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 99, z: 49, speed: 10 })
    enqueueCommand(sim, { type: "move-to", soldier, x: 500, z: 500 })

    stepFor(sim, 1)
    expect(sim.soldiers.position.x[soldier]).toBe(100)
    expect(sim.soldiers.position.z[soldier]).toBe(50)
  })

  it("ignores orders for entities that are not soldiers", () => {
    const sim = createSimulation({ map, seed: 1 })
    enqueueCommand(sim, { type: "move-to", soldier: 999, x: 10, z: 10 })

    expect(() => stepSimulation(sim)).not.toThrow()
    expect(sim.tick).toBe(1)
  })
})
