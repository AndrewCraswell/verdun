import { casualty, enqueueCommand, MaskState, Stance, stepSimulation, surrender, TICK_RATE, Weapon } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { actionFor, type Casualties, effectsOn, rosterView, severityOf, soldierView } from "./soldier-state.ts"
import { createSquadNames } from "./squad-names.ts"
import { slot, testBattle } from "./test-battle.ts"

const NONE: Casualties = { lying: new Set(), evacuated: new Set(), captured: new Set(), returned: new Set() }

describe("soldierView", () => {
  it("says what the action key would do: man a comrade's gun beside him, hand his own back, or nothing", () => {
    const { sim, members } = testBattle()
    const leader = slot(members, 0)
    const gunner = slot(members, 7)
    expect(actionFor(sim, leader)).toBeNull()
    sim.soldiers.position.x[gunner] = sim.soldiers.position.x[leader] + 1
    sim.soldiers.position.z[gunner] = sim.soldiers.position.z[leader]
    expect(actionFor(sim, leader)).toBe("Man the gun")
    expect(actionFor(sim, gunner)).toBe("Hand back the gun")
  })

  it("names a sniper and a rifle grenadier by their job, and counts the grenadier's rifle grenades", () => {
    const { sim, squad, members } = testBattle()
    const names = createSquadNames()
    const grenadier = slot(members, 2)
    sim.soldiers.weapon.kind[slot(members, 1)] = Weapon.Sniper
    sim.soldiers.weapon.kind[grenadier] = Weapon.RifleGrenadier
    sim.soldiers.rifleGrenades.count[grenadier] = 5
    const roster = rosterView(sim, squad, names, NONE)
    expect(roster.slice(0, 4).map((man) => man.role)).toEqual(["leader", "sniper", "grenadier", "rifleman"])
    expect(soldierView(sim, squad, names, TICK_RATE)?.rifleGrenades).toBeNull()
    enqueueCommand(sim, { type: "take-command", squad: squad.id, soldier: grenadier })
    stepSimulation(sim)
    const view = soldierView(sim, squad, names, TICK_RATE)
    expect(view?.weapon).toMatchObject({ kind: "rifle-grenade", name: "Lebel with VB discharger" })
    expect(view?.rifleGrenades).toEqual({ count: 5, carried: 8 })
  })

  it("describes the man under control in words, never hit points", () => {
    const { sim, squad, members } = testBattle()
    const leader = slot(members, 0)
    sim.soldiers.morale.value[leader] = 0.4
    sim.soldiers.suppression.value[leader] = 0.7
    sim.soldiers.health.value[leader] = 0.6
    sim.soldiers.stance.value[leader] = Stance.Prone
    sim.soldiers.grenades.count[leader] = 1
    sim.soldiers.weapon.cooldown[leader] = 1.5
    const view = soldierView(sim, squad, createSquadNames(), TICK_RATE)
    expect(view).toMatchObject({
      id: leader,
      slot: 1,
      role: "leader",
      roleLabel: "Squad leader",
      spirit: "shaken",
      fire: "pinned",
      wounded: true,
      posture: "prone",
      mask: "off",
      grenades: { count: 1, carried: 3 },
      weapon: { kind: "rifle", name: "Lebel M1886", ready: 0.5 }
    })
    expect(view?.name.rank).toBe("Caporal")
  })

  it("reads breaking, being under fire, the mask going on and climbing out of a dugout", () => {
    const { sim, squad, members } = testBattle()
    const leader = slot(members, 0)
    const names = createSquadNames()
    sim.soldiers.morale.value[leader] = 0.1
    sim.soldiers.suppression.value[leader] = 0.3
    sim.soldiers.mask.state[leader] = MaskState.Donning
    sim.soldiers.mask.at[leader] = sim.tick + 6 * TICK_RATE
    sim.soldiers.stance.value[leader] = Stance.Sheltering
    sim.soldiers.shelter.emergeAt[leader] = sim.tick + 40
    const view = soldierView(sim, squad, names, TICK_RATE)
    expect(view).toMatchObject({ spirit: "broken", fire: "under-fire", mask: "masking", posture: "climbing-out" })
    expect(view?.maskProgress).toBeCloseTo(0.5, 5)
    sim.soldiers.shelter.emergeAt[leader] = -1
    sim.soldiers.mask.state[leader] = MaskState.On
    expect(soldierView(sim, squad, names, TICK_RATE)).toMatchObject({ posture: "sheltering", maskProgress: 1 })
  })

  it("marks when he can't run, and when he's spent", () => {
    const { sim, squad, members } = testBattle()
    const leader = slot(members, 0)
    sim.soldiers.stamina.value[leader] = 10
    const winded = soldierView(sim, squad, createSquadNames(), TICK_RATE)?.stamina
    expect(winded).toMatchObject({ share: 0.1, runs: 0.25, winded: true, spent: false })
    sim.soldiers.stamina.spent[leader] = 1
    expect(soldierView(sim, squad, createSquadNames(), TICK_RATE)?.stamina.spent).toBe(true)
  })

  it("is nobody once the squad is gone", () => {
    const { sim, squad } = testBattle()
    squad.leader = -1
    expect(soldierView(sim, squad, createSquadNames(), TICK_RATE)).toBeNull()
  })
})

describe("rosterView", () => {
  it("gives each man the state that matters most, worst first", () => {
    const { sim, squad, members } = testBattle()
    sim.soldiers.suppression.value[slot(members, 1)] = 0.7
    sim.soldiers.morale.value[slot(members, 1)] = 0.1
    sim.soldiers.suppression.value[slot(members, 2)] = 0.7
    sim.soldiers.mask.state[slot(members, 3)] = MaskState.Donning
    sim.soldiers.morale.value[slot(members, 4)] = 0.5
    sim.soldiers.suppression.value[slot(members, 5)] = 0.3
    sim.soldiers.stamina.spent[slot(members, 6)] = 1
    sim.soldiers.health.value[slot(members, 7)] = 0.7
    const roster = rosterView(sim, squad, createSquadNames(), NONE)
    expect(roster.map((man) => man.status)).toEqual([
      "steady",
      "broken",
      "pinned",
      "masking",
      "shaken",
      "under-fire",
      "spent",
      "wounded"
    ])
    expect(roster.map((man) => man.severity)).toEqual([
      "good",
      "danger",
      "danger",
      "danger",
      "caution",
      "caution",
      "caution",
      "caution"
    ])
    expect(roster[0]).toMatchObject({ slot: 1, controlled: true, fighting: true, distance: null })
    expect(roster[1]?.distance).toBeCloseTo(3, 5)
  })

  it("tells the fallen's fates apart: killed, down, carried, at the aid post, in hospital, back on duty, captured", () => {
    const { sim, squad, members } = testBattle()
    for (const index of [1, 2, 3, 4, 5]) {
      casualty(sim, slot(members, index), 1)
    }
    casualty(sim, slot(members, 6), 0)
    surrender(sim, slot(members, 7))
    sim.soldiers.casualty.evacuateAt[slot(members, 2)] = sim.tick + 100
    sim.soldiers.casualty.treatment[slot(members, 3)] = 20
    sim.soldiers.casualty.treatment[slot(members, 4)] = -1
    sim.soldiers.casualty.treatment[slot(members, 5)] = -1
    const casualties: Casualties = {
      lying: new Set([slot(members, 2), slot(members, 6)]),
      evacuated: new Set([slot(members, 3), slot(members, 4), slot(members, 5)]),
      captured: new Set([slot(members, 7)]),
      returned: new Set([slot(members, 5)])
    }
    sim.soldiers.casualty.evacuateAt[slot(members, 6)] = -1
    const roster = rosterView(sim, squad, createSquadNames(), casualties)
    expect(roster.slice(1).map((man) => man.status)).toEqual([
      "killed",
      "carried",
      "aid-post",
      "hospital",
      "returned",
      "down",
      "captured"
    ])
    expect(roster.slice(1).every((man) => !man.fighting && man.severity === "out" && man.marks.length === 0)).toBe(true)
  })

  it("marks the masked, the hurt, the spent and those out of grenades", () => {
    const { sim, squad, members } = testBattle()
    const man = slot(members, 2)
    sim.soldiers.mask.state[man] = MaskState.On
    sim.soldiers.health.value[man] = 0.8
    sim.soldiers.grenades.count[man] = 0
    sim.soldiers.suppression.value[man] = 0.7
    sim.soldiers.stamina.spent[man] = 1
    expect(rosterView(sim, squad, createSquadNames(), NONE)[2]?.marks).toEqual([
      "wounded",
      "masked",
      "no-grenades",
      "spent"
    ])
  })

  it("puts nobody under control once the leader has fallen", () => {
    const { sim, squad, members } = testBattle()
    casualty(sim, slot(members, 0), 1)
    const roster = rosterView(sim, squad, createSquadNames(), NONE)
    expect(roster.some((man) => man.controlled)).toBe(false)
    expect(roster.every((man) => man.distance === null)).toBe(true)
  })

  it("rates every state on one scale", () => {
    expect(severityOf("gassed")).toBe("danger")
    expect(severityOf("returned")).toBe("out")
  })
})

describe("effectsOn", () => {
  it("lists what acts on the man, with a reason in a soldier's words, worst first", () => {
    const { sim, squad, members } = testBattle()
    const leader = slot(members, 0)
    sim.soldiers.suppression.value[leader] = 0.7
    sim.soldiers.health.value[leader] = 0.5
    sim.soldiers.mask.state[leader] = MaskState.On
    sim.soldiers.stamina.value[leader] = 5
    const view = soldierView(sim, squad, createSquadNames(), TICK_RATE)
    if (!view) {
      throw new Error("The leader should be under control")
    }
    const effects = effectsOn(sim, view)
    expect(effects.map((effect) => effect.id)).toEqual(["pinned", "wounded", "winded", "masked", "parapet"])
    expect(effects[0]).toEqual({ id: "pinned", reason: "Pinned: rounds landing close", severity: "danger" })
  })

  it("tells of gas with no mask on, the mask going on, the dugout and the weather", () => {
    const { sim, squad, members } = testBattle()
    const leader = slot(members, 0)
    const names = createSquadNames()
    const x = sim.soldiers.position.x[leader]
    const z = sim.soldiers.position.z[leader]
    const cell = Math.floor(z / 4) * sim.gas.columns + Math.floor(x / 4)
    sim.gas.concentration[cell] = 50
    const exposed = soldierView(sim, squad, names, TICK_RATE)
    expect(exposed && effectsOn(sim, exposed).map((effect) => effect.id)).toContain("gas")
    sim.soldiers.mask.state[leader] = MaskState.Donning
    sim.soldiers.stance.value[leader] = Stance.Sheltering
    sim.environment.weather = { ...sim.environment.weather, visibility: 200 }
    const masking = soldierView(sim, squad, names, TICK_RATE)
    const ids = masking ? effectsOn(sim, masking).map((effect) => effect.id) : []
    expect(ids).toEqual(expect.arrayContaining(["mask", "fog", "dugout"]))
    expect(ids).not.toContain("gas")
  })
})
