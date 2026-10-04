import { carveTrenches, createFlatMap, type Trench } from "@verdun/map"
import { addComponent } from "bitecs"
import { describe, expect, it } from "vitest"
import { Side } from "./components.ts"
import { clockAt } from "./environment.ts"
import { allotReinforcements } from "./reinforcements.ts"
import {
  capturedIds,
  createSimulation,
  evacuatedIds,
  fallenIds,
  type SimEvent,
  type Simulation,
  soldierIds,
  spawnSoldier,
  stepSimulation,
  TICK_RATE,
  woundedIds
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { AID_POST_PLACES, aidPost, BEARER_TEAMS, casualty, KILLED_OUTRIGHT } from "./wounds.ts"

const NOON = Date.UTC(1916, 5, 30, 11)
/** A moonless night: 30 June 1916, 23:00 UTC. */
const MOONLESS = Date.UTC(1916, 5, 30, 23)

/**
 * A 200 m by 300 m sector: the French front line at z = 50 and support line at z = 20, joined by a communication trench
 * at x = 100, and the German front line at z = 250.
 */
function sector(utc = NOON, seed = 1): Simulation {
  const trenches: Trench[] = [
    {
      kind: "fire",
      points: [
        [20, 50],
        [180, 50]
      ],
      facing: "north"
    },
    {
      kind: "fire",
      points: [
        [20, 20],
        [60, 20],
        [100, 20],
        [140, 20],
        [180, 20]
      ],
      facing: "north"
    },
    {
      kind: "communication",
      points: [
        [100, 20],
        [100, 50]
      ],
      facing: null
    },
    {
      kind: "fire",
      points: [
        [20, 250],
        [180, 250]
      ],
      facing: "south"
    }
  ]
  const map = { ...createFlatMap({ name: "sector", cellSize: 0.5, columns: 400, rows: 600 }), trenches }
  carveTrenches(map, trenches)
  return createSimulation({ map, seed, wind: { x: 0, z: 0 }, environment: clockAt(utc) })
}

function woundedAt(sim: Simulation, x: number, z: number, side = Side.French): number {
  const soldier = spawnSoldier(sim, { side, x, z })
  casualty(sim, soldier, 0)
  return soldier
}

/** Steps on for some seconds, gathering the events. */
function run(sim: Simulation, seconds: number): SimEvent[] {
  const events: SimEvent[] = []
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
    events.push(...sim.events)
  }
  return events
}

const count = (events: readonly SimEvent[], type: SimEvent["type"]) =>
  events.filter((event) => event.type === type).length

describe("casualties", () => {
  it("kills some outright and leaves the rest lying wounded, out of the fight", () => {
    const sim = sector()
    const killed = spawnSoldier(sim, { side: Side.French, x: 60, z: 150 })
    const wounded = spawnSoldier(sim, { side: Side.French, x: 70, z: 150 })
    casualty(sim, killed, 1)
    casualty(sim, wounded, 0)
    casualty(sim, wounded, 0)

    expect(soldierIds(sim)).toEqual([])
    expect(fallenIds(sim)).toEqual([killed, wounded])
    expect(woundedIds(sim)).toEqual([wounded])
    expect(sim.events.filter((event) => event.type === "wounded")).toEqual([{ type: "wounded", soldier: wounded }])
    expect(KILLED_OUTRIGHT.shell).toBeLessThan(0.5)
  })
})

describe("aid posts", () => {
  it("stand in the support line where the communication trench joins it, or in the front line when there's no other", () => {
    const sim = sector()
    expect(aidPost(sim.map, Side.French)).toEqual({ x: 100, z: 20 })
    expect(aidPost(sim.map, Side.German).z).toBe(250)

    const bare = createSimulation({
      map: createFlatMap({ name: "bare", cellSize: 1, columns: 100, rows: 200 }),
      seed: 1
    })
    expect(aidPost(bare.map, Side.French)).toEqual({ x: 50, z: 20 })
    expect(aidPost(bare.map, Side.German)).toEqual({ x: 50, z: 180 })
  })
})

describe("stretcher-bearers", () => {
  it("carry a man wounded in the trench to the aid post by day, taking the walk there and back", () => {
    const sim = sector()
    const soldier = woundedAt(sim, 60, 50)
    // 50 m from the aid post: 100 m of walking at 0.9 m/s, and a minute to lift him.
    const early = run(sim, 160)
    expect(count(early, "arrived-at-aid-post")).toBe(0)

    const events = run(sim, 20)
    expect(events).toContainEqual({ type: "arrived-at-aid-post", soldier })
    expect(woundedIds(sim)).toEqual([])
    expect(fallenIds(sim)).toEqual([])
  })

  it("leave men lying in the open until dark", () => {
    const day = sector(NOON)
    woundedAt(day, 60, 150)
    expect(count(run(day, 400), "arrived-at-aid-post")).toBe(0)

    const night = sector(MOONLESS)
    woundedAt(night, 60, 150)
    expect(count(run(night, 400), "arrived-at-aid-post")).toBe(1)
  })

  it("send only as many teams as the side has", () => {
    const sim = sector()
    for (let index = 0; index < BEARER_TEAMS + 3; index++) {
      woundedAt(sim, 30 + index * 5, 50)
    }
    run(sim, 1)

    const sent = woundedIds(sim).filter((soldier) => sim.soldiers.casualty.evacuateAt[soldier] >= 0)
    expect(sent).toHaveLength(BEARER_TEAMS)
  })

  it("can't reach a man the enemy has overrun: he's taken prisoner", () => {
    const sim = sector()
    const soldier = woundedAt(sim, 60, 150)
    spawnSoldier(sim, { side: Side.German, x: 62, z: 150 })
    const events = run(sim, 1)

    expect(events).toContainEqual({ type: "capture", soldier })
    expect(capturedIds(sim)).toContain(soldier)
    expect(woundedIds(sim)).toEqual([])
  })
})

describe("the wounded", () => {
  it("die slowly where they lie when no one comes", () => {
    const sim = sector(NOON, 3)
    for (let index = 0; index < 50; index++) {
      woundedAt(sim, 30 + index * 2, 150)
    }
    const died = count(run(sim, 30 * 60), "died-of-wounds")

    // About 1% a minute: some 13 of 50 in half an hour.
    expect(died).toBeGreaterThan(4)
    expect(died).toBeLessThan(25)
    expect(woundedIds(sim)).toHaveLength(50 - died)
  })

  it("are triaged at the aid post: about four in ten patched up and back to the reserves, one in ten dies", () => {
    const sim = sector(NOON, 5)
    allotReinforcements(sim, Side.French, 0)
    const men = 60
    for (let index = 0; index < men; index++) {
      woundedAt(sim, 95 + (index % 10), 20.5)
    }
    const events = run(sim, 3000)
    const returned = count(events, "returned-to-duty")

    expect(count(events, "arrived-at-aid-post")).toBeGreaterThan(men - 10)
    expect(returned).toBeGreaterThan(14)
    expect(returned).toBeLessThan(36)
    expect(count(events, "died-of-wounds")).toBeGreaterThan(1)
    expect(sim.reinforcements.pool[Side.French]).toBe(returned)
    expect(evacuatedIds(sim).length).toBeGreaterThan(returned)
  })

  it("are treated more slowly when more come in than the aid post has places for", () => {
    const inTreatment = (patients: number) => {
      const sim = sector()
      for (let index = 0; index < patients; index++) {
        const soldier = spawnSoldier(sim, { side: Side.French, x: 100, z: 20 })
        addComponent(sim.world, soldier, sim.soldiers.dead)
        addComponent(sim.world, soldier, sim.soldiers.evacuated)
        sim.soldiers.casualty.treatment[soldier] = 0
      }
      return sim
    }
    const quiet = inTreatment(AID_POST_PLACES / 2)
    expect(count(run(quiet, 601), "returned-to-duty")).toBe(AID_POST_PLACES / 2)

    // Twice as many men as places: each gets half the care, and needs twice as long.
    const swamped = inTreatment(AID_POST_PLACES * 2)
    expect(count(run(swamped, 601), "returned-to-duty")).toBe(0)
    expect(count(run(swamped, 600), "returned-to-duty")).toBe(AID_POST_PLACES * 2)
  })

  it("resume exactly from a snapshot", () => {
    const sim = sector(NOON, 2)
    woundedAt(sim, 60, 50)
    woundedAt(sim, 60, 150)
    run(sim, 200)
    // Through a save file and back.
    const file = JSON.stringify(takeSnapshot(sim))
    const restored = restoreSimulation(sim.map, JSON.parse(file))
    run(sim, 30)
    run(restored, 30)

    expect(takeSnapshot(restored)).toEqual(takeSnapshot(sim))
  })
})
