import {
  allotReinforcements,
  casualty,
  createSquad,
  MaskState,
  Shell,
  Side,
  spawnSoldier,
  stepSimulation,
  TICK_RATE,
  type WarDay
} from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createHudModel, shotChance } from "./hud-state.ts"
import { slot, testBattle } from "./test-battle.ts"

describe("the HUD's state", () => {
  it("brings the soldier, the squad, the sector, the guns and the log together", () => {
    const { sim, squad, members } = testBattle()
    const model = createHudModel(sim, squad, TICK_RATE)
    model.record([{ type: "objective-taken", name: "Crossroads", side: Side.French }])
    const state = model.read(10, Date.UTC(2026, 9, 4))
    expect(state.soldier?.id).toBe(slot(members, 0))
    expect(state.roster).toHaveLength(8)
    expect(state.order.kind).toBe("hold")
    expect(state.fire.calls.map((call) => call.key)).toEqual(["B", "V", "X", "G"])
    expect(state.clock.hour).toBe("07:00")
    expect(state.sector.objectives).toHaveLength(2)
    expect(state.log.map((message) => message.text)).toEqual(["Crossroads taken by the French"])
    expect(state.banner?.banner.title).toBe("Crossroads")
    expect(state.wiped).toBeNull()
    expect(state.war).toBeNull()
    expect(state.cursor).toEqual({ state: "aim", ready: 1, shaken: false, chance: null, steadiness: 0 })
    expect(state.screen).toEqual({ suppression: 0, wounded: 0, gas: 0, mask: 0, shaken: 0, burst: 0, fallen: 0 })
    expect(model.names.nameOf(sim, squad, slot(members, 0)).rank).toBe("Caporal")
  })

  it("darkens the screen for fire, wounds, the mask and failing morale, and draws the reload on the pointer", () => {
    const { sim, squad, members } = testBattle()
    const leader = slot(members, 0)
    const model = createHudModel(sim, squad, TICK_RATE)
    sim.soldiers.suppression.value[leader] = 0.9
    sim.soldiers.health.value[leader] = 0.6
    sim.soldiers.mask.state[leader] = MaskState.On
    sim.soldiers.morale.value[leader] = 0.3
    sim.soldiers.weapon.cooldown[leader] = 1.5
    const state = model.read(0)
    expect(state.screen.suppression).toBeCloseTo(1, 5)
    expect(state.screen.wounded).toBeCloseTo(0.75, 5)
    expect(state.screen.mask).toBe(1)
    expect(state.screen.shaken).toBeCloseTo(0.5, 5)
    expect(state.cursor).toEqual({ state: "reload", ready: 0.5, shaken: true, chance: null, steadiness: 0 })
  })

  it("jolts the screen when a shell bursts close, and lets it fade", () => {
    const { sim, squad, members } = testBattle()
    const leader = slot(members, 0)
    const model = createHudModel(sim, squad, TICK_RATE)
    const at = { x: sim.soldiers.position.x[leader] + 3, y: 5, z: sim.soldiers.position.z[leader] }
    model.record([{ type: "burst", shell: Shell.HeavyHighExplosive, at, crater: null }])
    expect(model.read(0).screen.burst).toBe(1)
    model.record([{ type: "burst", shell: Shell.Grenade, at: { ...at, x: at.x + 30 }, crater: null }])
    sim.tick += 3 * TICK_RATE
    expect(model.read(1).screen.burst).toBe(0)
    model.record([{ type: "burst", shell: Shell.Grenade, at, crater: null }])
    expect(model.read(2).screen.burst).toBeGreaterThan(0)
  })

  it("shows the squad lost, its men's fates and the replacements coming up", () => {
    const { sim, squad, members } = testBattle()
    allotReinforcements(sim, Side.French, 40)
    const model = createHudModel(sim, squad, TICK_RATE)
    for (const member of members) {
      casualty(sim, member, 1)
    }
    for (let step = 0; step < 10; step++) {
      stepSimulation(sim)
      model.record(sim.events)
    }
    const state = model.read(5)
    expect(state.soldier).toBeNull()
    expect(state.cursor.state).toBe("none")
    expect(state.wiped).toMatchObject({ men: 8, reserves: 32 })
    expect(state.wiped?.seconds).toBeGreaterThan(20)
    expect(state.succession?.next).toBeNull()
  })

  it("keeps the squads on offer in the order they came, so none moves under the pointer", () => {
    const { sim, squad, members } = testBattle()
    const squadAt = (x: number) =>
      createSquad(
        sim,
        Side.French,
        Array.from({ length: 5 }, (_, index) => spawnSoldier(sim, { side: Side.French, x: x + index * 2, z: 20 })),
        "ai"
      )
    const far = squadAt(200)
    const near = squadAt(100)
    const model = createHudModel(sim, squad, TICK_RATE)
    for (const member of members) {
      casualty(sim, member, 1)
    }
    stepSimulation(sim)
    expect(model.read(1).wiped?.choices.map((choice) => choice.squad)).toEqual([near.id, far.id])
    // A nearer squad turns up: it goes to the end, not the top.
    const nearest = squadAt(60)
    expect(model.read(2).wiped?.choices.map((choice) => choice.squad)).toEqual([near.id, far.id, nearest.id])
    // One loses too many men: it drops out, the rest keep their places.
    for (const member of near.members.slice(0, 2)) {
      casualty(sim, member, 1)
    }
    stepSimulation(sim)
    expect(model.read(3).wiped?.choices.map((choice) => choice.squad)).toEqual([far.id, nearest.id])
  })

  it("says a shot's chance in words, as a share of the best the weapon can do", () => {
    expect(shotChance(0.2, 0.2)).toBe("good")
    expect(shotChance(0.1, 0.2)).toBe("good")
    expect(shotChance(0.06, 0.2)).toBe("fair")
    expect(shotChance(0.02, 0.2)).toBe("poor")
    expect(shotChance(0.5, 0)).toBe("poor")
  })

  it("follows the war's calendar when the battle runs on it", () => {
    const { sim, squad } = testBattle()
    const now = Date.UTC(2026, 9, 4, 12)
    const day: WarDay = {
      phase: "turn",
      season: 1916,
      turn: 25,
      turns: 52,
      week: Date.UTC(1916, 5, 20),
      standTo: true,
      nextCutoff: now + 3_600_000
    }
    const model = createHudModel(sim, squad, TICK_RATE, { war: { day, paused: true } })
    expect(model.read(0, now).war).toMatchObject({ turn: "Day 25 of 52, 1916", standTo: true })
  })
})
