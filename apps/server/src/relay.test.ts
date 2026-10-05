import { createFlatMap, stampCrater } from "@verdun/map"
import { decodeJoined, decodeSync } from "@verdun/net"
import {
  applySync,
  createSimulation,
  createSquad,
  createWarClock,
  scheduleForWeek,
  Side,
  spawnSoldier,
  stepSimulation
} from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { groundOf, reshapedGround } from "./ground.ts"
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
    reshapedGround: () => reshapedGround(map, generated),
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
    const joined = decodeJoined(relay.welcome(0))
    applySync(mirror, joined.sync)
    expect(joined.playerSquad).toBe(0)
    expect(joined.schedule).toEqual(sector.war.schedule)
    expect(mirror.map.heights).toEqual(sector.sim.map.heights)
    expect(mirror.squads.length).toBe(1)

    sector.advance(1)
    expect(relay.due(true)).not.toBeNull()
    sector.advance(1)
    expect(relay.due(true)).toBeNull()
    sector.advance(1)
    const sync = relay.due(true)
    if (!sync) {
      throw new Error("No sync when one was due")
    }
    applySync(mirror, decodeSync(sync))
    expect(Array.from(mirror.soldiers.position.x.slice(0, 4))).toEqual(
      Array.from(sector.sim.soldiers.position.x.slice(0, 4))
    )
  })

  it("sends nothing to no one, and keeps no steps back for later", () => {
    const sector = smallSector()
    const relay = createRelay(sector)
    sector.advance(4)

    expect(relay.due(false)).toBeNull()
    sector.advance(2)
    const sync = relay.due(true)
    expect(sync && decodeSync(sync).steps.length).toBe(2)
  })

  it("welcomes a player to unshelled ground with no patch", () => {
    const relay = createRelay(smallSector())

    expect(decodeJoined(relay.welcome(0)).sync.ground).toEqual([])
  })
})
