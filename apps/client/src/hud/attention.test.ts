import { TICK_RATE } from "@verdun/sim"
import { Side, stepSimulation } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { callForFire } from "../skirmish.ts"
import { ATTENTION_SECONDS, createAttentionWatch } from "./attention.ts"
import { missionsOf } from "./fire-support.ts"
import { clockView, createLightReader, sectorView } from "./sector-state.ts"
import { createOrderWatch } from "./squad-order.ts"
import { testBattle } from "./test-battle.ts"

function watching() {
  const battle = testBattle()
  const light = createLightReader()
  const orders = createOrderWatch(battle.sim, battle.squad)
  const watch = createAttentionWatch()
  const look = (now: number) =>
    watch.read(now, {
      sector: sectorView(battle.sim, Side.French, null),
      clock: clockView(battle.sim, light(battle.sim)),
      missions: missionsOf(battle.sim, Side.French, TICK_RATE, null),
      order: orders.read()
    })
  return { ...battle, look }
}

describe("attention", () => {
  it("asks for nothing while nothing changes", () => {
    const { look } = watching()
    expect(look(0)).toEqual({ objectives: false, sky: false, fire: false, order: false })
    expect(look(5)).toEqual({ objectives: false, sky: false, fire: false, order: false })
  })

  it("brings the objectives up for a while when one changes hands", () => {
    const { sim, look } = watching()
    look(0)
    const [crossroads] = sim.objectives
    if (crossroads) {
      crossroads.holder = Side.German
    }
    expect(look(1).objectives).toBe(true)
    expect(look(1 + ATTENTION_SECONDS.objectives - 0.1).objectives).toBe(true)
    expect(look(1 + ATTENTION_SECONDS.objectives + 0.1).objectives).toBe(false)
  })

  it("brings the guns up when a mission is called, the first included", () => {
    const { sim, look } = watching()
    look(0)
    callForFire(sim, Side.French, 150, 110)
    stepSimulation(sim)
    expect(look(1).fire).toBe(true)
    expect(look(1 + ATTENTION_SECONDS.fire + 0.1).fire).toBe(false)
  })

  it("brings the order up when it changes, and the sky when the weather turns", () => {
    const { sim, squad, look } = watching()
    look(0)
    squad.order = { kind: "follow" }
    sim.environment.weather = { ...sim.environment.weather, pattern: 5 }
    expect(look(1)).toMatchObject({ order: true, sky: true })
  })
})
