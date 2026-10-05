import { beltLayout, carveTrenches, createFlatMap, heightAt, type Scenery, Surface, type Trench } from "@verdun/map"
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

// Firm ground, so soldiers walk at their full pace.
const map = createFlatMap({ name: "test", cellSize: 1, columns: 200, rows: 200 }, 0, Surface.Grass)

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

describe("squad-controller", () => {
  it("hands a squad to a player, and back to its own orders when they leave", () => {
    const { sim, squad, members } = squadOfEight()
    enqueueCommand(sim, { type: "squad-controller", squad: squad.id, controller: "player" })
    enqueueCommand(sim, { type: "steer", soldier: members[0]!, x: 1, z: 0 })
    stepSimulation(sim)
    expect(squad.controller).toBe("player")

    enqueueCommand(sim, { type: "squad-controller", squad: squad.id, controller: "ai" })
    stepSimulation(sim)
    expect(squad.controller).toBe("ai")
    // The leader stops where the player had them going.
    expect(hasComponent(sim.world, members[0]!, sim.soldiers.steer)).toBe(false)
  })

  it("ignores unknown squads", () => {
    const { sim, squad } = squadOfEight()
    enqueueCommand(sim, { type: "squad-controller", squad: 7, controller: "player" })
    stepSimulation(sim)

    expect(squad.controller).toBe("ai")
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

describe("advancing under fire", () => {
  it("goes by bounds: half dash on while the other half go to ground, then they change about", () => {
    const { sim, squad, members } = squadOfEight()
    squad.order = { kind: "advance", x: 90, z: 150 }
    /** Steps on with the squad kept under fire. */
    const underFire = (seconds: number) => {
      for (let step = 0; step < seconds * TICK_RATE; step++) {
        for (const member of members) {
          sim.soldiers.suppression.value[member] = 0.4
        }
        stepSimulation(sim)
      }
    }
    const dashing = () =>
      members.filter(
        (member) => hasComponent(sim.world, member, sim.soldiers.moveOrder) && sim.soldiers.moveOrder.run[member] === 1
      )
    underFire(1)
    const first = dashing()

    expect(first.length).toBeGreaterThanOrEqual(3)
    expect(first.length).toBeLessThanOrEqual(5)
    // A bound on, the other half go.
    underFire(8)
    const second = dashing()
    expect(second.length).toBeGreaterThanOrEqual(3)
    expect(second.some((member) => first.includes(member))).toBe(false)
  })

  it("advances all together when no one is shooting at the squad", () => {
    const { sim, squad, members } = squadOfEight()
    squad.order = { kind: "advance", x: 90, z: 150 }
    stepFor(sim, 1)

    expect(members.filter((member) => hasComponent(sim.world, member, sim.soldiers.moveOrder)).length).toBe(8)
  })
})

describe("moving like men in a trench", () => {
  it("files along a trench behind the leader, on its floor, and lines the fire step when he stands on it", () => {
    const ground = createFlatMap({ name: "field", cellSize: 0.5, columns: 300, rows: 200 }, 5, Surface.Grass)
    const trench: Trench = {
      kind: "fire",
      points: [
        [10, 50],
        [140, 50]
      ],
      facing: "north"
    }
    carveTrenches(ground, [trench])
    const sim = createSimulation({ map: { ...ground, trenches: [trench] }, seed: 1 })
    const members = Array.from({ length: 8 }, (_, index) =>
      spawnSoldier(sim, { side: Side.French, x: 60 - index * 1.5, z: 49.6 })
    )
    const squad = createSquad(sim, Side.French, members, "player")
    const [leader] = members
    enqueueCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "follow" } })
    enqueueCommand(sim, { type: "steer", soldier: leader!, x: 1, z: 0 })
    // Turning to look out over the parapet as he goes doesn't send anyone up it.
    enqueueCommand(sim, { type: "face", soldier: leader!, x: 0, z: 1 })
    const floor = (member: number) =>
      heightAt(sim.map, sim.soldiers.position.x[member], sim.soldiers.position.z[member]) - 5
    for (let second = 0; second < 20; second++) {
      stepFor(sim, 1)
      for (const member of members.slice(1)) {
        expect(floor(member)).toBeLessThan(-0.8)
      }
    }
    enqueueCommand(sim, { type: "steer", soldier: leader!, x: 0, z: 0 })
    stepFor(sim, 10)
    for (const member of members.slice(1)) {
      expect(floor(member)).toBeCloseTo(-1.9, 1)
      // Behind him, a man every couple of metres.
      expect(sim.soldiers.position.x[member]).toBeLessThan(sim.soldiers.position.x[leader!])
      expect(distance(sim, member, leader!)).toBeLessThan(16)
    }

    // Up onto the fire step: the file follows him up.
    enqueueCommand(sim, { type: "steer", soldier: leader!, x: 0, z: 1 })
    for (let step = 0; step < 6 * TICK_RATE && floor(leader!) < -0.86; step++) {
      stepSimulation(sim)
    }
    enqueueCommand(sim, { type: "steer", soldier: leader!, x: 0, z: 0 })
    stepSimulation(sim)
    expect(floor(leader!)).toBeCloseTo(-0.85, 1)
    stepFor(sim, 15)
    expect(members.slice(1).filter((member) => Math.abs(floor(member) + 0.85) < 0.1).length).toBeGreaterThanOrEqual(5)
  })

  it("climbs a bare stretch of a wire fence his route would have him wade, as a player does", () => {
    const belt = {
      points: [
        [0, 100],
        [200, 100]
      ] as [number, number][]
    }
    const { fences, tangles } = beltLayout(belt)
    const bare = fences.find((fence) => !tangles.some((tangle) => Math.abs(tangle.x - fence.x) < 4))
    const sim = createSimulation({ map: { ...map, wire: [belt] }, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: bare?.x ?? 0, z: 95 })
    const squad = createSquad(sim, Side.French, [soldier], "ai")
    // No gap anywhere: the route goes through the belt.
    enqueueCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "advance", x: bare?.x ?? 0, z: 110 } })
    let climbed = false
    for (let step = 0; step < 15 * TICK_RATE; step++) {
      stepSimulation(sim)
      climbed ||= hasComponent(sim.world, soldier, sim.soldiers.vault)
    }
    expect(climbed).toBe(true)
    // Wading a belt goes at a twentieth of walking pace: this is over it and nearly there in 15 s.
    expect(sim.soldiers.position.z[soldier]).toBeGreaterThan(106)
  })

  it("keeps a squad sent past a ruin out of it, and gets them there", () => {
    const ruin: Scenery = { kind: "ruin", x: 100, z: 80, heading: 0, variant: 0, scale: 1 }
    const sim = createSimulation({ map: { ...map, scenery: [ruin] }, seed: 1 })
    const members = Array.from({ length: 8 }, (_, index) =>
      spawnSoldier(sim, { side: Side.French, x: 92 + index * 2, z: 60 })
    )
    const squad = createSquad(sim, Side.French, members)
    enqueueCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "advance", x: 100, z: 100 } })
    for (let step = 0; step < 40 * TICK_RATE; step++) {
      stepSimulation(sim)
      for (const member of members) {
        const dx = sim.soldiers.position.x[member] - 100
        const dz = sim.soldiers.position.z[member] - 80
        expect(dx * dx + dz * dz).toBeGreaterThan(4 * 4)
      }
    }
    for (const member of members) {
      expect(sim.soldiers.position.z[member]).toBeGreaterThan(97)
    }
  })
})
