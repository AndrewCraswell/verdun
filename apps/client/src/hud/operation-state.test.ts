import { PLAYTEST_OPERATION, planOperation, Side, TICK_RATE } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { clipToEastings, operationView, planFires } from "./operation-state.ts"
import { testBattle } from "./test-battle.ts"

describe("the operation's countdown", () => {
  it("is nothing without an operation", () => {
    const { sim } = testBattle()
    expect(operationView(sim, Side.French, TICK_RATE)).toBeNull()
    expect(planFires(sim)).toBe(false)
  })

  it("counts down to the attack from now, says when our guns fire, then counts the hold, then says how it went", () => {
    const { sim } = testBattle()
    const operation = planOperation(sim, PLAYTEST_OPERATION)
    const start = operationView(sim, Side.French, TICK_RATE)
    expect(start).toMatchObject({ phase: "before", attacking: true, label: "Attack in", seconds: 480, note: null })
    expect(planFires(sim)).toBe(true)

    sim.tick = operation.zeroHourAt - 60 * TICK_RATE
    expect(operationView(sim, Side.French, TICK_RATE)).toMatchObject({ seconds: 60, note: "Our guns are firing" })
    // The defenders are told only that an attack is expected: no time to count to.
    expect(operationView(sim, Side.German, TICK_RATE)).toMatchObject({
      label: "French attack expected",
      seconds: null,
      progress: null,
      note: "Their guns are firing"
    })

    sim.tick = operation.zeroHourAt + 200 * TICK_RATE
    const hold = operationView(sim, Side.French, TICK_RATE)
    expect(hold).toMatchObject({ phase: "attack", label: "Hold", seconds: 1000 })
    expect(hold?.progress).toBeCloseTo(200 / 1200, 5)

    expect(operationView(sim, Side.German, TICK_RATE)).toMatchObject({ label: "Hold the line", seconds: null })

    operation.result = "footing"
    expect(operationView(sim, Side.French, TICK_RATE)).toMatchObject({
      phase: "over",
      seconds: null,
      note: "A footing gained"
    })
    expect(operationView(sim, Side.German, TICK_RATE)?.note).toBe("A footing lost")
    expect(planFires(sim)).toBe(false)
  })

  it("shows the attackers the stretch of the enemy's line they go in on, and keeps it from the defenders", () => {
    const { sim } = testBattle()
    const operation = planOperation(sim, PLAYTEST_OPERATION)
    const stretch = operationView(sim, Side.French, TICK_RATE)?.stretch ?? []
    expect(stretch.length).toBeGreaterThan(0)
    for (const line of stretch) {
      for (const [x] of line) {
        expect(x).toBeGreaterThanOrEqual(operation.fromX - 1e-6)
        expect(x).toBeLessThanOrEqual(operation.toX + 1e-6)
      }
    }
    // Their front line only: not the support and reserve lines behind it.
    const middles = stretch.map((line) => line.reduce((sum, [, z]) => sum + z, 0) / line.length)
    expect(Math.max(...middles) - Math.min(...middles)).toBeLessThanOrEqual(20)
    expect(operationView(sim, Side.German, TICK_RATE)?.stretch).toBeNull()
  })

  it("cuts lines where they cross the eastings it keeps", () => {
    const line: [number, number][] = [
      [0, 10],
      [40, 10],
      [60, 30],
      [100, 30]
    ]
    expect(clipToEastings([line], 20, 80)).toEqual([
      [
        [20, 10],
        [40, 10],
        [60, 30],
        [80, 30]
      ]
    ])
    // Out and back in again: two runs.
    const zigzag: [number, number][] = [
      [10, 0],
      [30, 0],
      [10, 5],
      [30, 5]
    ]
    expect(clipToEastings([zigzag], 0, 20)).toEqual([
      [
        [10, 0],
        [20, 0]
      ],
      [
        [20, 2.5],
        [10, 5],
        [20, 5]
      ]
    ])
  })
})
