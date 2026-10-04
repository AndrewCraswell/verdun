import { carveTrenches, createFlatMap, Surface, type Trench } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import {
  allotReinforcements,
  arrivalOf,
  FULL_SQUAD,
  redeploySeconds,
  REDEPLOY_SECONDS,
  returnToPool,
  SCRAPED_SQUAD
} from "./reinforcements.ts"
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
import { createSquad, isAlive, type Squad } from "./squads.ts"

/** French front line at z = 100 and their rear line at z = 40, both facing north. */
function sector() {
  const map = createFlatMap({ name: "sector", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
  const line = (z: number): Trench => ({
    kind: "fire",
    points: [
      [20, z],
      [180, z]
    ],
    facing: "north"
  })
  const trenches = [line(100), line(40)]
  carveTrenches(map, trenches)
  return { ...map, trenches }
}

function stepFor(sim: Simulation, seconds: number): SimEvent[] {
  const events: SimEvent[] = []
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
    events.push(...sim.events)
  }
  return events
}

/** A French squad of eight on the front line, around x = 100. The last man carries a machine gun. */
function frontSquad(sim: Simulation, controller: Squad["controller"] = "player"): Squad {
  const members = Array.from({ length: 8 }, (_, slot) =>
    spawnSoldier(sim, {
      side: Side.French,
      x: 90 + slot * 3,
      z: 100,
      weapon: slot === 7 ? Weapon.MachineGun : Weapon.Rifle
    })
  )
  return createSquad(sim, Side.French, members, controller)
}

function wipeOut(sim: Simulation, squad: Squad): void {
  for (const soldier of squad.members) {
    enqueueCommand(sim, { type: "kill", soldier })
  }
}

describe("reinforcements", () => {
  it("leave a wiped squad wiped when its side has no pool", () => {
    const sim = createSimulation({ map: sector(), seed: 1 })
    const squad = frontSquad(sim)
    wipeOut(sim, squad)
    stepFor(sim, REDEPLOY_SECONDS * 4)

    expect(squad.leader).toBe(-1)
    expect(squad.members.some((member) => isAlive(sim, member))).toBe(false)
  })

  it("bring a wiped player squad back to full strength in the rear trench after the delay", () => {
    const sim = createSimulation({ map: sector(), seed: 1, reinforcements: { [Side.French]: 100 } })
    const squad = frontSquad(sim)
    squad.order = { kind: "advance", x: 100, z: 200 }
    const fallen = [...squad.members]
    wipeOut(sim, squad)

    stepFor(sim, 1)
    expect(arrivalOf(sim, squad)).toBeGreaterThan(sim.tick)
    expect(stepFor(sim, REDEPLOY_SECONDS - 2).some((event) => event.type === "reinforcement")).toBe(false)
    const events = stepFor(sim, 2)

    expect(events).toContainEqual({ type: "reinforcement", side: Side.French, squad: squad.id, men: FULL_SQUAD })
    expect(squad.members).toHaveLength(FULL_SQUAD)
    expect(squad.members.every((member) => isAlive(sim, member) && !fallen.includes(member))).toBe(true)
    expect(squad.leader).toBe(squad.members[0])
    expect(squad.order).toEqual({ kind: "hold" })
    expect(sim.reinforcements.pool[Side.French]).toBe(100 - FULL_SQUAD)
    for (const member of squad.members) {
      // In the rear trench, behind the stretch of front the squad held.
      expect(sim.soldiers.position.z[member]).toBeCloseTo(40, 0)
      expect(Math.abs(sim.soldiers.position.x[member] - 100)).toBeLessThan(15)
      expect(sim.soldiers.squad.id[member]).toBe(squad.id)
    }
    expect(sim.soldiers.weapon.kind[squad.members[7] ?? -1]).toBe(Weapon.MachineGun)
  })

  it("send bot squads back as reserves until the pool runs low", () => {
    const sim = createSimulation({ map: sector(), seed: 1, reinforcements: { [Side.French]: 40 } })
    const squad = frontSquad(sim, "ai")
    wipeOut(sim, squad)
    stepFor(sim, REDEPLOY_SECONDS + 1)

    expect(squad.order).toEqual({ kind: "reserve" })
    expect(sim.reinforcements.pool[Side.French]).toBe(32)

    // A quarter of the pool is kept for the squads players lead.
    sim.reinforcements.pool[Side.French] = 10
    wipeOut(sim, squad)
    stepFor(sim, redeploySeconds(sim.reinforcements, Side.French) + 1)
    expect(arrivalOf(sim, squad)).toBe(-1)
    expect(squad.leader).toBe(-1)
  })

  it("take squads wiped out together from the pool once, never giving bots more men than it holds", () => {
    const sim = createSimulation({ map: sector(), seed: 1, reinforcements: { [Side.French]: 24 } })
    const squads = [frontSquad(sim, "ai"), frontSquad(sim, "ai"), frontSquad(sim, "ai"), frontSquad(sim, "ai")]
    for (const squad of squads) {
      wipeOut(sim, squad)
    }
    const events = stepFor(sim, redeploySeconds(sim.reinforcements, Side.French) * 3)

    const arrived = events.flatMap((event) => (event.type === "reinforcement" ? [event.men] : []))
    expect(arrived).toEqual([FULL_SQUAD, FULL_SQUAD, FULL_SQUAD])
    expect(sim.reinforcements.pool[Side.French]).toBe(0)
    expect(squads[3]?.leader).toBe(-1)
  })

  it("still give a player a few men once the pool is empty, after a longer wait", () => {
    const sim = createSimulation({ map: sector(), seed: 1, reinforcements: { [Side.French]: 8 } })
    const squad = frontSquad(sim)
    wipeOut(sim, squad)
    stepFor(sim, REDEPLOY_SECONDS + 1)
    expect(sim.reinforcements.pool[Side.French]).toBe(0)

    wipeOut(sim, squad)
    stepFor(sim, 1)
    expect(redeploySeconds(sim.reinforcements, Side.French)).toBeGreaterThan(REDEPLOY_SECONDS)
    expect(stepFor(sim, REDEPLOY_SECONDS + 1).some((event) => event.type === "reinforcement")).toBe(false)
    const events = stepFor(sim, redeploySeconds(sim.reinforcements, Side.French))

    expect(events).toContainEqual({ type: "reinforcement", side: Side.French, squad: squad.id, men: SCRAPED_SQUAD })
    expect(squad.members).toHaveLength(SCRAPED_SQUAD)
  })

  it("count the wounded carried back as part of a man each, and send only whole men", () => {
    const sim = createSimulation({ map: sector(), seed: 1, reinforcements: { [Side.French]: 6 } })
    returnToPool(sim, Side.French, 0.5)
    returnToPool(sim, Side.French, 0.5)
    returnToPool(sim, Side.French, 0.5)
    const squad = frontSquad(sim)
    wipeOut(sim, squad)
    stepFor(sim, redeploySeconds(sim.reinforcements, Side.French) + 1)

    expect(squad.members).toHaveLength(7)
    expect(sim.reinforcements.pool[Side.French]).toBeCloseTo(0.5)
  })

  it("start replacing squads once the sector is allotted men, judging the pool against the latest allotment", () => {
    const sim = createSimulation({ map: sector(), seed: 1 })
    allotReinforcements(sim, Side.French, 16)
    allotReinforcements(sim, Side.French, 16)
    expect(sim.reinforcements.full[Side.French]).toBe(32)

    const squad = frontSquad(sim, "ai")
    wipeOut(sim, squad)
    stepFor(sim, REDEPLOY_SECONDS + 1)
    expect(squad.members).toHaveLength(FULL_SQUAD)
    expect(sim.reinforcements.pool[Side.French]).toBe(24)
  })

  it("bring men up at their own edge of the map when there's no trench to come up to", () => {
    const flat = createFlatMap({ name: "open", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
    const sim = createSimulation({ map: flat, seed: 1, reinforcements: { [Side.French]: 8, [Side.German]: 8 } })
    const german = createSquad(
      sim,
      Side.German,
      [0, 1].map((slot) => spawnSoldier(sim, { side: Side.German, x: 50 + slot * 3, z: 150 }))
    )
    const french = frontSquad(sim)
    wipeOut(sim, german)
    wipeOut(sim, french)
    stepFor(sim, REDEPLOY_SECONDS + 1)

    for (const member of german.members) {
      expect(sim.soldiers.position.z[member]).toBeGreaterThan(195)
      expect(Math.abs(sim.soldiers.position.x[member] - 51.5)).toBeLessThan(12)
    }
    for (const member of french.members) {
      expect(sim.soldiers.position.z[member]).toBeLessThan(5)
    }
  })

  it("survive a save and restore with replacements on their way", () => {
    const sim = createSimulation({ map: sector(), seed: 1, reinforcements: { [Side.French]: 50 } })
    const squad = frontSquad(sim)
    wipeOut(sim, squad)
    stepFor(sim, 5)

    const restored = restoreSimulation(sim.map, takeSnapshot(sim))
    expect(restored.reinforcements).toEqual(sim.reinforcements)
    stepFor(sim, REDEPLOY_SECONDS)
    stepFor(restored, REDEPLOY_SECONDS)
    expect(restored.squads[squad.id]?.members).toEqual(squad.members)
    expect(takeSnapshot(restored)).toEqual(takeSnapshot(sim))
  })
})
