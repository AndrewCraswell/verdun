import { createSquad, Side, spawnSoldier } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createSquadNames, roleLabel, roleOf, weaponName } from "./squad-names.ts"
import { slot, testBattle } from "./test-battle.ts"

describe("squad names", () => {
  it("gives every man of a squad his own surname, and keeps it", () => {
    const { sim, squad, members } = testBattle()
    const names = createSquadNames()
    const first = members.map((soldier) => names.nameOf(sim, squad, soldier))
    expect(new Set(first.map((name) => name.surname)).size).toBe(members.length)
    expect(members.map((soldier) => names.nameOf(sim, squad, soldier))).toEqual(first)
    for (const name of first) {
      expect(name.given.length).toBeGreaterThan(1)
      expect(name.surname.length).toBeGreaterThan(1)
    }
  })

  it("ranks the men by slot, in their own army's words", () => {
    const { sim, squad, members } = testBattle()
    const names = createSquadNames()
    expect(members.slice(0, 3).map((soldier) => names.nameOf(sim, squad, soldier).rank)).toEqual([
      "Caporal",
      "Soldat de 1re classe",
      "Soldat"
    ])
    const germans = [0, 1, 2].map((index) => spawnSoldier(sim, { side: Side.German, x: 200, z: 180 + index * 3 }))
    const enemy = createSquad(sim, Side.German, germans, "ai")
    expect(germans.map((soldier) => names.nameOf(sim, enemy, soldier).rank)).toEqual([
      "Unteroffizier",
      "Gefreiter",
      "Musketier"
    ])
  })

  it("tells the leader, the gunner and the riflemen apart, with each side's weapons", () => {
    const { sim, squad, members } = testBattle()
    expect(roleOf(sim, squad, slot(members, 0))).toBe("leader")
    expect(roleOf(sim, squad, slot(members, 3))).toBe("rifleman")
    expect(roleOf(sim, squad, slot(members, 7))).toBe("gunner")
    expect(roleLabel("gunner")).toBe("Machine gunner")
    expect(weaponName(sim, slot(members, 3))).toBe("Lebel M1886")
    expect(weaponName(sim, slot(members, 7))).toBe("Hotchkiss M1914")
    const german = spawnSoldier(sim, { side: Side.German, x: 200, z: 180 })
    expect(weaponName(sim, german)).toBe("Gewehr 98")
  })
})
