import { createFlatMap, stampCrater } from "@verdun/map"
import { decodeJoined, groundMovement, type Recipient } from "@verdun/net"
import {
  applySync,
  createSimulation,
  createSquad,
  createWarClock,
  enqueueCommand,
  scheduleForWeek,
  Side,
  spawnSoldier,
  stepSimulation
} from "@verdun/sim"
import { describe, expect, it, vi } from "vitest"
import type { Messages } from "./encoding.ts"
import { groundOf } from "./ground.ts"
import { createRelay, type Relay } from "./relay.ts"
import type { Sector } from "./sector.ts"

const NOW = Date.UTC(2027, 5, 10, 18)
const field = () => createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 })

/** A small sector, stepped by hand. */
function smallSector(): Sector {
  const map = field()
  const generated = groundOf(map)
  const sim = createSimulation({ map, seed: 3 })
  createSquad(
    sim,
    Side.French,
    Array.from({ length: 4 }, (_, index) => spawnSoldier(sim, { side: Side.French, x: 20 + index * 3, z: 20 }))
  )
  const war = createWarClock(sim, scheduleForWeek(sim.environment.clock.week, NOW), NOW)
  const listeners: (() => void)[] = []
  return {
    name: "field",
    sim,
    war,
    advance(steps) {
      for (let step = 0; step < steps; step++) {
        stepSimulation(sim)
        for (const listener of listeners) {
          listener()
        }
      }
      return steps
    },
    onStep: (listener) => listeners.push(listener),
    reshapedGround: () => groundMovement(map, generated),
    save: () => {
      throw new Error("Not kept")
    }
  }
}

/** The welcome for the player leading `squad`, which the relay's inline encoding gives at once. */
function welcomeOf(relay: Relay, squad = 0): Uint8Array {
  let given: Uint8Array | null = null
  relay.welcome(squad, (welcome) => {
    given = welcome
  })
  if (!given) {
    throw new Error("No welcome")
  }
  return given
}

/** The sync's message for "player", leading as `recipient`, or null when no sync was due. */
function messageFor(relay: Relay, recipient: Recipient): Uint8Array | null {
  let message: Uint8Array | null = null
  const due = relay.sync(
    () => new Map([["player", recipient]]),
    (messages) => {
      message = messages.get("player") ?? null
    }
  )
  return due ? message : null
}

describe("the relay", () => {
  it("welcomes a late player with the whole battle, craters and all, and keeps them in step after", () => {
    const sector = smallSector()
    const relay = createRelay(sector)
    stampCrater(sector.sim.map, { x: 50, z: 50, radius: 3, depth: 1 })
    sector.advance(5)

    const mirror = createSimulation({ map: field(), seed: 3 })
    const joined = decodeJoined(welcomeOf(relay), field())
    applySync(mirror, joined.sync)
    expect(joined.playerSquad).toBe(0)
    expect(joined.schedule).toEqual(sector.war.schedule)
    mirror.map.heights.forEach((height, sample) => expect(height).toBeCloseTo(sector.sim.map.heights[sample] ?? 0, 3))
    expect(mirror.squads.length).toBe(1)

    // Every message after the welcome builds on the one before.
    const squad = sector.sim.squads[0]
    const take = () => {
      const message = squad ? messageFor(relay, relay.recipient(squad)) : null
      if (message) {
        applySync(mirror, joined.decoder.decode(message))
      }
      return message
    }
    sector.advance(1)
    expect(take()).not.toBeNull()
    sector.advance(1)
    expect(take()).toBeNull()
    sector.advance(1)
    expect(take()).not.toBeNull()
    Array.from(mirror.soldiers.position.x.slice(0, 4)).forEach((x, soldier) =>
      expect(x).toBeCloseTo(sector.sim.soldiers.position.x[soldier] ?? 0, 1)
    )
  })

  it("keeps a player joining after a sync no one was sent in step, with no steps kept back", () => {
    const sector = smallSector()
    const relay = createRelay(sector)
    sector.advance(4)
    const noOne = vi.fn<(messages: Messages, encodeMs: number) => void>()
    expect(relay.sync(() => new Map(), noOne)).toBe(true)
    expect(noOne).toHaveBeenCalledWith(new Map(), expect.any(Number))

    const { decoder } = decodeJoined(welcomeOf(relay), field())
    sector.advance(2)
    const message = messageFor(relay, { near: new Set(), side: Side.French, own: [] })
    expect(decoder.decode(message ?? new Uint8Array()).steps.map((step) => step.tick)).toEqual([5, 6])
    relay.forget("player")
  })

  it("follows the cells near a squad's men in the fight, and none once they've all fallen", () => {
    const sector = smallSector()
    const relay = createRelay(sector)
    const squad = sector.sim.squads[0]
    if (!squad) {
      throw new Error("No squad")
    }
    expect(relay.recipient(squad)).toEqual({ near: new Set([0]), side: Side.French, own: squad.members })
    for (const member of squad.members) {
      enqueueCommand(sector.sim, { type: "kill", soldier: member })
    }
    sector.advance(1)
    expect(relay.recipient(squad).near).toEqual(new Set())
  })

  it("welcomes a player to unshelled ground with no patch", () => {
    const relay = createRelay(smallSector())

    expect(decodeJoined(welcomeOf(relay), field()).sync.ground).toEqual([])
    // A squad the battle doesn't have is welcomed as French.
    expect(decodeJoined(welcomeOf(relay, 9), field()).playerSquad).toBe(9)
  })
})
