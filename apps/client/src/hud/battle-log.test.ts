import {
  enqueueCommand,
  MaskState,
  PLAYTEST_OPERATION,
  planOperation,
  Shell,
  type SimEvent,
  Side,
  spawnSoldier,
  stepSimulation,
  TICK_RATE,
  WeatherPattern
} from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { callForFire } from "../skirmish.ts"
import { createBattleLog, LOG_LENGTH } from "./battle-log.ts"
import { createSquadNames } from "./squad-names.ts"
import { slot, testBattle } from "./test-battle.ts"

function logged() {
  const battle = testBattle()
  const names = createSquadNames()
  const log = createBattleLog(battle.sim, battle.squad, TICK_RATE, names)
  const who = (index: number) => {
    const name = names.nameOf(battle.sim, battle.squad, slot(battle.members, index))
    return `${name.rank} ${name.surname}`
  }
  return { ...battle, log, who }
}

describe("the battle log", () => {
  it("tells of zero hour and how the operation went", () => {
    const { sim, log } = logged()
    planOperation(sim, PLAYTEST_OPERATION)
    // Not a literal: the event carries its squads too, which the test doesn't need.
    const zeroHour = { type: "zero-hour" as const, side: Side.French, squads: [] }
    log.record([zeroHour, { type: "operation-over", result: "taken" }])
    expect(log.messages.map((message) => message.text)).toEqual([
      "Zero hour: the first wave goes over",
      "The operation is over: their line is taken"
    ])
  })

  it("tells of squads taken over, guns spotted and manned, and the reserves going in", () => {
    const { sim, squad, members, log, who } = logged()
    const gunner = slot(members, 7)
    const german = spawnSoldier(sim, { side: Side.German, x: 40, z: 120 })
    log.record([
      { type: "squad-taken-over", side: Side.French, squad: squad.id, from: 9, men: 6 },
      { type: "gun-manned", squad: squad.id, soldier: gunner },
      { type: "gun-spotted", side: Side.French, soldier: german, x: 40, z: 120 },
      { type: "gun-spotted", side: Side.German, soldier: gunner, x: 61, z: 20 }
    ])
    expect(log.messages.map((message) => message.text)).toEqual(
      expect.arrayContaining([
        `You take over ${who(0)}'s squad: 6 men`,
        `${who(7)} takes over the machine gun`,
        "Enemy machine gun spotted, 100 m north",
        "The enemy has spotted your machine gun: move it"
      ])
    )
    log.record([
      { type: "counter-thrust", side: Side.French, x: 150, squads: 2 },
      { type: "counter-thrust", side: Side.German, x: 150, squads: 1 },
      { type: "reserves-up", side: Side.French, squads: 1 },
      { type: "reserves-up", side: Side.German, squads: 3 }
    ])
    expect(log.messages.map((message) => message.text)).toEqual(
      expect.arrayContaining([
        "Reserves counter-attack the break-in: 2 squads",
        "The enemy's reserves are counter-attacking the break-in",
        "Reserves going up to the line: 1 squad",
        "Enemy reserves moving up"
      ])
    )
  })

  it("reports changes of hands, counter-attacks and surrenders from the player's side", () => {
    const { sim, log } = logged()
    const germans = [0, 1].map((index) => spawnSoldier(sim, { side: Side.German, x: 150, z: 180 + index }))
    const french = spawnSoldier(sim, { side: Side.French, x: 150, z: 60 })
    const events: SimEvent[] = [
      { type: "objective-taken", name: "Crossroads", side: Side.French },
      { type: "objective-taken", name: "Crossroads", side: Side.German },
      { type: "counter-attack", side: Side.German },
      { type: "counter-attack", side: Side.French },
      ...germans.map((soldier) => ({ type: "capture" as const, soldier })),
      { type: "capture", soldier: french }
    ]
    log.record(events)
    expect(log.messages.map((message) => [message.text, message.kind, message.alarm])).toEqual([
      ["Crossroads taken by the French", "sector", false],
      ["Crossroads taken by the Germans", "alarm", true],
      ["The enemy is shelling the lost trench: counter-attack coming", "alarm", true],
      ["Counter-attack ordered", "sector", false],
      ["2 prisoners taken", "sector", false],
      ["1 of ours surrendered", "alarm", true]
    ])
  })

  it("adds prisoners taken in quick succession to the line already up", () => {
    const { sim, log } = logged()
    const germans = [0, 1, 2].map((index) => spawnSoldier(sim, { side: Side.German, x: 150, z: 180 + index }))
    log.record([{ type: "capture", soldier: germans[0] ?? -1 }])
    sim.tick += 3 * TICK_RATE
    log.record(germans.slice(1).map((soldier) => ({ type: "capture" as const, soldier })))
    expect(log.messages.map((message) => message.text)).toEqual(["3 prisoners taken"])
    expect(log.messages[0]?.tick).toBe(sim.tick)
    sim.tick += 15 * TICK_RATE
    log.record([{ type: "capture", soldier: germans[0] ?? -1 }])
    expect(log.messages.map((message) => message.text)).toEqual(["3 prisoners taken", "1 prisoner taken"])
  })

  it("names the squad's own men: who fell and how, who was taken, and what became of the wounded", () => {
    const { log, members, who } = logged()
    log.record([
      { type: "fallen", soldier: slot(members, 1), killed: true, cause: { kind: "machine-gun", by: Side.German } },
      { type: "fallen", soldier: slot(members, 2), killed: false, cause: { kind: "shell", by: Side.French } },
      { type: "fallen", soldier: slot(members, 3), killed: true, cause: { kind: "other", by: -1 } },
      { type: "capture", soldier: slot(members, 4) },
      { type: "arrived-at-aid-post", soldier: slot(members, 2) },
      { type: "returned-to-duty", soldier: slot(members, 2) },
      { type: "died-of-wounds", soldier: slot(members, 5) }
    ])
    // Seven lines said; the log keeps the newest six.
    expect(log.messages.map((message) => message.text)).toEqual([
      `${who(2)} is down, wounded by our own shells`,
      `${who(3)} killed`,
      `${who(4)} taken prisoner`,
      `${who(2)} reached the aid post`,
      `${who(2)} is patched up and back in the reserves`,
      `${who(5)} died of his wounds`
    ])
    log.record([
      { type: "fallen", soldier: slot(members, 1), killed: true, cause: { kind: "machine-gun", by: Side.German } }
    ])
    expect(log.messages.at(-1)?.text).toBe(`${who(1)} killed by machine-gun fire`)
  })

  it("tells once of a squadmate hit but still fighting", () => {
    const { sim, log, members, who } = logged()
    sim.soldiers.health.value[slot(members, 6)] = 0.7
    log.record([])
    log.record([])
    expect(log.messages.map((message) => message.text)).toEqual([`${who(6)} wounded, still fighting`])
  })

  it("raises the gas alarm once, when the squad's men start pulling on their masks", () => {
    const { sim, log, members } = logged()
    sim.soldiers.mask.state[slot(members, 1)] = MaskState.Donning
    log.record([])
    log.record([])
    expect(log.messages.map((message) => message.text)).toEqual(["Gas! Masks on"])
    for (const member of members) {
      sim.soldiers.mask.state[member] = MaskState.Off
    }
    log.record([])
    sim.soldiers.mask.state[slot(members, 2)] = MaskState.Donning
    log.record([])
    expect(log.messages.filter((message) => message.text === "Gas! Masks on")).toHaveLength(2)
  })

  it("logs our guns called, our batteries running dry, and nothing of the enemy's", () => {
    const { sim, log } = logged()
    callForFire(sim, Side.French, 150, 110)
    stepSimulation(sim)
    log.record([
      { type: "out-of-shells", side: Side.French, shell: Shell.FieldGas },
      { type: "out-of-shells", side: Side.German, shell: Shell.FieldGas }
    ])
    expect(log.messages.map((message) => [message.text, message.kind])).toEqual([
      ["The batteries are out of gas shells", "alarm"],
      ["Fire mission, near Crossroads: rounds in 30 s", "fire"]
    ])
  })

  it("remarks on the weather turning and the stand-to at dawn", () => {
    const { sim, log } = logged()
    sim.environment.weather = { ...sim.environment.weather, pattern: WeatherPattern.Fog }
    log.record([])
    enqueueCommand(sim, { type: "clock", at: Date.UTC(1916, 5, 23, 3) })
    stepSimulation(sim)
    sim.environment.weather = { ...sim.environment.weather, pattern: WeatherPattern.Fog }
    log.record([])
    expect(log.messages.map((message) => message.text)).toEqual([
      "Fog coming down",
      "Stand-to: dawn, every man to the fire step"
    ])
  })

  it("logs the squad's replacements arriving, and drops old lines", () => {
    const { sim, squad, log } = logged()
    log.record([{ type: "reinforcement", squad: squad.id, side: Side.French, men: 8 }])
    log.record([{ type: "reinforcement", squad: squad.id + 1, side: Side.French, men: 8 }])
    expect(log.messages.map((message) => message.text)).toEqual(["Replacements up in the rear trench: 8 men"])
    sim.tick += 21 * TICK_RATE
    log.record([])
    expect(log.messages).toEqual([])
  })

  it("keeps the newest lines when a lot happens at once", () => {
    const { log } = logged()
    log.record(
      Array.from({ length: 10 }, (_, index) => ({
        type: "objective-taken" as const,
        name: `Bay ${index}`,
        side: Side.French
      }))
    )
    expect(log.messages).toHaveLength(LOG_LENGTH)
    expect(log.messages.at(-1)?.text).toBe("Bay 9 taken by the French")
  })
})
