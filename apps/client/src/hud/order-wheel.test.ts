import { casualty } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { WEDGES, wedgeAt, wedgeRefusal, type WheelContext } from "./order-wheel.ts"
import { slot, testBattle } from "./test-battle.ts"

describe("the orders wheel", () => {
  it("chooses the wedge the pointer points toward, clockwise from the top, and nothing in the middle", () => {
    expect(wedgeAt(0, -80, 3)).toBe(0)
    expect(wedgeAt(70, 40, 3)).toBe(1)
    expect(wedgeAt(-70, 40, 3)).toBe(2)
    expect(wedgeAt(5, -5, 3)).toBeNull()
    // Just either side of the top wedge's edges, at 60 degrees from straight up.
    expect(wedgeAt(Math.sin(1), -Math.cos(1), 3, 0.5)).toBe(0)
    expect(wedgeAt(Math.sin(1.1), -Math.cos(1.1), 3, 0.5)).toBe(1)
    expect(wedgeAt(10, 10, 0)).toBeNull()
    // Eight wedges: straight down is the fifth.
    expect(wedgeAt(0, 80, 8)).toBe(4)
  })

  it("gives the orders on the ground where the wheel opened, and digs in where the squad stands", () => {
    const { sim, squad, members } = testBattle()
    const context: WheelContext = { at: { x: 12, z: 34 }, sim, squad }
    const orders = new Map(WEDGES.map((wedge) => [wedge.kind, wedge.order(context)]))
    expect(orders.get("advance")).toEqual({ kind: "advance", x: 12, z: 34 })
    expect(orders.get("run-to")).toEqual({ kind: "run-to", x: 12, z: 34 })
    expect(orders.get("suppress")).toEqual({ kind: "suppress", x: 12, z: 34 })
    const leader = slot(members, 0)
    expect(orders.get("dig-in")).toEqual({
      kind: "dig-in",
      x: sim.soldiers.position.x[leader],
      z: sim.soldiers.position.z[leader]
    })
    expect(orders.get("hold")).toEqual({ kind: "hold" })
    expect(orders.get("follow")).toEqual({ kind: "follow" })
    expect(orders.get("rally")).toEqual({ kind: "rally" })
  })

  it("greys what can't be given, and says why", () => {
    const { sim, squad, members } = testBattle()
    const byKind = (kind: string) => WEDGES.find((wedge) => wedge.kind === kind)
    const overSky: WheelContext = { at: null, sim, squad }
    const advance = byKind("advance")
    const rally = byKind("rally")
    const hold = byKind("hold")
    expect(advance && wedgeRefusal(advance, overSky)).toBe("Point at the ground")
    expect(rally && wedgeRefusal(rally, overSky)).toBe("Nobody is shaken")
    expect(hold && wedgeRefusal(hold, overSky)).toBeNull()
    for (const member of members) {
      casualty(sim, member, 1)
    }
    expect(hold && wedgeRefusal(hold, overSky)).toBe("Nobody left")
  })
})
