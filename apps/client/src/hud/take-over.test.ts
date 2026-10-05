import { casualty, createSquad, type EntityId, Side, spawnSoldier, stepSimulation, Weapon } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createSquadNames } from "./squad-names.ts"
import { takeOverChoices } from "./take-over.ts"
import { testBattle } from "./test-battle.ts"

describe("the squads a wiped-out player can take over", () => {
  it("offers none while the player's squad stands", () => {
    const { sim, squad } = testBattle()
    expect(takeOverChoices(sim, squad, createSquadNames())).toEqual([])
  })

  it("lists each by its leader, its men and kit, where it is and what it's doing, nearest first", () => {
    const { sim, squad, members } = testBattle()
    const kinds = [Weapon.Rifle, Weapon.Rifle, Weapon.Sniper, Weapon.Rifle, Weapon.RifleGrenadier, Weapon.Rifle]
    const squadAt = (x: number, z: number, weapons: readonly Weapon[]): EntityId[] =>
      weapons.map((weapon, index) => spawnSoldier(sim, { side: Side.French, x: x + index * 2, z, weapon }))
    // Near the crossroads, 100 m or so east of where the player's squad fell.
    const near = createSquad(sim, Side.French, squadAt(140, 100, kinds), "ai")
    near.order = { kind: "reserve" }
    const far = createSquad(
      sim,
      Side.French,
      squadAt(250, 30, [Weapon.Rifle, Weapon.Rifle, Weapon.Rifle, Weapon.MachineGun]),
      "ai"
    )
    far.order = { kind: "hold" }
    for (const member of members) {
      casualty(sim, member, 1)
    }
    stepSimulation(sim)

    const choices = takeOverChoices(sim, squad, createSquadNames())
    expect(choices.map((choice) => choice.squad)).toEqual([near.id, far.id])
    const [first, second] = choices
    expect(first).toMatchObject({ men: 6, kit: ["sniper", "grenadier"], order: "In reserve" })
    expect(first?.name).toMatch(/'s squad$/)
    expect(first?.leader).toMatch(/^Caporal /)
    expect(first?.place).toMatch(/^Near Crossroads, \d+ m north-east$/)
    expect(second).toMatchObject({ men: 4, kit: ["machine-gun"], order: "Holding" })
    expect(second?.place).toMatch(/^\d+ m east$/)
    expect(second?.at.x).toBe(250)
  })
})
