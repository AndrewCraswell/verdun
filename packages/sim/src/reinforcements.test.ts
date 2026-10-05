import { carveTrenches, createFlatMap, Surface, type Trench } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import {
  allotReinforcements,
  arrivalOf,
  FULL_SQUAD,
  joinRefusal,
  joinSquad,
  redeploySeconds,
  REDEPLOY_SECONDS,
  returnToPool,
  SCRAPED_SQUAD,
  takeOverCandidates,
  takeOverSquad
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

describe("taking over a squad", () => {
  /** A wiped-out player squad on the front line and a bot squad of eight holding further along it. */
  function wipedWithNeighbour(sim: Simulation) {
    const player = frontSquad(sim, "player")
    const members = Array.from({ length: 8 }, (_, slot) =>
      spawnSoldier(sim, { side: Side.French, x: 140 + slot * 3, z: 100 })
    )
    const bots = createSquad(sim, Side.French, members, "ai")
    bots.order = { kind: "hold" }
    wipeOut(sim, player)
    stepFor(sim, 1)
    return { player, bots, members }
  }

  it("hands a wiped-out player the men of a bot squad at once, and sends the bot squad's replacements to where it held", () => {
    const sim = createSimulation({ map: sector(), seed: 1, reinforcements: { [Side.French]: 100 } })
    const { player, bots, members } = wipedWithNeighbour(sim)
    expect(arrivalOf(sim, player)).toBeGreaterThan(sim.tick)
    const poolBefore = sim.reinforcements.pool[Side.French]

    expect(takeOverCandidates(sim, player)).toEqual([bots])
    expect(takeOverSquad(sim, player, bots)).toBe(true)

    expect(player.members).toEqual(members)
    expect(player.leader).toBe(members[0])
    expect(player.order).toEqual({ kind: "hold" })
    expect(members.every((member) => sim.soldiers.squad.id[member] === player.id)).toBe(true)
    expect(sim.events).toContainEqual({
      type: "squad-taken-over",
      side: Side.French,
      squad: player.id,
      from: bots.id,
      men: 8
    })
    // The player's replacements go back to the pool; the empty bot squad's come up behind where it stood.
    expect(arrivalOf(sim, player)).toBe(-1)
    expect(bots.members).toEqual([])
    expect(sim.reinforcements.pool[Side.French]).toBe(poolBefore)
    const events = stepFor(sim, redeploySeconds(sim.reinforcements, Side.French) + 1)
    expect(events).toContainEqual({ type: "reinforcement", side: Side.French, squad: bots.id, men: FULL_SQUAD })
    expect(Math.abs(sim.soldiers.position.x[bots.members[0] ?? -1] - 150.5)).toBeLessThan(15)
  })

  it("takes over through a command, as input and the network will send it", () => {
    const sim = createSimulation({ map: sector(), seed: 1, reinforcements: { [Side.French]: 100 } })
    const { player, bots, members } = wipedWithNeighbour(sim)
    enqueueCommand(sim, { type: "take-over-squad", squad: player.id, from: bots.id })
    stepFor(sim, 0.05)

    expect(player.members).toEqual(members)
  })

  it("won't hand over a squad in contact, an understrength one, or any squad while the player's still has men", () => {
    const sim = createSimulation({ map: sector(), seed: 1, reinforcements: { [Side.French]: 100 } })
    const { player, bots, members } = wipedWithNeighbour(sim)
    const german = spawnSoldier(sim, { side: Side.German, x: 150, z: 120 })
    expect(takeOverCandidates(sim, player)).toEqual([])
    expect(takeOverSquad(sim, player, bots)).toBe(false)

    enqueueCommand(sim, { type: "kill", soldier: german })
    for (const soldier of members.slice(0, 5)) {
      enqueueCommand(sim, { type: "kill", soldier })
    }
    stepFor(sim, 0.1)
    expect(takeOverCandidates(sim, player)).toEqual([])

    const alive = createSimulation({ map: sector(), seed: 1, reinforcements: { [Side.French]: 100 } })
    const standing = frontSquad(alive, "player")
    expect(takeOverCandidates(alive, standing)).toEqual([])
  })
})

describe("joining the battle with a squad of your choosing", () => {
  /** The player's squad on the front line, and a bot squad holding further along it. */
  function line(sim: Simulation) {
    const player = frontSquad(sim, "player")
    player.order = { kind: "follow" }
    const members = Array.from({ length: 8 }, (_, slot) =>
      spawnSoldier(sim, { side: Side.French, x: 140 + slot * 3, z: 100 })
    )
    const bots = createSquad(sim, Side.French, members, "ai")
    bots.order = { kind: "hold" }
    return { player, bots, members }
  }

  it("swaps the two squads' men and orders, so the player leads the chosen men where they stand", () => {
    const sim = createSimulation({ map: sector(), seed: 1 })
    const { player, bots, members } = line(sim)
    const held = [...player.members]
    enqueueCommand(sim, { type: "join-squad", squad: player.id, from: bots.id })
    stepFor(sim, 0.05)

    expect(player.members).toEqual(members)
    expect(player.leader).toBe(members[0])
    expect(player.order).toEqual({ kind: "hold" })
    expect(bots.members).toEqual(held)
    expect(bots.leader).toBe(held[0])
    expect(bots.order).toEqual({ kind: "follow" })
    expect(members.every((member) => sim.soldiers.squad.id[member] === player.id)).toBe(true)
    expect(held.every((member) => sim.soldiers.squad.id[member] === bots.id)).toBe(true)
  })

  it("sends replacements already on their way after the men they replace, and keeps the pool as it was", () => {
    const sim = createSimulation({ map: sector(), seed: 1, reinforcements: { [Side.French]: 100 } })
    const { player, bots, members } = line(sim)
    const fallen = [...player.members]
    wipeOut(sim, player)
    stepFor(sim, 1)
    const coming = arrivalOf(sim, player)
    const pool = sim.reinforcements.pool[Side.French]
    expect(coming).toBeGreaterThan(sim.tick)

    expect(joinSquad(sim, player, bots)).toBe(true)
    expect(player.members).toEqual(members)
    expect(bots.members).toEqual(fallen)
    expect(arrivalOf(sim, player)).toBe(-1)
    expect(arrivalOf(sim, bots)).toBe(coming)
    expect(sim.reinforcements.pool[Side.French]).toBe(pool)
  })

  it("refuses a squad in contact, an understrength one, the enemy's, or the player's own", () => {
    const sim = createSimulation({ map: sector(), seed: 1 })
    const { player, bots, members } = line(sim)
    const enemies = createSquad(sim, Side.German, [spawnSoldier(sim, { side: Side.German, x: 100, z: 300 })], "ai")
    expect(joinRefusal(sim, player, bots)).toBeNull()
    expect(joinRefusal(sim, player, enemies)).toBe("not-ours")
    expect(joinRefusal(sim, player, player)).toBe("not-ours")

    const german = spawnSoldier(sim, { side: Side.German, x: 150, z: 120 })
    // The squads' neighbours are counted as the battle steps.
    stepFor(sim, 0.05)
    expect(joinRefusal(sim, player, bots)).toBe("in-contact")
    expect(joinSquad(sim, player, bots)).toBe(false)

    enqueueCommand(sim, { type: "kill", soldier: german })
    for (const soldier of members.slice(0, 5)) {
      enqueueCommand(sim, { type: "kill", soldier })
    }
    stepFor(sim, 0.1)
    expect(joinRefusal(sim, player, bots)).toBe("too-few")
  })
})
