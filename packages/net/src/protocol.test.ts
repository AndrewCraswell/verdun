import { createFlatMap, Surface, type WireBelt } from "@verdun/map"
import {
  applySync,
  createSimulation,
  createSquad,
  createSyncSource,
  enqueueCommand,
  scheduleForWeek,
  Shell,
  Side,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  takeSnapshot
} from "@verdun/sim"
import { Packr } from "msgpackr"
import { describe, expect, it } from "vitest"
import { decodeJoined, decodeSync, encodeJoined, encodeSync, joinSide } from "./protocol.ts"

function battlefield() {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 300, rows: 300 }, 5, Surface.Grass)
  const wire: WireBelt[] = [
    {
      points: [
        [20, 80],
        [130, 80]
      ]
    }
  ]
  return { ...map, wire }
}

/** Two squads across the wire, a barrage falling on it, and the French going forward. */
function fight(): Simulation {
  const sim = createSimulation({ map: battlefield(), seed: 7 })
  const french = Array.from({ length: 6 }, (_, index) =>
    spawnSoldier(sim, { side: Side.French, x: 50 + index * 4, z: 40 })
  )
  const german = Array.from({ length: 6 }, (_, index) =>
    spawnSoldier(sim, { side: Side.German, x: 50 + index * 4, z: 110, facing: { x: 0, z: -1 } })
  )
  createSquad(sim, Side.French, french)
  createSquad(sim, Side.German, german)
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: {
      side: Side.French,
      shell: Shell.FieldHighExplosive,
      fromX: 40,
      toX: 90,
      z: 82,
      band: 10,
      roundsPerMinute: 120,
      delay: 0,
      duration: 30
    }
  })
  enqueueCommand(sim, { type: "squad-order", squad: 0, order: { kind: "advance", x: 60, z: 120 } })
  return sim
}

/** A snapshot without the random number generator's state: a mirror never draws from it. */
function comparable(sim: Simulation) {
  const { rngState, ...rest } = takeSnapshot(sim)
  void rngState
  return rest
}

const NOW = Date.UTC(2027, 5, 10, 18)

describe("the messages between the server and its players", () => {
  it("carry a running battle to a player's mirror, craters, cut wire and all", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    const mirror = createSimulation({ map: battlefield(), seed: 7 })
    const schedule = scheduleForWeek(Date.UTC(1916, 5, 20), NOW)
    const joined = decodeJoined(encodeJoined({ playerSquad: 0, schedule, sync: source.take() }))
    expect(joined.playerSquad).toBe(0)
    expect(joined.schedule).toEqual(schedule)
    applySync(mirror, joined.sync)

    for (let batch = 0; batch < 100; batch++) {
      stepSimulation(sim)
      source.stepped()
      stepSimulation(sim)
      source.stepped()
      applySync(mirror, decodeSync(encodeSync(source.take())))
    }

    expect(comparable(mirror)).toEqual(comparable(sim))
    expect(mirror.map.heights).toEqual(sim.map.heights)
    expect(mirror.wire.density).toEqual(sim.wire.density)
  })

  it("refuse what isn't a sync or a welcome", () => {
    const other = new Packr({ moreTypes: true }).pack({ tick: 1 })

    expect(() => decodeSync(other)).toThrow("The server sent a sync this client can't read")
    expect(() => decodeJoined(other)).toThrow("The server sent a welcome this client can't read")
  })

  it("let a player join for Germany, and for France otherwise", () => {
    expect(joinSide({ side: Side.German })).toBe(Side.German)
    expect(joinSide({ side: Side.French })).toBe(Side.French)
    expect(joinSide({ side: "germans" })).toBe(Side.French)
    expect(joinSide(null)).toBe(Side.French)
  })
})
