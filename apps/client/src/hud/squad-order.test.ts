import { describe, expect, it } from "vitest"
import { createOrderWatch } from "./squad-order.ts"
import { slot, testBattle } from "./test-battle.ts"

describe("the squad's order", () => {
  it("says what the men are doing, and counts each new order", () => {
    const { squad, sim } = testBattle()
    const watch = createOrderWatch(sim, squad)
    expect(watch.read()).toMatchObject({ kind: "hold", label: "Holding", detail: "where they stand", serial: 0 })
    squad.order = { kind: "follow" }
    expect(watch.read()).toMatchObject({ label: "Following you", detail: null, target: null, serial: 1 })
    squad.order = { kind: "reserve" }
    expect(watch.read()).toMatchObject({ label: "In reserve", serial: 2 })
    squad.order = { kind: "creep", mission: 0, x: 40, standoff: 70, objectiveZ: 180 }
    expect(watch.read()).toMatchObject({ label: "Following the barrage", detail: "70 m behind it" })
    squad.order = { kind: "raid", x: 150, z: 180, homeX: 40, homeZ: 20, phase: "home" }
    expect(watch.read()).toMatchObject({ label: "Raiding", detail: "coming home", target: { x: 40, z: 20 } })
  })

  it("remembers where the squad was told to hold", () => {
    const { squad, sim } = testBattle()
    squad.order = { kind: "follow" }
    const watch = createOrderWatch(sim, squad)
    watch.read()
    squad.order = { kind: "hold" }
    // The squad stands from x 40 to 61 at z 20: it holds round its middle.
    expect(watch.read().target).toEqual({ x: 50.5, z: 20 })
  })

  it("gives an advance's distance and direction, and when it's there", () => {
    const { squad, sim, members } = testBattle()
    const watch = createOrderWatch(sim, squad)
    squad.order = { kind: "advance", x: 40, z: 60 }
    expect(watch.read()).toMatchObject({ label: "Advancing", detail: "40 m north", target: { x: 40, z: 60 } })
    sim.soldiers.position.z[slot(members, 0)] = 56
    expect(watch.read()).toMatchObject({ label: "In position", detail: null })
  })

  it("counts the men who can't obey: pinned or broken, the man under control apart", () => {
    const { squad, sim, members } = testBattle()
    sim.soldiers.suppression.value[slot(members, 0)] = 0.9
    sim.soldiers.suppression.value[slot(members, 1)] = 0.9
    sim.soldiers.suppression.value[slot(members, 2)] = 0.9
    sim.soldiers.morale.value[slot(members, 3)] = 0.1
    expect(createOrderWatch(sim, squad).read()).toMatchObject({ pinned: 2, broken: 1 })
  })
})
