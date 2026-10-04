import { carveTrenches, createFlatMap, sampleIndex, Surface, type Trench } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Side } from "./components.ts"
import {
  createSimulation,
  enqueueCommand,
  spawnSoldier,
  stepSimulation,
  TICK_RATE,
  WALKING_SPEED
} from "./simulation.ts"
import { groundPace } from "./terrain.ts"

function fieldWith(surface: Surface) {
  return createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, surface)
}

describe("groundPace", () => {
  it("is full pace on firm ground, slower in mud and slowest on shell-churned ground", () => {
    expect(groundPace(fieldWith(Surface.Grass), 50, 50, 1, 0)).toBe(1)
    expect(groundPace(fieldWith(Surface.Chalk), 50, 50, 1, 0)).toBeCloseTo(0.95)
    expect(groundPace(fieldWith(Surface.Mud), 50, 50, 1, 0)).toBeCloseTo(0.6)
    expect(groundPace(fieldWith(Surface.Churned), 50, 50, 1, 0)).toBeCloseTo(0.5)
  })

  it("makes a trench wall a slow scramble, but the duckboards along its floor easy going", () => {
    const map = fieldWith(Surface.Mud)
    const trench: Trench = {
      kind: "fire",
      points: [
        [10, 50],
        [90, 50]
      ],
      facing: "north"
    }
    carveTrenches(map, [trench])
    const withTrench = { ...map, trenches: [trench] }

    // The slowest stretch climbing out, either over the front by the fire step or up the back wall.
    const slowestOut = (direction: number) =>
      Math.min(
        ...Array.from({ length: 40 }, (_, step) =>
          groundPace(withTrench, 50, 50 + direction * step * 0.1, 0, direction)
        )
      )

    expect(groundPace(withTrench, 50, 50, 1, 0)).toBeCloseTo(0.9)
    expect(slowestOut(1)).toBeLessThan(0.3)
    expect(slowestOut(-1)).toBeLessThan(0.3)
    expect(groundPace(withTrench, 50, 20, 0, 1)).toBeCloseTo(0.6)
  })

  it("slows men climbing a slope more than men going down it", () => {
    const map = fieldWith(Surface.Grass)
    for (let row = 0; row <= map.rows; row++) {
      for (let column = 0; column <= map.columns; column++) {
        map.heights[sampleIndex(map, column, row)] = row * map.cellSize * 0.5
      }
    }

    const up = groundPace(map, 50, 50, 0, 1)
    expect(up).toBeCloseTo(1 / (1 + 2.5 * 0.5), 2)
    expect(groundPace(map, 50, 50, 0, -1)).toBeGreaterThan(up)
    expect(groundPace(map, 50, 50, 1, 0)).toBe(1)
  })
})

describe("walking over the ground", () => {
  it("lets soldiers run at about twice walking pace", () => {
    const sim = createSimulation({ map: fieldWith(Surface.Grass), seed: 1 })
    const walker = spawnSoldier(sim, { side: Side.French, x: 20, z: 20 })
    const runner = spawnSoldier(sim, { side: Side.French, x: 30, z: 20 })
    enqueueCommand(sim, { type: "move-to", soldier: walker, x: 20, z: 60 })
    enqueueCommand(sim, { type: "move-to", soldier: runner, x: 30, z: 60, run: true })
    for (let step = 0; step <= TICK_RATE * 5; step++) {
      stepSimulation(sim)
    }

    expect(sim.soldiers.position.z[runner] - 20).toBeCloseTo(2 * (sim.soldiers.position.z[walker] - 20), 0)
  })

  it("takes soldiers longer across churned ground", () => {
    const times = [Surface.Grass, Surface.Churned].map((surface) => {
      const sim = createSimulation({ map: fieldWith(surface), seed: 1 })
      const soldier = spawnSoldier(sim, { side: Side.French, x: 20, z: 20 })
      enqueueCommand(sim, { type: "move-to", soldier, x: 20, z: 34 })
      let steps = 0
      while (sim.soldiers.position.z[soldier] < 34 && steps < 10_000) {
        stepSimulation(sim)
        steps++
      }
      return steps / TICK_RATE
    })

    expect(times[0]).toBeCloseTo(14 / WALKING_SPEED, 0)
    expect(times[1]).toBeCloseTo(14 / (WALKING_SPEED * 0.5), 0)
  })
})
