import { PLAYTEST_OPERATION, planOperation, Side, TICK_RATE } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { operationView, planFires } from "./operation-state.ts"
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
    expect(operationView(sim, Side.German, TICK_RATE)).toMatchObject({
      label: "Their attack in",
      note: "Their guns are firing"
    })

    sim.tick = operation.zeroHourAt + 200 * TICK_RATE
    const hold = operationView(sim, Side.French, TICK_RATE)
    expect(hold).toMatchObject({ phase: "attack", label: "Hold", seconds: 1000 })
    expect(hold?.progress).toBeCloseTo(200 / 1200, 5)

    operation.result = "footing"
    expect(operationView(sim, Side.French, TICK_RATE)).toMatchObject({
      phase: "over",
      seconds: null,
      note: "A footing gained"
    })
    expect(planFires(sim)).toBe(false)
  })
})
