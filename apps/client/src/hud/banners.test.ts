import { enqueueCommand, MaskState, Side, stepSimulation } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { BANNER_SECONDS, createBannerQueue } from "./banners.ts"
import { createSquadNames } from "./squad-names.ts"
import { slot, testBattle } from "./test-battle.ts"

describe("banners", () => {
  it("says which squad the player now commands after taking one over", () => {
    const { sim, squad, members } = testBattle()
    const names = createSquadNames()
    const banners = createBannerQueue(sim, squad, names)
    banners.record([{ type: "squad-taken-over", side: Side.French, squad: squad.id, from: 9, men: 6 }])
    const surname = names.nameOf(sim, squad, slot(members, 0)).surname
    expect(banners.current(1)?.banner).toMatchObject({
      kicker: "Squad taken over",
      title: `You now command ${surname}'s squad`,
      detail: "6 men"
    })
  })

  it("raises one banner at a time, each for its time, ground won after bad news", () => {
    const { sim, squad } = testBattle()
    const banners = createBannerQueue(sim, squad)
    banners.record([
      { type: "objective-taken", name: "Crossroads", side: Side.French },
      { type: "counter-attack", side: Side.German }
    ])
    const first = banners.current(10)
    expect(first?.banner).toMatchObject({ kicker: "Alarm", title: "Counter-attack coming", tone: "alarm" })
    expect(banners.current(10 + BANNER_SECONDS / 2)?.progress).toBeCloseTo(0.5, 5)
    expect(banners.current(10 + BANNER_SECONDS + 0.01)?.banner).toMatchObject({
      kicker: "Objective taken",
      title: "Crossroads",
      tone: "won"
    })
    expect(banners.current(10 + 2 * BANNER_SECONDS + 0.02)).toBeNull()
  })

  it("lets an alarm cut in on anything less urgent", () => {
    const { sim, squad } = testBattle()
    const banners = createBannerQueue(sim, squad)
    banners.record([{ type: "reinforcement", squad: squad.id, side: Side.French, men: 8 }])
    expect(banners.current(0)?.banner.tone).toBe("routine")
    banners.record([{ type: "objective-taken", name: "Crossroads", side: Side.German }])
    expect(banners.current(1)?.banner).toMatchObject({ kicker: "Objective lost", detail: "Taken by the Germans" })
  })

  it("doesn't say the same thing twice at once", () => {
    const { sim, squad } = testBattle()
    const banners = createBannerQueue(sim, squad)
    const lost = { type: "objective-taken" as const, name: "Crossroads", side: Side.German }
    banners.record([lost, lost])
    banners.current(0)
    banners.record([lost])
    expect(banners.current(BANNER_SECONDS + 0.1)).toBeNull()
  })

  it("calls the gas, zero hour and the stand-to", () => {
    const { sim, squad, members } = testBattle()
    const banners = createBannerQueue(sim, squad)
    sim.soldiers.mask.state[slot(members, 2)] = MaskState.Donning
    banners.record([])
    expect(banners.current(0)?.banner.title).toBe("Gas! Masks on")
    squad.order = { kind: "creep", mission: 0, x: 40, standoff: 70, objectiveZ: 180 }
    banners.record([])
    expect(banners.current(BANNER_SECONDS + 0.01)?.banner).toMatchObject({
      kicker: "Zero hour",
      title: "Over the top!"
    })
    enqueueCommand(sim, { type: "clock", at: Date.UTC(1916, 5, 23, 20) })
    stepSimulation(sim)
    banners.record([])
    expect(banners.current(2 * BANNER_SECONDS + 0.02)?.banner).toMatchObject({ kicker: "Dusk", title: "Stand-to" })
  })
})
