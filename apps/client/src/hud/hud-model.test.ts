import { createFlatMap, layOutFront, Surface } from "@verdun/map"
import {
  createSimulation,
  createSquad,
  MaskState,
  type SimEvent,
  Side,
  spawnSoldier,
  Stance,
  stepSimulation,
  surrender,
  TICK_RATE
} from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createBattleLog, hudModel, LOG_LENGTH } from "./hud-model.ts"

function battle() {
  const flat = createFlatMap({ name: "sector", cellSize: 0.5, columns: 600, rows: 400 }, 5, Surface.Grass)
  const map = { ...flat, trenches: layOutFront(flat), objectives: [{ name: "Crossroads", x: 150, z: 100, radius: 10 }] }
  const sim = createSimulation({ map, seed: 1 })
  const members = [0, 1, 2].map((index) => spawnSoldier(sim, { side: Side.French, x: 40 + index * 3, z: 20 }))
  const squad = createSquad(sim, Side.French, members, "player")
  return { sim, squad, members }
}

describe("hudModel", () => {
  it("shows the soldier in control, the squad, the sector and both sides' losses", () => {
    const { sim, squad, members } = battle()
    const german = spawnSoldier(sim, { side: Side.German, x: 150, z: 180 })
    sim.soldiers.stance.value[members[0] ?? -1] = Stance.Prone
    sim.soldiers.mask.state[members[0] ?? -1] = MaskState.On
    sim.soldiers.health.value[members[0] ?? -1] = 0.5
    sim.pendingCommands.push({ type: "kill", soldier: members[2] ?? -1 })
    stepSimulation(sim)
    surrender(sim, german)
    const model = hudModel(sim, squad)

    expect(model.soldier).toEqual({
      alive: true,
      stance: "Lying down",
      mask: "Gas mask on",
      grenades: "Grenades 3 of 3",
      pinned: false,
      wounded: true
    })
    expect(model.squad).toBe("Squad 2 of 3")
    expect(model.objectives).toEqual([{ name: "Crossroads", holder: "No one", contested: false }])
    expect(model.losses).toEqual([
      { side: "French", killed: 1, captured: 0 },
      { side: "Germans", killed: 0, captured: 1 }
    ])
  })

  it("says so when the soldier in control has fallen, or is down a dugout or pulling on a mask", () => {
    const { sim, squad, members } = battle()
    sim.soldiers.stance.value[members[0] ?? -1] = Stance.Sheltering
    sim.soldiers.mask.state[members[0] ?? -1] = MaskState.Donning
    expect(hudModel(sim, squad).soldier.stance).toBe("In a dugout")
    expect(hudModel(sim, squad).soldier.mask).toBe("Pulling on gas mask")

    for (const member of members) {
      sim.pendingCommands.push({ type: "kill", soldier: member })
    }
    stepSimulation(sim)
    expect(hudModel(sim, squad).soldier).toEqual({
      alive: false,
      stance: "Fallen",
      mask: null,
      grenades: "",
      pinned: false,
      wounded: false
    })
  })
})

describe("createBattleLog", () => {
  it("reports changes of hands, counter-attacks, prisoners and surrenders from our side's point of view", () => {
    const { sim, squad } = battle()
    const log = createBattleLog(sim, squad, TICK_RATE)
    const german = spawnSoldier(sim, { side: Side.German, x: 150, z: 180 })
    const french = spawnSoldier(sim, { side: Side.French, x: 100, z: 20 })
    const events: SimEvent[] = [
      { type: "objective-taken", name: "Crossroads", side: Side.German },
      { type: "counter-attack", side: Side.German },
      { type: "counter-attack", side: Side.French },
      { type: "capture", soldier: german },
      { type: "capture", soldier: french },
      {
        type: "shot",
        shooter: german,
        target: french,
        hit: false,
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 0 }
      }
    ]
    log.record(events)

    expect(log.messages.map((message) => [message.text, message.alarm])).toEqual([
      ["Crossroads taken by the Germans", true],
      ["The enemy is shelling the lost trench: counter-attack coming", true],
      ["Counter-attack ordered", false],
      ["1 prisoner taken", false],
      ["1 of ours surrendered", true]
    ])
  })

  it("raises the gas alarm once when the squad starts masking, and keeps only recent messages", () => {
    const { sim, squad, members } = battle()
    const log = createBattleLog(sim, squad, TICK_RATE)
    sim.soldiers.mask.state[members[1] ?? -1] = MaskState.Donning
    log.record([])
    log.record([])
    expect(log.messages.map((message) => message.text)).toEqual(["Gas! Masks on"])

    for (const member of members) {
      sim.soldiers.mask.state[member] = MaskState.Off
    }
    log.record([])
    for (let index = 0; index < LOG_LENGTH + 2; index++) {
      log.record([{ type: "objective-taken", name: `Point ${index}`, side: Side.French }])
    }
    expect(log.messages).toHaveLength(LOG_LENGTH)
    expect(log.messages.at(-1)?.text).toBe(`Point ${LOG_LENGTH + 1} taken by the French`)

    sim.tick += 21 * TICK_RATE
    log.record([])
    expect(log.messages).toHaveLength(0)
  })
})
