import { createFlatMap } from "@verdun/map"
import { hasComponent } from "bitecs"
import { describe, expect, it } from "vitest"
import { Side } from "./components.ts"
import {
  createSimulation,
  enqueueCommand,
  fallenIds,
  type Simulation,
  soldierIds,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { createSquad, isAlive, nextLivingMember } from "./squads.ts"

const map = createFlatMap({ name: "test", cellSize: 1, columns: 200, rows: 200 })

/** A French squad of eight in a row at z = 50, facing north, its first soldier leading. */
function squadOfEight() {
  const sim = createSimulation({ map, seed: 1 })
  const members = Array.from({ length: 8 }, (_, index) =>
    spawnSoldier(sim, { side: Side.French, x: 80 + index * 3, z: 50 })
  )
  const squad = createSquad(sim, Side.French, members)
  return { sim, squad, members }
}

function stepFor(sim: Simulation, seconds: number) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
  }
}

const distance = (sim: Simulation, a: number, b: number) =>
  Math.hypot(
    sim.soldiers.position.x[a] - sim.soldiers.position.x[b],
    sim.soldiers.position.z[a] - sim.soldiers.position.z[b]
  )

describe("createSquad", () => {
  it("records membership, leads with the first soldier and starts holding", () => {
    const { sim, squad, members } = squadOfEight()

    expect(squad.id).toBe(0)
    expect(sim.squads).toEqual([squad])
    expect(squad.leader).toBe(members[0])
    expect(squad.order).toEqual({ kind: "hold" })
    expect(members.every((member) => sim.soldiers.squad.id[member] === 0)).toBe(true)
  })
})

describe("squad orders", () => {
  it("holding keeps everyone where they are", () => {
    const { sim, members } = squadOfEight()
    const before = members.map((member) => sim.soldiers.position.x[member])
    stepFor(sim, 3)

    expect(members.map((member) => sim.soldiers.position.x[member])).toEqual(before)
  })

  it("follow keeps the squad in ranks behind the leader as they move", () => {
    const { sim, squad, members } = squadOfEight()
    const [leader] = members
    enqueueCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "follow" } })
    enqueueCommand(sim, { type: "steer", soldier: leader!, x: 0, z: 1 })
    stepFor(sim, 20)
    enqueueCommand(sim, { type: "steer", soldier: leader!, x: 0, z: 0 })
    stepFor(sim, 20)

    for (const member of members.slice(1)) {
      // Behind the leader (south, since they face north) and close by.
      expect(sim.soldiers.position.z[member]).toBeLessThan(sim.soldiers.position.z[leader!])
      expect(distance(sim, member, leader!)).toBeLessThan(12)
    }
    // Spread out, not bunched on one spot.
    expect(distance(sim, members[1]!, members[2]!)).toBeGreaterThan(2)
  })

  it("advance spreads an AI squad, leader and all, in a line across the target", () => {
    const { sim, squad, members } = squadOfEight()
    enqueueCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "advance", x: 90, z: 120 } })
    stepFor(sim, 80)

    for (const member of members) {
      expect(sim.soldiers.position.z[member]).toBeCloseTo(120)
    }
    const xs = members.map((member) => sim.soldiers.position.x[member])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(21)
  })

  it("advance leaves a player-controlled leader where the player steers them", () => {
    const sim = createSimulation({ map, seed: 1 })
    const members = Array.from({ length: 4 }, (_, index) =>
      spawnSoldier(sim, { side: Side.French, x: 80 + index * 3, z: 50 })
    )
    const squad = createSquad(sim, Side.French, members, "player")
    enqueueCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "advance", x: 90, z: 120 } })
    stepFor(sim, 80)

    expect(sim.soldiers.position.z[members[0]!]).toBe(50)
    expect(members.slice(1).every((member) => Math.abs(sim.soldiers.position.z[member] - 120) < 0.01)).toBe(true)
  })

  it("ignores orders for squads that don't exist", () => {
    const { sim } = squadOfEight()
    enqueueCommand(sim, { type: "squad-order", squad: 9, order: { kind: "follow" } })

    expect(() => stepSimulation(sim)).not.toThrow()
  })
})

describe("take-command", () => {
  it("hands leadership to another member, stopping the old leader and freeing the new one", () => {
    const { sim, squad, members } = squadOfEight()
    const [first, second] = members
    enqueueCommand(sim, { type: "steer", soldier: first!, x: 1, z: 0 })
    enqueueCommand(sim, { type: "move-to", soldier: second!, x: 10, z: 10 })
    stepSimulation(sim)
    enqueueCommand(sim, { type: "take-command", squad: squad.id, soldier: second! })
    stepSimulation(sim)

    expect(squad.leader).toBe(second)
    expect(hasComponent(sim.world, first!, sim.soldiers.steer)).toBe(false)
    expect(hasComponent(sim.world, second!, sim.soldiers.moveOrder)).toBe(false)
  })

  it("refuses soldiers outside the squad, the fallen, and unknown squads", () => {
    const { sim, squad, members } = squadOfEight()
    const outsider = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    enqueueCommand(sim, { type: "kill", soldier: members[3]! })
    enqueueCommand(sim, { type: "take-command", squad: squad.id, soldier: outsider })
    enqueueCommand(sim, { type: "take-command", squad: squad.id, soldier: members[3]! })
    enqueueCommand(sim, { type: "take-command", squad: 7, soldier: members[1]! })
    stepSimulation(sim)

    expect(squad.leader).toBe(members[0])
  })
})

describe("death", () => {
  it("leaves the fallen on the battlefield, out of the living and deaf to orders", () => {
    const { sim, members } = squadOfEight()
    const victim = members[4]!
    enqueueCommand(sim, { type: "steer", soldier: victim, x: 1, z: 0 })
    stepSimulation(sim)
    enqueueCommand(sim, { type: "kill", soldier: victim })
    enqueueCommand(sim, { type: "kill", soldier: victim })
    stepSimulation(sim)
    const where = sim.soldiers.position.x[victim]
    enqueueCommand(sim, { type: "move-to", soldier: victim, x: 0, z: 0 })
    stepFor(sim, 1)

    expect(isAlive(sim, victim)).toBe(false)
    expect(sim.soldiers.health.value[victim]).toBe(0)
    expect(Array.from(soldierIds(sim))).not.toContain(victim)
    expect(Array.from(fallenIds(sim))).toEqual([victim])
    expect(sim.soldiers.position.x[victim]).toBe(where)
  })

  it("passes leadership to the next living member when the leader falls, wrapping round", () => {
    const { sim, squad, members } = squadOfEight()
    enqueueCommand(sim, { type: "take-command", squad: squad.id, soldier: members[7]! })
    enqueueCommand(sim, { type: "kill", soldier: members[0]! })
    stepSimulation(sim)
    enqueueCommand(sim, { type: "kill", soldier: members[7]! })
    stepSimulation(sim)

    // After slot 8 comes slot 1, who has fallen, so slot 2.
    expect(squad.leader).toBe(members[1])
  })

  it("leaves the squad leaderless once everyone has fallen", () => {
    const { sim, squad, members } = squadOfEight()
    for (const member of members) {
      enqueueCommand(sim, { type: "kill", soldier: member })
    }
    stepSimulation(sim)

    expect(squad.leader).toBe(-1)
    expect(nextLivingMember(sim, squad, -1)).toBe(-1)
    expect(isAlive(sim, -1)).toBe(false)
  })
})

describe("snapshots with squads", () => {
  it("restore squads, orders, leaders and the fallen, then continue identically", () => {
    const { sim, squad, members } = squadOfEight()
    enqueueCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "follow" } })
    enqueueCommand(sim, { type: "kill", soldier: members[0]! })
    enqueueCommand(sim, { type: "steer", soldier: members[1]!, x: 0.5, z: 0.5 })
    stepFor(sim, 2)
    const file = JSON.stringify(takeSnapshot(sim))
    const restored = restoreSimulation(map, JSON.parse(file))

    expect(takeSnapshot(restored)).toEqual(takeSnapshot(sim))
    expect(restored.squads[0]?.leader).toBe(members[1])
    expect(restored.soldiers.squad.id[members[5]!]).toBe(0)
    stepFor(sim, 5)
    stepFor(restored, 5)
    expect(takeSnapshot(restored)).toEqual(takeSnapshot(sim))
  })
})
