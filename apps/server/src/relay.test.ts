import { createFlatMap, stampCrater } from "@verdun/map"
import { decodeJoined, groundMovement } from "@verdun/net"
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
import { describe, expect, it } from "vitest"
import { groundOf } from "./ground.ts"
import { createRelay } from "./relay.ts"
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

describe("the relay", () => {
  it("welcomes a late player with the whole battle, craters and all, and keeps them in step after", () => {
    const sector = smallSector()
    const relay = createRelay(sector)
    stampCrater(sector.sim.map, { x: 50, z: 50, radius: 3, depth: 1 })
    sector.advance(5)

    const mirror = createSimulation({ map: field(), seed: 3 })
    const joined = decodeJoined(relay.welcome(0), field())
    applySync(mirror, joined.sync)
    expect(joined.playerSquad).toBe(0)
    expect(joined.schedule).toEqual(sector.war.schedule)
    mirror.map.heights.forEach((height, sample) => expect(height).toBeCloseTo(sector.sim.map.heights[sample] ?? 0, 3))
    expect(mirror.squads.length).toBe(1)

    // Every message after the welcome builds on the one before.
    const squad = sector.sim.squads[0]
    const take = () => {
      const sync = relay.due()
      if (sync && squad) {
        applySync(mirror, joined.decoder.decode(sync.for("player", relay.recipient(squad))))
      }
      return sync
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
    expect(relay.due()).not.toBeNull()

    const { decoder } = decodeJoined(relay.welcome(0), field())
    sector.advance(2)
    const sync = relay.due()
    expect(
      decoder
        .decode(sync?.for("player", { near: new Set(), side: Side.French, own: [] }) ?? new Uint8Array())
        .steps.map((step) => step.tick)
    ).toEqual([5, 6])
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

    expect(decodeJoined(relay.welcome(0), field()).sync.ground).toEqual([])
  })
})
