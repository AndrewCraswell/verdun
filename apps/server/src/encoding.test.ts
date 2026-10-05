import { createFlatMap } from "@verdun/map"
import { decodeJoined } from "@verdun/net"
import {
  applySync,
  createSimulation,
  createSquad,
  createSyncSource,
  scheduleForWeek,
  Side,
  soldierArrayLayout,
  spawnSoldier,
  stepSimulation
} from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createInlineEncoding, gridOf, type Messages } from "./encoding.ts"

const field = () => createFlatMap({ name: "field", cellSize: 1, columns: 300, rows: 300 })

describe("encoding the battle for each player", () => {
  it("makes each player's message from one encoding, every one their own copy, and welcomes as of the last", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const men = [10, 20].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 10 }))
    createSquad(sim, Side.French, men)
    const shape = { layout: soldierArrayLayout(sim), width: 300, depth: 300 }
    const encoding = createInlineEncoding(shape)
    expect(encoding.grid).toEqual(gridOf(shape))
    const source = createSyncSource(sim)
    encoding.encode(source.take(), null, new Map(), () => undefined)
    let welcome: Uint8Array = new Uint8Array()
    encoding.welcome(0, Side.French, scheduleForWeek(Date.UTC(1916, 5, 20), Date.UTC(2027, 5, 10)), null, (bytes) => {
      welcome = bytes
    })
    const joined = decodeJoined(welcome, field())
    const mirror = createSimulation({ map: field(), seed: 1 })
    applySync(mirror, joined.sync)

    stepSimulation(sim)
    source.stepped()
    sim.soldiers.position.x[men[0] ?? -1] = 12
    const recipient = { near: new Set([0]), side: Side.French, own: men }
    let delivered: Messages = new Map()
    encoding.encode(
      source.take(),
      null,
      new Map([
        ["player", recipient],
        ["other", recipient]
      ]),
      (messages) => {
        delivered = messages
      }
    )
    const mine = delivered.get("player")
    expect(delivered.size).toBe(2)
    expect(mine?.buffer).not.toBe(delivered.get("other")?.buffer)
    applySync(mirror, joined.decoder.decode(mine ?? new Uint8Array()))
    expect(mirror.soldiers.position.x[men[0] ?? -1]).toBeCloseTo(12)
    encoding.forget("player")
    encoding.close()
  })
})
