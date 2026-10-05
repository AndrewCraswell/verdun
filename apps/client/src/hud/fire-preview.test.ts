import { fireMissionAt, gasShootAt, Side, spawnSoldier } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { callEndangers, callPreview } from "./fire-preview.ts"
import { testBattle } from "./test-battle.ts"

describe("a call for fire, before it's made", () => {
  it("falls where the simulation's own plan says, with its delay and length", () => {
    const { sim } = testBattle()
    const fire = callPreview(sim, Side.French, "fire", { x: 150, z: 160 })
    const plan = fireMissionAt(Side.French, 150, 160)
    expect(fire).toMatchObject({
      kind: "fire",
      fromX: plan.fromX,
      toX: plan.toX,
      nearZ: plan.z - plan.band / 2,
      farZ: plan.z + plan.band / 2,
      delay: plan.delay,
      duration: plan.duration,
      ourMen: 0
    })
    expect(fire.reach).toBeGreaterThan(0)
    const gas = callPreview(sim, Side.French, "gas", { x: 150, z: 160 })
    expect(gas.toX - gas.fromX).toBe(gasShootAt(Side.French, 150, 160).toX - gasShootAt(Side.French, 150, 160).fromX)
  })

  it("counts our men in the beaten zone, and only ours", () => {
    const { sim, members } = testBattle()
    // The squad stands at z 20, from x 40 to 61.
    const onThem = callPreview(sim, Side.French, "fire", { x: 50, z: 20 })
    expect(onThem.ourMen).toBe(members.length)
    expect(callEndangers(sim, Side.French, "fire", { x: 50, z: 20 })).toBe(true)
    spawnSoldier(sim, { side: Side.German, x: 150, z: 160 })
    expect(callPreview(sim, Side.French, "fire", { x: 150, z: 160 }).ourMen).toBe(0)
    expect(callEndangers(sim, Side.French, "gas", { x: 150, z: 160 })).toBe(false)
  })
})
