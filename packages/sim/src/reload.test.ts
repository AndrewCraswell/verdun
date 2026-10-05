import { createFlatMap, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { fireAt, magazineOf, startReload, Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import {
  createSimulation,
  enqueueCommand,
  type SimEvent,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"

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

describe("magazines and reloading", () => {
  it("gives each side's weapons their own magazines: the Lebel's eight, the Gewehr's five, a strip and a belt", () => {
    const sim = field()
    const lebel = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const gewehr = spawnSoldier(sim, { side: Side.German, x: 20, z: 10 })
    const hotchkiss = spawnSoldier(sim, { side: Side.French, x: 30, z: 10, weapon: Weapon.MachineGun })
    const mg08 = spawnSoldier(sim, { side: Side.German, x: 40, z: 10, weapon: Weapon.MachineGun })

    expect([lebel, gewehr, hotchkiss, mg08].map((soldier) => sim.soldiers.weapon.rounds[soldier])).toEqual([
      8, 5, 24, 250
    ])
    expect(magazineOf(sim, gewehr).reload).toBeLessThan(magazineOf(sim, lebel).reload)
  })

  it("reloads once the magazine is empty, out of action for the reload's time, then full again", () => {
    const sim = field()
    const shooter = spawnSoldier(sim, { side: Side.German, x: 50, z: 50 })
    const target = spawnSoldier(sim, { side: Side.French, x: 50, z: 300 })
    const events: SimEvent[] = []
    for (let shot = 0; shot < 5; shot++) {
      sim.soldiers.weapon.cooldown[shooter] = 0
      fireAt(sim, shooter, target)
      events.push(...sim.events)
    }
    expect(sim.soldiers.weapon.rounds[shooter]).toBe(0)
    expect(sim.soldiers.weapon.reloading[shooter]).toBe(1)
    expect(events).toContainEqual({ type: "reloading", soldier: shooter })
    // The Gewehr's clip goes in in about four seconds.
    expect(sim.soldiers.weapon.cooldown[shooter]).toBeGreaterThanOrEqual(3.9)

    const later = stepFor(sim, 5)
    expect(later).toContainEqual({ type: "reloaded", soldier: shooter })
    expect(sim.soldiers.weapon.rounds[shooter]).toBe(5)
    expect(sim.soldiers.weapon.reloading[shooter]).toBe(0)
  })

  it("lets the player reload a part-used magazine, but not a full one, and bots top up with nothing to shoot at", () => {
    const sim = field()
    const player = spawnSoldier(sim, { side: Side.French, x: 50, z: 50 })
    expect(startReload(sim, player)).toBe(false)
    sim.soldiers.weapon.rounds[player] = 3
    enqueueCommand(sim, { type: "reload", soldier: player })
    stepSimulation(sim)
    expect(sim.soldiers.weapon.reloading[player]).toBe(1)

    const idle = spawnSoldier(sim, { side: Side.French, x: 80, z: 50 })
    sim.soldiers.weapon.rounds[idle] = 2
    stepFor(sim, 12)
    expect(sim.soldiers.weapon.rounds[idle]).toBe(8)
  })

  it("keeps the rounds left and a reload under way in a snapshot", () => {
    const sim = field()
    const soldier = spawnSoldier(sim, { side: Side.German, x: 50, z: 50 })
    sim.soldiers.weapon.rounds[soldier] = 2
    startReload(sim, soldier)
    const restored = restoreSimulation(sim.map, takeSnapshot(sim))
    expect(restored.soldiers.weapon.rounds[soldier]).toBe(2)
    expect(restored.soldiers.weapon.reloading[soldier]).toBe(1)
  })
})
