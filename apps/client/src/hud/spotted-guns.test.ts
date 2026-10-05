import { Side, spawnSoldier, SPOTTED_SECONDS, TICK_RATE, Weapon } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { spottedGunsView } from "./spotted-guns.ts"
import { slot, testBattle } from "./test-battle.ts"

describe("spotted machine guns", () => {
  it("marks the enemy's guns we've spotted and our own once the enemy has, fading after the last burst", () => {
    const { sim, squad, members } = testBattle()
    const german = spawnSoldier(sim, { side: Side.German, x: 150, z: 180, weapon: Weapon.MachineGun })
    const gunner = slot(members, 7)
    const sighting = { checkedAt: 0, shelledAt: -1, spotted: true, seen: true }
    sim.spotting.sightings.push(
      { ...sighting, soldier: german, side: Side.German, x: 150, z: 180, lastFired: sim.tick },
      { ...sighting, soldier: gunner, side: Side.French, x: 61, z: 20, lastFired: sim.tick, seen: false },
      // Fired, but nobody placed it: not marked.
      { ...sighting, soldier: german, side: Side.German, x: 90, z: 190, lastFired: sim.tick, spotted: false }
    )
    expect(spottedGunsView(sim, squad, TICK_RATE)).toEqual([
      { soldier: german, x: 150, z: 180, fresh: 1, seen: true, ours: false },
      { soldier: gunner, x: 61, z: 20, fresh: 1, seen: false, ours: true }
    ])
    sim.tick += (SPOTTED_SECONDS * TICK_RATE) / 2
    expect(spottedGunsView(sim, squad, TICK_RATE)[0]?.fresh).toBeCloseTo(0.5, 5)
    sim.tick += SPOTTED_SECONDS * TICK_RATE
    expect(spottedGunsView(sim, squad, TICK_RATE)).toEqual([])
  })
})
