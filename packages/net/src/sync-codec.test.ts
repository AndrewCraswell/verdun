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
  soldierIds,
  spawnSoldier,
  stepSimulation,
  type SyncSource,
  takeSnapshot
} from "@verdun/sim"
import { deflateSync, inflateSync } from "fflate"
import { Packr } from "msgpackr"
import { describe, expect, it } from "vitest"
import { groundMovement } from "./ground-movement.ts"
import { DRIFT } from "./reckoning.ts"
import { createSyncEncoder, decodeJoined, FAR_EVERY } from "./sync-codec.ts"

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
/** The battlefield is 150 m square: four cells, the French in the south-west one (0), the Germans north of it (2). */
const EVERY_CELL = new Set([0, 1, 2, 3])

const encoderFor = (sim: Simulation) => createSyncEncoder(soldierArrayLayout(sim), 150, 150, 100)

/** A French player following `near`, whose squad is `own`. */
const to = (near: ReadonlySet<number>, own: readonly number[] = []) => ({ near, side: Side.French, own })

describe("the battle's messages", () => {
  it("keep a player's mirror in step with what changed, craters, cut wire, gas and smoke and all", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    const encoder = encoderFor(sim)
    encoder.encode(source.take())
    const joined = decodeJoined(encoder.welcome(0, Side.French, schedule, null), battlefield())
    const mirror = createSimulation({ map: battlefield(), seed: 7 })
    applySync(mirror, joined.sync)
    expect(joined.playerSquad).toBe(0)
    expect(joined.schedule).toEqual(schedule)

    let gas = 0
    let smoke = 0
    for (let message = 0; message < 150; message++) {
      steps(sim, source, 2)
      applySync(
        mirror,
        joined.decoder.decode(encoder.encode(source.take()).for("player", to(EVERY_CELL, soldierIds(sim))))
      )
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

  it("send the cells near a player's men every message, and the rest every few, each building on what they have", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    const encoder = encoderFor(sim)
    encoder.encode(source.take())
    const joined = decodeJoined(encoder.welcome(0, Side.French, schedule, null), battlefield())
    const mirror = createSimulation({ map: battlefield(), seed: 7 })
    applySync(mirror, joined.sync)
    const french = sim.squads[0]?.members ?? []
    const german = sim.squads[1]?.members ?? []
    const at = (world: Simulation, soldier: number) => [
      world.soldiers.position.x[soldier],
      world.soldiers.position.z[soldier]
    ]
    // The German squad advances too, so their men change every step.
    enqueueCommand(sim, { type: "squad-order", squad: 1, order: { kind: "advance", x: 60, z: 60 } })

    let bytesNear = 0
    let bytesFar = 0
    const farTurns: boolean[] = []
    const between: boolean[] = []
    for (let message = 1; message <= 60; message++) {
      steps(sim, source, 2)
      const encoded = encoder.encode(source.take())
      const mine = encoded.for("player", to(new Set([0]), french))
      bytesNear += encoded.for("watcher", to(EVERY_CELL, french)).byteLength
      bytesFar += mine.byteLength
      const germansBefore = german.map((soldier) => at(mirror, soldier))
      applySync(mirror, joined.decoder.decode(mine))
      // Their own men come every message, as they are.
      for (const soldier of french) {
        expect(mirror.soldiers.position.x[soldier]).toBeCloseTo(sim.soldiers.position.x[soldier] ?? 0, 2)
      }
      const germansNow = german.map((soldier) => at(mirror, soldier))
      if (message % FAR_EVERY === 0) {
        // The far men come every few messages, reckoned to within the drift allowed.
        farTurns.push(
          german.every(
            (soldier) =>
              Math.abs((mirror.soldiers.position.z[soldier] ?? 0) - (sim.soldiers.position.z[soldier] ?? 0)) <
              DRIFT + 0.01
          )
        )
      } else if (message > FAR_EVERY) {
        // In between, the page carries them along at the pace they were last sent.
        between.push(JSON.stringify(germansNow) !== JSON.stringify(germansBefore))
      }
    }
    expect(farTurns).toEqual(Array.from({ length: 60 / FAR_EVERY }, () => true))
    expect(between.length).toBeGreaterThan(40)
    expect(between.some(Boolean)).toBe(true)
    expect(bytesFar).toBeLessThanOrEqual(bytesNear)
  })

  it("send a man whole when he crosses into a player's near cell, and forget a player who's left", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    const encoder = encoderFor(sim)
    encoder.encode(source.take())
    const joined = decodeJoined(encoder.welcome(0, Side.French, schedule, null), battlefield())
    const mirror = createSimulation({ map: battlefield(), seed: 7 })
    applySync(mirror, joined.sync)
    const runner = sim.squads[1]?.members[0] ?? -1
    // Settle the player into following only their own cell.
    for (let message = 1; message <= FAR_EVERY; message++) {
      steps(sim, source, 2)
      applySync(mirror, joined.decoder.decode(encoder.encode(source.take()).for("player", to(new Set([0])))))
    }
    // A German far away is wounded, which the player isn't sent, then walks into their cell.
    sim.soldiers.health.value[runner] = 0.42
    steps(sim, source, 2)
    applySync(mirror, joined.decoder.decode(encoder.encode(source.take()).for("player", to(new Set([0])))))
    expect(mirror.soldiers.health.value[runner]).not.toBeCloseTo(0.42)
    sim.soldiers.position.z[runner] = 20
    steps(sim, source, 2)
    applySync(mirror, joined.decoder.decode(encoder.encode(source.take()).for("player", to(new Set([0])))))

    expect(mirror.soldiers.health.value[runner]).toBeCloseTo(sim.soldiers.health.value[runner] ?? 0)
    encoder.forget("player")
    // Forgotten, the player would be sent everything again, as one just joined.
    steps(sim, source, 2)
    const fresh = encoder.encode(source.take())
    expect(fresh.for("player", to(new Set())).byteLength).toBe(fresh.for("newcomer", to(new Set())).byteLength)
  })

  it("send a quiet battle in a few bytes", () => {
    const sim = createSimulation({ map: battlefield(), seed: 7 })
    createSquad(sim, Side.French, [spawnSoldier(sim, { side: Side.French, x: 50, z: 40 })])
    const source = createSyncSource(sim)
    const encoder = encoderFor(sim)
    encoder.encode(source.take())
    steps(sim, source, 2)

    expect(encoder.encode(source.take()).for("player", to(EVERY_CELL)).byteLength).toBeLessThan(400)
  })

  it("welcome a late player to the battle as of the last message, craters and all, and build on it after", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    const encoder = encoderFor(sim)
    const generated = { heights: sim.map.heights.slice(), surfaces: sim.map.surfaces.slice() }
    for (let message = 0; message < 62; message++) {
      steps(sim, source, 2)
      encoder.encode(source.take())
    }
    stampCrater(sim.map, { x: 120, z: 30, radius: 3, depth: 1 })
    // Steps taken since the last message come with the next one.
    steps(sim, source, 1)

    const joined = decodeJoined(
      encoder.welcome(1, Side.German, schedule, groundMovement(sim.map, generated)),
      battlefield()
    )
    const mirror = createSimulation({ map: battlefield(), seed: 7 })
    applySync(mirror, joined.sync)
    steps(sim, source, 1)
    applySync(mirror, joined.decoder.decode(encoder.encode(source.take()).for("late", to(new Set(), soldierIds(sim)))))

    const { gas, smoke, ...real } = comparable(sim)
    const { gas: mirroredGas, smoke: mirroredSmoke, ...mirrored } = comparable(mirror)
    expectClose(mirrored, real)
    closeCloud(mirroredGas, gas)
    closeCloud(mirroredSmoke, smoke)
    mirror.map.heights.forEach((height, sample) => expect(height).toBeCloseTo(sim.map.heights[sample] ?? 0, 3))
  })

  it("send what only a man's own squad uses to his squad's player alone, and all of it to a man new to the squad", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    const encoder = encoderFor(sim)
    encoder.encode(source.take())
    const joined = decodeJoined(encoder.welcome(0, Side.French, schedule, null), battlefield())
    const mirror = createSimulation({ map: battlefield(), seed: 7 })
    applySync(mirror, joined.sync)
    const french = sim.squads[0]?.members ?? []
    const german = sim.squads[1]?.members ?? []
    const [german0 = -1] = german
    enqueueCommand(sim, { type: "squad-order", squad: 1, order: { kind: "advance", x: 60, z: 60 } })
    const message = () => {
      steps(sim, source, 2)
      applySync(mirror, joined.decoder.decode(encoder.encode(source.take()).for("player", to(EVERY_CELL, french))))
    }
    for (let count = 0; count < 20; count++) {
      message()
    }

    for (const soldier of french) {
      expect(mirror.soldiers.moveOrder.x[soldier]).toBe(sim.soldiers.moveOrder.x[soldier])
      expect(mirror.soldiers.position.z[soldier]).toBeCloseTo(sim.soldiers.position.z[soldier] ?? 0, 1)
    }
    // The Germans are drawn where they are, but their orders aren't the French player's to know.
    expect(mirror.soldiers.position.z[german0]).toBeCloseTo(sim.soldiers.position.z[german0] ?? 0, 1)
    expect(mirror.soldiers.moveOrder.z[german0]).not.toBe(sim.soldiers.moveOrder.z[german0])
    // Given a German, the player is sent all of him at once.
    steps(sim, source, 2)
    const taken = encoder.encode(source.take()).for("player", to(EVERY_CELL, [...french, german0]))
    applySync(mirror, joined.decoder.decode(taken))
    expect(mirror.soldiers.moveOrder.z[german0]).toBe(sim.soldiers.moveOrder.z[german0])
  })

  it("send each side only the enemies it can see, and say who they are", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    const encoder = encoderFor(sim)
    const french = sim.squads[0]?.members ?? []
    const [german0 = -1, german1 = -1] = sim.squads[1]?.members ?? []
    const sight = (frenchSee: number[]) =>
      new Map([
        [Side.French, new Set(frenchSee)],
        [Side.German, new Set(french)]
      ])
    encoder.encode(source.take(), sight([german1]))
    const joined = decodeJoined(encoder.welcome(0, Side.French, schedule, null), battlefield())
    const mirror = createSimulation({ map: battlefield(), seed: 7 })
    applySync(mirror, joined.sync)
    // A newcomer isn't told where the enemy they can't see are.
    expect(mirror.soldiers.position.z[german0]).toBe(0)
    expect(mirror.soldiers.position.z[german1]).toBeCloseTo(sim.soldiers.position.z[german1] ?? 0, 1)
    expect([...(joined.decoder.seen ?? [])]).toEqual([german1])
    enqueueCommand(sim, { type: "squad-order", squad: 1, order: { kind: "advance", x: 60, z: 60 } })
    const message = (frenchSee: number[]) => {
      steps(sim, source, 2)
      const encoded = encoder.encode(source.take(), sight(frenchSee))
      applySync(mirror, joined.decoder.decode(encoded.for("player", to(EVERY_CELL, french))))
    }

    for (let count = 0; count < 10; count++) {
      message([german1])
    }
    expect(mirror.soldiers.position.z[german0]).toBe(0)
    expect(mirror.soldiers.position.z[german1]).toBeCloseTo(sim.soldiers.position.z[german1] ?? 0, 1)
    // He comes into sight: he's sent whole, where he is.
    message([german0])
    expect(mirror.soldiers.position.z[german0]).toBeCloseTo(sim.soldiers.position.z[german0] ?? 0, 1)
    expect(mirror.soldiers.stance.value[german0]).toBe(sim.soldiers.stance.value[german0])
    expect([...(joined.decoder.seen ?? [])]).toEqual([german0])
    // Out of sight again, he's left where he was last seen.
    message([])
    const lastSeen = mirror.soldiers.position.z[german0]
    message([])
    expect(mirror.soldiers.position.z[german0]).toBe(lastSeen)
    expect(joined.decoder.seen?.size).toBe(0)
    expect(() => encoder.encode(source.take(), new Map()).for("player", to(EVERY_CELL))).toThrow(
      "The battle's sight has no side 0"
    )
  })

  it("can't welcome a player before the battle's first message", () => {
    expect(() => createSyncEncoder([], 100, 100).welcome(0, Side.French, schedule, null)).toThrow(
      "A player can't be welcomed before the battle's first sync"
    )
  })

  it("refuse what isn't a welcome or a sync, or a sync that doesn't fit the battle", () => {
    const packr = new Packr({ moreTypes: true, useRecords: false })
    const deflated = (value: unknown) => deflateSync(packr.pack(value))
    const sent = (global: unknown, cells: unknown[] = []) => packr.pack({ g: deflated(global), c: cells })
    const sim = fight()
    const encoder = encoderFor(sim)
    encoder.encode(createSyncSource(sim).take())
    const { decoder } = decodeJoined(encoder.welcome(0, Side.French, schedule, null), battlefield())

    expect(() => decodeJoined(deflated({ tick: 1 }), battlefield())).toThrow(
      "The server sent a welcome this client can't read"
    )
    expect(() => decoder.decode(packr.pack({ tick: 1 }))).toThrow("The server sent a sync this client can't read")
    expect(() => decoder.decode(sent({ tick: 1 }))).toThrow("The server sent a sync this client can't read")
    expect(() => decoder.decode(sent({ v: { f: { tick: "soon" } }, s: [], g: [] }))).toThrow(
      "The server's sync doesn't fit the battle this client has"
    )
    const listed = { tick: 1, soldiers: 1, members: { health: [0] }, state: {}, gas: {}, smoke: {} }
    expect(() => decoder.decode(sent({ v: { f: listed }, s: [], g: [] }))).toThrow(
      "The server's sync doesn't fit the battle this client has"
    )
    expect(() => decoder.decode(sent({ v: null, s: [], g: [] }, [[0, 3]]))).toThrow(
      "The server sent a cell this client can't read"
    )
    expect(() => decoder.decode(packr.pack({ g: deflated({ v: null, s: [], g: [] }), c: [], k: 3 }))).toThrow(
      "The server sent a sight this client can't read"
    )
    expect(decoder.decode(sent({ v: null, s: [], g: [] })).wire).toBeNull()
  })

  it("refuse soldiers' arrays they can't carry, and a welcome short of an array its layout names", () => {
    const sim = fight()
    const sync = createSyncSource(sim).take()
    expect(() =>
      createSyncEncoder([{ name: "position.x", type: "BigInt64Array" }], 150, 150, 100).encode(sync)
    ).toThrow("The soldiers' arrays hold a BigInt64Array, which can't be sent")

    const encoder = encoderFor(sim)
    encoder.encode(sync)
    const packr = new Packr({ moreTypes: true, useRecords: false })
    const welcome = packr.unpack(inflateSync(encoder.welcome(0, Side.French, schedule, null)))
    const short = deflateSync(packr.pack({ ...welcome, arrays: {} }))
    expect(() => decodeJoined(short, battlefield())).toThrow("The battle as sent has no ")
  })
})
