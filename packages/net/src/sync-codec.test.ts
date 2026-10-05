import { createFlatMap, stampCrater, Surface, type WireBelt } from "@verdun/map"
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
  soldierArrayLayout,
  spawnSoldier,
  stepSimulation,
  type SyncSource,
  takeSnapshot
} from "@verdun/sim"
import { deflateSync, inflateSync } from "fflate"
import { Packr } from "msgpackr"
import { describe, expect, it } from "vitest"
import { groundMovement } from "./ground-movement.ts"
import { createSyncEncoder, decodeJoined } from "./sync-codec.ts"

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

const barrage = {
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

/** Two squads across the wire, high explosive and gas falling on it, and the French going forward. */
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
  enqueueCommand(sim, { type: "fire-mission", plan: barrage })
  enqueueCommand(sim, {
    type: "fire-mission",
    plan: { ...barrage, shell: Shell.FieldGas, z: 110, roundsPerMinute: 60 }
  })
  enqueueCommand(sim, { type: "squad-order", squad: 0, order: { kind: "advance", x: 60, z: 120 } })
  return sim
}

/** A snapshot without the random number generator's state, which a mirror never draws from. */
function comparable(sim: Simulation) {
  const { rngState, ...rest } = takeSnapshot(sim)
  void rngState
  return rest
}

/**
 * Whether two values are the same but for numbers within `tolerance`: soldiers' positions, facing, morale and the like
 * go to the centimetre or the hundredth.
 */
function expectClose(actual: unknown, expected: unknown, tolerance = 0.006, path = "battle"): void {
  if (typeof expected === "number" && typeof actual === "number") {
    if (!Object.is(actual, expected) && !(Math.abs(actual - expected) <= tolerance)) {
      throw new Error(`${path} is ${actual}, not ${expected}`)
    }
    return
  }
  if (typeof expected === "object" && expected !== null && typeof actual === "object" && actual !== null) {
    const keys = new Set([...Object.keys(expected), ...Object.keys(actual)])
    for (const key of keys) {
      expectClose(Reflect.get(actual, key), Reflect.get(expected, key), tolerance, `${path}.${key}`)
    }
    return
  }
  if (!Object.is(actual, expected) && JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${path} is ${JSON.stringify(actual)}, not ${JSON.stringify(expected)}`)
  }
}

/** Steps the battle, as the server does between messages. */
function steps(sim: Simulation, source: SyncSource, count: number) {
  for (let step = 0; step < count; step++) {
    stepSimulation(sim)
    source.stepped()
  }
}

/** The clouds come to within a step and a half of their scale, about 11%, or clear air: see `settled`. */
function closeCloud(mirrored: readonly number[], real: readonly number[]) {
  real.forEach((value, cell) => {
    expect(Math.abs((mirrored[cell] ?? 0) - value)).toBeLessThanOrEqual(value * 0.11 + 0.05)
  })
}

const NOW = Date.UTC(2027, 5, 10, 18)
const schedule = scheduleForWeek(Date.UTC(1916, 5, 20), NOW)

describe("the battle's messages", () => {
  it("keep a player's mirror in step with what changed, craters, cut wire, gas and smoke and all", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    const encoder = createSyncEncoder(soldierArrayLayout(sim))
    encoder.encode(source.take())
    const joined = decodeJoined(encoder.welcome(0, schedule, null), battlefield())
    const mirror = createSimulation({ map: battlefield(), seed: 7 })
    applySync(mirror, joined.sync)
    expect(joined.playerSquad).toBe(0)
    expect(joined.schedule).toEqual(schedule)

    let gas = 0
    let smoke = 0
    for (let message = 0; message < 150; message++) {
      steps(sim, source, 2)
      applySync(mirror, joined.decoder.decode(encoder.encode(source.take())))
      gas = Math.max(gas, ...mirror.gas.concentration)
      smoke = Math.max(smoke, ...mirror.smoke.concentration)
    }

    const { gas: realGas, smoke: realSmoke, ...real } = comparable(sim)
    const { gas: mirroredGas, smoke: mirroredSmoke, ...mirrored } = comparable(mirror)
    expectClose(mirrored, real)
    expect(mirror.map.heights).toEqual(sim.map.heights)
    expect(mirror.wire.density).toEqual(sim.wire.density)
    expect(gas).toBeGreaterThan(0)
    expect(smoke).toBeGreaterThan(0)
    closeCloud(mirroredGas, realGas)
    closeCloud(mirroredSmoke, realSmoke)
  })

  it("send a quiet battle in a few bytes", () => {
    const sim = createSimulation({ map: battlefield(), seed: 7 })
    createSquad(sim, Side.French, [spawnSoldier(sim, { side: Side.French, x: 50, z: 40 })])
    const source = createSyncSource(sim)
    const encoder = createSyncEncoder(soldierArrayLayout(sim))
    encoder.encode(source.take())
    steps(sim, source, 2)

    expect(encoder.encode(source.take()).byteLength).toBeLessThan(400)
  })

  it("welcome a late player to the battle as of the last message, craters and all, and build on it after", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    const encoder = createSyncEncoder(soldierArrayLayout(sim))
    const generated = { heights: sim.map.heights.slice(), surfaces: sim.map.surfaces.slice() }
    for (let message = 0; message < 60; message++) {
      steps(sim, source, 2)
      encoder.encode(source.take())
    }
    stampCrater(sim.map, { x: 120, z: 30, radius: 3, depth: 1 })
    // Steps taken since the last message come with the next one.
    steps(sim, source, 1)

    const joined = decodeJoined(encoder.welcome(1, schedule, groundMovement(sim.map, generated)), battlefield())
    const mirror = createSimulation({ map: battlefield(), seed: 7 })
    applySync(mirror, joined.sync)
    steps(sim, source, 1)
    applySync(mirror, joined.decoder.decode(encoder.encode(source.take())))

    const { gas, smoke, ...real } = comparable(sim)
    const { gas: mirroredGas, smoke: mirroredSmoke, ...mirrored } = comparable(mirror)
    expectClose(mirrored, real)
    closeCloud(mirroredGas, gas)
    closeCloud(mirroredSmoke, smoke)
    mirror.map.heights.forEach((height, sample) => expect(height).toBeCloseTo(sim.map.heights[sample] ?? 0, 3))
  })

  it("can't welcome a player before the battle's first message", () => {
    expect(() => createSyncEncoder([]).welcome(0, schedule, null)).toThrow(
      "A player can't be welcomed before the battle's first sync"
    )
  })

  it("refuse what isn't a welcome or a sync, or a sync that doesn't fit the battle", () => {
    const packr = new Packr({ moreTypes: true })
    const sent = (value: unknown) => deflateSync(packr.pack(value))
    const sim = fight()
    const encoder = createSyncEncoder(soldierArrayLayout(sim))
    encoder.encode(createSyncSource(sim).take())
    const { decoder } = decodeJoined(encoder.welcome(0, schedule, null), battlefield())

    expect(() => decodeJoined(sent({ tick: 1 }), battlefield())).toThrow(
      "The server sent a welcome this client can't read"
    )
    expect(() => decoder.decode(sent({ tick: 1 }))).toThrow("The server sent a sync this client can't read")
    expect(() => decoder.decode(sent({ v: { f: { tick: "soon" } }, s: [], g: [] }))).toThrow(
      "The server's sync doesn't fit the battle this client has"
    )
    expect(decoder.decode(sent({ v: null, s: [], g: [] })).wire).toBeNull()
  })

  it("refuse soldiers' arrays they can't carry, and a welcome short of an array its layout names", () => {
    const sim = fight()
    const sync = createSyncSource(sim).take()
    expect(() => createSyncEncoder([{ name: "position.x", type: "BigInt64Array" }]).encode(sync)).toThrow(
      "The soldiers' arrays hold a BigInt64Array, which can't be sent"
    )

    const encoder = createSyncEncoder(soldierArrayLayout(sim))
    encoder.encode(sync)
    const welcome = new Packr({ moreTypes: true, useRecords: false }).unpack(
      inflateSync(encoder.welcome(0, schedule, null))
    )
    const short = deflateSync(
      new Packr({ moreTypes: true, useRecords: false }).pack({ ...welcome, view: { ...welcome.view, arrays: {} } })
    )
    expect(() => decodeJoined(short, battlefield())).toThrow("The battle as sent has no ")
  })
})
