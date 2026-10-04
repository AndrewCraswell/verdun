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

describe("steer command", () => {
  it("walks a directly controlled soldier in the pushed direction until told to stop", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 50, z: 25, speed: 2 })
    enqueueCommand(sim, { type: "steer", soldier, x: 1, z: 0 })
    stepFor(sim, 1)

    expect(sim.soldiers.position.x[soldier]).toBeCloseTo(52)
    enqueueCommand(sim, { type: "steer", soldier, x: 0, z: 0 })
    stepFor(sim, 1)
    expect(sim.soldiers.position.x[soldier]).toBeCloseTo(52)
    expect(hasComponent(sim.world, soldier, sim.soldiers.steer)).toBe(false)
  })

  it("caps diagonal input at walking speed, and allows slower creeping", () => {
    const sim = createSimulation({ map, seed: 1 })
    const fast = spawnSoldier(sim, { side: Side.French, x: 10, z: 10, speed: 2 })
    const slow = spawnSoldier(sim, { side: Side.French, x: 60, z: 10, speed: 2 })
    enqueueCommand(sim, { type: "steer", soldier: fast, x: 1, z: 1 })
    enqueueCommand(sim, { type: "steer", soldier: slow, x: 0.5, z: 0 })
    stepFor(sim, 1)

    expect(Math.hypot(sim.soldiers.position.x[fast] - 10, sim.soldiers.position.z[fast] - 10)).toBeCloseTo(2)
    expect(sim.soldiers.position.x[slow]).toBeCloseTo(61)
  })

  it("overrides a move order and stays on the map", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 1, z: 25, speed: 2 })
    enqueueCommand(sim, { type: "move-to", soldier, x: 90, z: 25 })
    stepSimulation(sim)
    enqueueCommand(sim, { type: "steer", soldier, x: -1, z: 0 })
    stepFor(sim, 2)

    expect(hasComponent(sim.world, soldier, sim.soldiers.moveOrder)).toBe(false)
    expect(sim.soldiers.position.x[soldier]).toBe(0)
  })

  it("ignores steering for entities that are not soldiers", () => {
    const sim = createSimulation({ map, seed: 1 })
    enqueueCommand(sim, { type: "steer", soldier: 999, x: 1, z: 0 })

    expect(() => stepSimulation(sim)).not.toThrow()
  })
})

describe("facing", () => {
  it("starts toward the enemy: north for the French, south for the Germans", () => {
    const sim = createSimulation({ map, seed: 1 })
    const french = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const german = spawnSoldier(sim, { side: Side.German, x: 10, z: 40 })

    expect([sim.soldiers.facing.x[french], sim.soldiers.facing.z[french]]).toEqual([0, 1])
    expect([sim.soldiers.facing.x[german], sim.soldiers.facing.z[german]]).toEqual([0, -1])
  })

  it("turns to an aimed direction, normalised, ignoring zero vectors", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    enqueueCommand(sim, { type: "face", soldier, x: 3, z: 4 })
    enqueueCommand(sim, { type: "face", soldier, x: 0, z: 0 })
    enqueueCommand(sim, { type: "face", soldier: 999, x: 1, z: 0 })
    stepSimulation(sim)

    expect(sim.soldiers.facing.x[soldier]).toBeCloseTo(0.6)
    expect(sim.soldiers.facing.z[soldier]).toBeCloseTo(0.8)
  })

  it("follows the direction of travel under a move order", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    enqueueCommand(sim, { type: "move-to", soldier, x: 30, z: 10 })
    stepSimulation(sim)

    expect([sim.soldiers.facing.x[soldier], sim.soldiers.facing.z[soldier]]).toEqual([1, 0])
  })
})
