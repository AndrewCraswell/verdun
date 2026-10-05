import { createFlatMap } from "@verdun/map"
import {
  createSimulation,
  createSquad,
  createSyncSource,
  enqueueCommand,
  Shell,
  Side,
  type SimEvent,
  spawnSoldier,
  stepSimulation
} from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { sideState, sideSteps } from "./side-view.ts"

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** A field of the state as sent, which must be a record. */
function recordOf(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TypeError("Not a record")
  }
  return value
}

const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

/** A French and a German squad, each side's guns firing, the Germans advancing, and a gun of each spotted or not. */
function battle() {
  const sim = createSimulation({
    map: createFlatMap({ name: "field", cellSize: 1, columns: 200, rows: 200 }),
    seed: 1,
    reinforcements: { [Side.French]: 20, [Side.German]: 30 }
  })
  const french = [spawnSoldier(sim, { side: Side.French, x: 50, z: 40 })]
  const german = [spawnSoldier(sim, { side: Side.German, x: 50, z: 160 })]
  createSquad(sim, Side.French, french)
  createSquad(sim, Side.German, german)
  const barrage = { shell: Shell.FieldHighExplosive, fromX: 20, toX: 80, band: 10, roundsPerMinute: 60, duration: 30 }
  enqueueCommand(sim, { type: "fire-mission", plan: { ...barrage, side: Side.French, z: 150, delay: 0 } })
  enqueueCommand(sim, { type: "fire-mission", plan: { ...barrage, side: Side.German, z: 50, delay: 40 } })
  enqueueCommand(sim, { type: "squad-order", squad: 1, order: { kind: "advance", x: 50, z: 60 } })
  stepSimulation(sim)
  sim.spotting.sightings.push(
    {
      soldier: french[0] ?? -1,
      side: Side.French,
      x: 50,
      z: 40,
      lastFired: 0,
      spotted: false,
      seen: false,
      checkedAt: 0,
      shelledAt: 0
    },
    {
      soldier: german[0] ?? -1,
      side: Side.German,
      x: 50,
      z: 160,
      lastFired: 0,
      spotted: false,
      seen: false,
      checkedAt: 0,
      shelledAt: 0
    }
  )
  sim.defence.alarmedAt[Side.German] = 5
  return { sim, french, german }
}

describe("what a side is told of the battle", () => {
  it("leaves out the enemy's plans, reserves and unspotted guns, and keeps its own", () => {
    const { sim, french, german } = battle()
    const sideOf = (soldier: number) => sim.soldiers.side.value[soldier]
    const state = createSyncSource(sim).take().state
    const french0 = french[0] ?? -1
    const german0 = german[0] ?? -1

    const told = sideState(state, Side.French, sideOf)
    const squads = listOf(told["squads"]).map(recordOf)
    expect(squads[0]?.["order"]).toEqual(sim.squads[0]?.order)
    expect(squads[1]?.["order"]).toEqual({ kind: "hold" })
    expect(squads[1]?.["controller"]).toBe("ai")
    const artillery = recordOf(told["artillery"])
    expect(listOf(artillery["missions"]).map((mission) => recordOf(mission)["side"])).toEqual([Side.French])
    expect(recordOf(artillery["ammunition"])[Side.German]).toEqual(sim.artillery.ammunition[Side.German].map(() => 0))
    expect(listOf(artillery["shells"]).length).toBe(sim.artillery.shells.length)
    expect(recordOf(recordOf(told["reinforcements"])["pool"])).toEqual({ [Side.French]: 20, [Side.German]: 0 })
    expect(recordOf(recordOf(told["defence"])["alarmedAt"])[Side.German]).toBe(-1)
    // Its own gun, which it knows of, but not the enemy's until it's placed.
    const sightings = () => listOf(recordOf(sideState(state, Side.French, sideOf)["spotting"])["sightings"])
    expect(sightings().map((sighting) => recordOf(sighting)["soldier"])).toEqual([french0])
    const spotting = recordOf(state["spotting"])
    const enemyGun = recordOf(listOf(spotting["sightings"])[1])
    enemyGun["spotted"] = true
    expect(sightings().map((sighting) => recordOf(sighting)["soldier"])).toEqual([french0, german0])
    // The state itself is left as it was.
    expect(listOf(recordOf(state["artillery"])["missions"]).length).toBe(2)
  })

  it("tells a side only of its own gun crews and reinforcements coming, and leaves alone what it doesn't know", () => {
    const sideOf = (soldier: number) => (soldier < 10 ? Side.French : Side.German)
    const state = {
      squads: [{ id: 0, side: Side.French }, { id: 1, side: Side.German }, "a squad"],
      gunCrews: {
        pickups: [
          { gunner: 1, by: 2 },
          { gunner: 11, by: 12 }
        ]
      },
      reinforcements: { pool: 3, full: [], arrivals: [{ squad: 0 }, { squad: 1 }, "an arrival"] },
      artillery: { missions: "none", sosCalledAt: 0, ammunition: { [Side.French]: [1], [Side.German]: "plenty" } },
      commanders: null
    }
    const told = sideState(state, Side.German, sideOf)

    expect(recordOf(told["gunCrews"])["pickups"]).toEqual([{ gunner: 11, by: 12 }])
    expect(recordOf(told["reinforcements"])["arrivals"]).toEqual([{ squad: 1 }])
    expect(recordOf(told["reinforcements"])["pool"]).toBe(3)
    expect(listOf(told["squads"])[2]).toBe("a squad")
    expect(recordOf(told["artillery"])).toEqual({
      missions: "none",
      sosCalledAt: 0,
      ammunition: { [Side.French]: [0], [Side.German]: "plenty" }
    })
    expect(told["commanders"]).toBeNull()
    expect(sideState({ spotting: 1, defence: 2 }, Side.French, sideOf)).toEqual({
      squads: undefined,
      commanders: undefined,
      spotting: 1,
      defence: 2
    })
  })

  it("tells a side of the shots and bursts, what its own men and the enemy in sight did, and its own news", () => {
    const at = { x: 0, y: 0, z: 0 }
    const events: SimEvent[] = [
      { type: "shot", shooter: 5, target: 1, hit: false, from: at, to: at },
      { type: "burst", shell: Shell.FieldHighExplosive, at, crater: null },
      { type: "wounded", soldier: 1 },
      { type: "wounded", soldier: 5 },
      { type: "fallen", soldier: 6, killed: true, cause: { kind: "rifle", by: Side.French } },
      { type: "reserves-up", side: Side.French, squads: 2 },
      { type: "reserves-up", side: Side.German, squads: 2 }
    ]
    // The side knows its own man 1 and the enemy 6 it can see, not the enemy 5.
    const knows = (soldier: number) => soldier === 1 || soldier === 6
    const [step] = sideSteps([{ tick: 3, events }], Side.French, knows)

    expect(step?.tick).toBe(3)
    expect(step?.events.map((event) => event.type)).toEqual(["shot", "burst", "wounded", "fallen", "reserves-up"])
    expect(step?.events[4]).toEqual({ type: "reserves-up", side: Side.French, squads: 2 })
  })
})
