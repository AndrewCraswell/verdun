import { createFlatMap, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import { gunCrewSystem, TAKE_UP_SECONDS } from "./gun-crews.ts"
import {
  createSimulation,
  type SimEvent,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { createSquad } from "./squads.ts"
import { casualty } from "./wounds.ts"

function field(): Simulation {
  return createSimulation({
    map: createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass),
    seed: 1
  })
}

function stepFor(sim: Simulation, seconds: number): SimEvent[] {
  const events: SimEvent[] = []
  for (let step = 0; step < seconds * TICK_RATE; step++) {
    stepSimulation(sim)
    events.push(...sim.events)
  }
  return events
}

/** A gun team holding a line: the gunner in the middle, a rifleman 3 m away and another 30 m off. */
function gunTeam(sim: Simulation) {
  const gunner = spawnSoldier(sim, { side: Side.French, x: 50, z: 50, weapon: Weapon.MachineGun })
  const near = spawnSoldier(sim, { side: Side.French, x: 53, z: 50 })
  const far = spawnSoldier(sim, { side: Side.French, x: 80, z: 50 })
  const squad = createSquad(sim, Side.French, [near, gunner, far])
  return { gunner, near, far, squad }
}

describe("gun crews", () => {
  it("send the nearest squadmate to a fallen gunner's gun, and have it firing again a few seconds after he reaches it", () => {
    const sim = field()
    const { gunner, near, far, squad } = gunTeam(sim)
    casualty(sim, gunner, 1)
    gunCrewSystem(sim)

    expect(sim.soldiers.weapon.kind[near]).toBe(Weapon.Rifle)
    const events = stepFor(sim, 3 + TAKE_UP_SECONDS)
    expect(events).toContainEqual({ type: "gun-manned", squad: squad.id, soldier: near })
    expect(sim.soldiers.weapon.kind[near]).toBe(Weapon.MachineGun)
    expect(sim.soldiers.weapon.kind[gunner]).toBe(Weapon.Rifle)
    expect(sim.soldiers.weapon.kind[far]).toBe(Weapon.Rifle)
    expect(Math.abs(sim.soldiers.position.x[near] - 50)).toBeLessThan(1.6)
  })

  it("leave the gun silent when nobody of the squad is within reach", () => {
    const sim = field()
    const gunner = spawnSoldier(sim, { side: Side.French, x: 50, z: 50, weapon: Weapon.MachineGun })
    const far = spawnSoldier(sim, { side: Side.French, x: 90, z: 50 })
    createSquad(sim, Side.French, [gunner, far])
    casualty(sim, gunner, 1)
    gunCrewSystem(sim)

    const events = stepFor(sim, 20)
    expect(events.some((event) => event.type === "gun-manned")).toBe(false)
    expect(sim.soldiers.weapon.kind[far]).toBe(Weapon.Rifle)
  })
})

describe("gun crews at the edges", () => {
  it("leave a gun with no squad, pass over a second gunner, and give up if the crewman falls on the way", () => {
    const sim = field()
    const loner = spawnSoldier(sim, { side: Side.French, x: 20, z: 20, weapon: Weapon.MachineGun })
    casualty(sim, loner, 1)
    gunCrewSystem(sim)
    expect(sim.gunCrews.pickups).toEqual([])

    const gunner = spawnSoldier(sim, { side: Side.French, x: 50, z: 50, weapon: Weapon.MachineGun })
    const second = spawnSoldier(sim, { side: Side.French, x: 51, z: 50, weapon: Weapon.MachineGun })
    const rifleman = spawnSoldier(sim, { side: Side.French, x: 58, z: 50 })
    createSquad(sim, Side.French, [gunner, second, rifleman])
    casualty(sim, gunner, 1)
    gunCrewSystem(sim)
    expect(sim.gunCrews.pickups.map((pickup) => pickup.by)).toEqual([rifleman])

    sim.pendingCommands.push({ type: "kill", soldier: rifleman })
    stepFor(sim, 1)
    expect(sim.gunCrews.pickups).toEqual([])
  })
})
