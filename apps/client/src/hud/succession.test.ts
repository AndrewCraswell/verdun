import { casualty, enqueueCommand, type Simulation, stepSimulation, surrender } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createSquadNames } from "./squad-names.ts"
import { createSuccessionWatch, SUCCESSION_SECONDS } from "./succession.ts"
import { slot, testBattle } from "./test-battle.ts"

/** A few steps, for the squad to hand command on. */
function settle(sim: Simulation): void {
  for (let step = 0; step < 10; step++) {
    stepSimulation(sim)
  }
}

describe("the handover", () => {
  it("tells who fell and how, then who takes over, for its time", () => {
    const { sim, squad, members } = testBattle()
    const names = createSquadNames()
    const watch = createSuccessionWatch(sim, squad, names)
    expect(watch.read(0)).toBeNull()
    casualty(sim, slot(members, 0), 0)
    settle(sim)
    const handover = watch.read(1)
    const fallen = names.nameOf(sim, squad, slot(members, 0))
    const next = names.nameOf(sim, squad, squad.leader)
    expect(handover).toMatchObject({
      fallen: { name: fallen, fate: "badly wounded" },
      next: { name: next, slot: squad.members.indexOf(squad.leader) + 1, role: "Rifleman" },
      progress: 0
    })
    expect(watch.read(1 + SUCCESSION_SECONDS / 2)?.progress).toBeCloseTo(0.5, 5)
    expect(watch.read(1 + SUCCESSION_SECONDS)).toBeNull()
  })

  it("needs no handover when the player switches men by choice", () => {
    const { sim, squad, members } = testBattle()
    const watch = createSuccessionWatch(sim, squad, createSquadNames())
    enqueueCommand(sim, { type: "take-command", squad: squad.id, soldier: slot(members, 4) })
    stepSimulation(sim)
    expect(squad.leader).toBe(slot(members, 4))
    expect(watch.read(0)).toBeNull()
  })

  it("names the fate of a man taken prisoner or killed, and of the last man", () => {
    const { sim, squad, members } = testBattle()
    const watch = createSuccessionWatch(sim, squad, createSquadNames())
    surrender(sim, slot(members, 0))
    settle(sim)
    expect(watch.read(0)?.fallen.fate).toBe("taken prisoner")
    for (const member of members.slice(1)) {
      casualty(sim, member, 1)
    }
    settle(sim)
    const last = watch.read(1)
    expect(last).toMatchObject({ fallen: { fate: "killed" }, next: null })
  })
})
