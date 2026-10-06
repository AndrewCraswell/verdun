import { carveTrenches, createFlatMap, heightAt, Surface, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { Side, Stance } from "./components.ts"
import type { LineOfSight } from "./line-of-sight.ts"
import { createLineOfSight } from "./physics-sight.ts"
import {
  createSimulation,
  enqueueCommand,
  type SimEvent,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { createSquad, orderRefusal, type SquadOrder, withdrawPoint } from "./squads.ts"

const opened: LineOfSight[] = []
afterEach(() => {
  for (const lineOfSight of opened.splice(0)) {
    lineOfSight.dispose()
  }
})

/** A French fire trench along z = 30, facing north. */
const trench: Trench = {
  kind: "fire",
  points: [
    [20, 30],
    [180, 30]
  ],
  facing: "north"
}

function field(withTrench = true): Simulation {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
  const trenches = withTrench ? [trench] : []
  carveTrenches(map, trenches)
  return createSimulation({ map: { ...map, trenches }, seed: 1 })
}

/** A French squad of six in a row at z, 3 m apart from x = 80. */
function squadAt(sim: Simulation, z: number) {
  const members = Array.from({ length: 6 }, (_, index) =>
    spawnSoldier(sim, { side: Side.French, x: 80 + index * 3, z })
  )
  return { squad: createSquad(sim, Side.French, members), members }
}

function stepFor(sim: Simulation, seconds: number): SimEvent[] {
  const events: SimEvent[] = []
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
    events.push(...sim.events)
  }
  return events
}

function order(sim: Simulation, squad: number, given: SquadOrder) {
  enqueueCommand(sim, { type: "squad-order", squad, order: given })
}

const meanZ = (sim: Simulation, members: readonly number[]) =>
  members.reduce((sum, member) => sum + sim.soldiers.position.z[member], 0) / members.length

describe("run-to", () => {
  it("gets the squad there faster than an advance", () => {
    const walking = field(false)
    const running = field(false)
    const walkers = squadAt(walking, 50)
    const runners = squadAt(running, 50)
    order(walking, walkers.squad.id, { kind: "advance", x: 88, z: 150 })
    order(running, runners.squad.id, { kind: "run-to", x: 88, z: 150 })
    stepFor(walking, 10)
    stepFor(running, 10)

    expect(meanZ(running, runners.members)).toBeGreaterThan(meanZ(walking, walkers.members) + 5)
  })
})

describe("advance by the trenches", () => {
  /** A trench in a U: up from (40, 30) to z = 80, across to x = 120, and back down to (120, 30). */
  const loop: Trench = {
    kind: "communication",
    points: [
      [40, 30],
      [40, 80],
      [120, 80],
      [120, 30]
    ],
    facing: null
  }

  function inLoop(trench: boolean) {
    const map = createFlatMap({ name: "loop", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
    carveTrenches(map, [loop])
    const sim = createSimulation({ map: { ...map, trenches: [loop] }, seed: 1 })
    const members = [32, 35, 38, 41].map((z) => spawnSoldier(sim, { side: Side.French, x: 40, z }))
    const squad = createSquad(sim, Side.French, members)
    order(sim, squad.id, { kind: "advance", x: 120, z: 36, trench })
    let outside = 0
    for (let second = 0; second < 240; second++) {
      stepFor(sim, 1)
      const { x, z } = sim.soldiers.position
      // Down in it: the field lies at 5 m, and a trench's floor a man's height and more below.
      outside += members.filter((member) => heightAt(sim.map, x[member], z[member]) > 4).length
    }
    const arrived = members.every((member) => Math.abs(sim.soldiers.position.x[member] - 120) < 3)
    return { outside, arrived }
  }

  it("files the long way round below the parapet, where an advance cuts across the open", () => {
    const filed = inLoop(true)
    const crossed = inLoop(false)

    expect(filed.arrived).toBe(true)
    // A man-second or two each on the wall where the U turns its inner corner, against minutes up in the open.
    expect(filed.outside).toBeLessThan(10)
    expect(crossed.outside).toBeGreaterThan(200)
  })
})

describe("withdraw", () => {
  it("finds a trench of theirs behind the squad, and falls back to it", () => {
    const sim = field()
    const { squad, members } = squadAt(sim, 70)
    const point = withdrawPoint(sim, squad)

    expect(point?.z).toBe(30)
    expect(orderRefusal(sim, squad, "withdraw")).toBeNull()
    order(sim, squad.id, { kind: "withdraw", x: point?.x ?? 0, z: point?.z ?? 0 })
    stepFor(sim, 30)
    expect(Math.abs(meanZ(sim, members) - 30)).toBeLessThan(3)
  })

  it("has nowhere to go without a trench of theirs behind it", () => {
    const sim = field()
    const { squad } = squadAt(sim, 20)

    expect(withdrawPoint(sim, squad)).toBeNull()
    expect(orderRefusal(sim, squad, "withdraw")).toBe("No trench of ours behind them")
  })
})

describe("suppress", () => {
  it("fires into the area whether or not anyone is seen there, and keeps down an enemy in it", async () => {
    const sim = field(false)
    const lineOfSight = await createLineOfSight(sim.map)
    opened.push(lineOfSight)
    sim.lineOfSight = lineOfSight
    const { squad } = squadAt(sim, 50)
    order(sim, squad.id, { kind: "suppress", x: 88, z: 150 })
    const events = stepFor(sim, 8)
    const area = events.filter((event) => event.type === "shot" && event.target === -1)

    expect(area.length).toBeGreaterThan(3)
    expect(area.every((event) => event.type === "shot" && Math.abs(event.to.z - 150) < 0.01)).toBe(true)
    // Out of range or out of sight, nobody fires.
    order(sim, squad.id, { kind: "suppress", x: 88, z: 1000 })
    stepFor(sim, 0.1)
    const none = stepFor(sim, 8).filter((event) => event.type === "shot")
    expect(none).toHaveLength(0)
  })
})

describe("suppress, with men in the area", () => {
  it("keeps down the enemy there and leaves friends alone", async () => {
    const sim = field(false)
    const lineOfSight = await createLineOfSight(sim.map)
    opened.push(lineOfSight)
    sim.lineOfSight = lineOfSight
    const { squad } = squadAt(sim, 50)
    const enemy = spawnSoldier(sim, { side: Side.German, x: 88, z: 150 })
    const friend = spawnSoldier(sim, { side: Side.French, x: 92, z: 150 })
    order(sim, squad.id, { kind: "suppress", x: 90, z: 150 })
    // Before anyone has looked round for a target to aim at.
    stepFor(sim, 0.3)

    expect(sim.soldiers.suppression.value[enemy]).toBeGreaterThan(0)
    expect(sim.soldiers.suppression.value[friend]).toBe(0)
  })
})

describe("dig-in", () => {
  it("goes to cover around the point and keeps low there, in a trench crouched below the parapet", () => {
    const sim = field()
    const { squad, members } = squadAt(sim, 31)
    order(sim, squad.id, { kind: "dig-in", x: 88, z: 31 })
    stepFor(sim, 15)

    expect(members.every((member) => sim.soldiers.stance.value[member] === Stance.Crouching)).toBe(true)
  })
})

describe("rally", () => {
  it("closes the squad up on its leader and steadies the shaken near him faster", () => {
    const sim = field(false)
    const control = field(false)
    const { squad, members } = squadAt(sim, 50)
    const others = squadAt(control, 50)
    const [, shaken = -1] = members
    const [, alsoShaken = -1] = others.members
    sim.soldiers.morale.value[shaken] = 0.1
    control.soldiers.morale.value[alsoShaken] = 0.1

    expect(orderRefusal(sim, squad, "rally")).toBeNull()
    order(sim, squad.id, { kind: "rally" })
    stepFor(sim, 5)
    stepFor(control, 5)
    expect(sim.soldiers.morale.value[shaken]).toBeGreaterThan(control.soldiers.morale.value[alsoShaken] + 0.5)
    const leader = squad.leader
    const near = members.every(
      (member) =>
        Math.hypot(
          sim.soldiers.position.x[member] - sim.soldiers.position.x[leader],
          sim.soldiers.position.z[member] - sim.soldiers.position.z[leader]
        ) < 12
    )
    expect(near).toBe(true)
  })

  it("is refused with nobody shaken, and every order with nobody left", () => {
    const sim = field(false)
    const { squad, members } = squadAt(sim, 50)

    expect(orderRefusal(sim, squad, "rally")).toBe("Nobody is shaken")
    for (const member of members) {
      enqueueCommand(sim, { type: "kill", soldier: member })
    }
    stepFor(sim, 0.1)
    expect(orderRefusal(sim, squad, "advance")).toBe("Nobody left")
    expect(withdrawPoint(sim, squad)).toBeNull()
  })
})
