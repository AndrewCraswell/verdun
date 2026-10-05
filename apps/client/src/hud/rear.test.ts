import { aidPost, casualty, Side, stepSimulation } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { rearView } from "./rear.ts"
import { testBattle } from "./test-battle.ts"

describe("the aid post", () => {
  it("marks our aid post, and counts the men carried in and kept there for treatment", () => {
    const { sim, squad, members } = testBattle()
    const post = aidPost(sim.map, Side.French)
    expect(rearView(sim, squad).aidPost).toEqual({ x: post.x, z: post.z, patients: 0 })
    for (const member of members) {
      casualty(sim, member, 0)
    }
    let patients = 0
    for (let step = 0; step < 20 * 600 && patients === 0; step++) {
      stepSimulation(sim)
      patients = rearView(sim, squad).aidPost.patients
    }
    expect(patients).toBeGreaterThan(0)
  })
})
