import { readFileSync } from "node:fs"
import { decodeElevation, generateFleurySector, mapDepth, mapWidth } from "@verdun/map"
import { createSyncEncoder, MESSAGE } from "@verdun/net"
import {
  createSimulation,
  createSyncSource,
  enqueueCommand,
  scheduleForWeek,
  setupSkirmish,
  soldierArrayLayout,
  type Simulation,
  stepSimulation,
  type SyncSource
} from "@verdun/sim"
import { describe, expect, it, vi } from "vitest"
import { createInlineDecoding, type Decoding } from "./decoding.ts"
import { type SectorConnection, serverHost } from "./server-host.ts"
import type { BattleSetup } from "./sim-protocol.ts"

const elevation = readFileSync(new URL("../../../../packages/map/data/fleury-elevation.bin", import.meta.url))
const setup: BattleSetup = {
  elevation: elevation.buffer.slice(elevation.byteOffset, elevation.byteOffset + elevation.byteLength),
  mapSeed: 1916,
  simSeed: 1916,
  region: "fleury",
  weatherSeed: 1916
}
const map = () => generateFleurySector({ seed: 1916, elevation: decodeElevation(setup.elevation) })
const schedule = scheduleForWeek(Date.UTC(1916, 5, 20), Date.UTC(2027, 5, 10, 18))

/** A sector server in this thread: the battle stepped by hand, sent to the page as the real one sends it. */
class FakeServer implements SectorConnection {
  readonly sim: Simulation = createSimulation({ map: map(), seed: 1916 })
  readonly squad = setupSkirmish(this.sim).playerSquad
  readonly received: unknown[] = []
  private readonly source: SyncSource = createSyncSource(this.sim)
  private readonly encoder = createSyncEncoder(
    soldierArrayLayout(this.sim),
    mapWidth(this.sim.map),
    mapDepth(this.sim.map)
  )
  private readonly handlers = new Map<string, (payload: unknown) => void>()
  private readonly leaving: ((code: number) => void)[] = []
  left = false

  private readonly welcome: boolean

  constructor(welcome = true) {
    this.welcome = welcome
  }

  send(type: string, message?: unknown): void {
    if (type === MESSAGE.ready && this.welcome) {
      this.step(1)
      this.encoder.encode(this.source.take())
      const welcome = this.encoder.welcome(this.squad.id, this.squad.side, schedule, null)
      setTimeout(() => this.handlers.get(MESSAGE.joined)?.(welcome))
    }
    if (type === MESSAGE.commands) {
      this.received.push(message)
    }
  }

  refuse(types: unknown): void {
    this.handlers.get(MESSAGE.refused)?.(types)
  }

  acknowledge(applied: unknown): void {
    this.handlers.get(MESSAGE.ack)?.(applied)
  }

  onMessage(type: string, callback: (payload: unknown) => void): void {
    this.handlers.set(type, callback)
  }

  onLeave(callback: (code: number) => void): void {
    this.leaving.push(callback)
  }

  leave(): void {
    this.left = true
  }

  close(code: number): void {
    for (const callback of this.leaving) {
      callback(code)
    }
  }

  step(count: number): void {
    for (let step = 0; step < count; step++) {
      stepSimulation(this.sim)
      this.source.stepped()
    }
  }

  sync(): void {
    // Every one of the map's cells, so the page is sent every man every message.
    const { columns, rows } = this.encoder.grid
    const everyCell = new Set(Array.from({ length: columns * rows }, (_, cell) => cell))
    this.handlers.get(MESSAGE.sync)?.(
      this.encoder
        .encode(this.source.take())
        .for("page", { near: everyCell, side: this.squad.side, own: this.squad.members })
    )
  }

  sendJunk(): void {
    this.handlers.get(MESSAGE.sync)?.({ tick: 1 })
  }
}

describe("the battle on a server, as the page sees it", () => {
  it("mirrors the server's battle and plays out its steps whatever the page asks", async () => {
    const server = new FakeServer()
    server.sync()
    const host = await serverHost(map(), setup, server)

    expect(host.remote).toBe(true)
    expect(host.sight).toBeNull()
    expect(host.schedule).toEqual(schedule)
    expect(host.playerSquad.id).toBe(server.squad.id)
    expect(host.sim.soldiers.position.x[host.playerSquad.leader]).toBeCloseTo(
      server.sim.soldiers.position.x[server.squad.leader] ?? 0,
      1
    )
    expect(host.update(5)).toEqual([])

    server.step(2)
    server.sync()
    expect(host.update(0).map((step) => step.tick)).toEqual([2, 3])
    expect(host.sim.tick).toBe(3)
  })

  it("keeps only the last two seconds of steps for a page that draws no frames, as a hidden tab", async () => {
    const server = new FakeServer()
    const host = await serverHost(map(), setup, server)
    for (let message = 0; message < 30; message++) {
      server.step(2)
      server.sync()
    }

    const taken = host.update(0)
    expect(taken.map((step) => step.tick)).toEqual(Array.from({ length: 40 }, (_, index) => 22 + index))
    expect(host.sim.tick).toBe(61)
  })

  it("sends the page's commands to the server", async () => {
    const server = new FakeServer()
    const host = await serverHost(map(), setup, server)
    enqueueCommand(host.sim, { type: "squad-order", squad: host.playerSquad.id, order: { kind: "follow" } })
    host.update(1)
    host.update(1)

    expect(server.received).toEqual([
      { step: 0, commands: [] },
      {
        step: expect.any(Number),
        commands: [{ type: "squad-order", squad: host.playerSquad.id, order: { kind: "follow" } }]
      }
    ])
  })

  it("moves the player's soldier at once, ahead of the server's word, once the server has acknowledged a command", async () => {
    const server = new FakeServer()
    let now = 0
    const host = await serverHost(map(), setup, server, () => now)
    const leader = host.playerSquad.leader
    const x = host.sim.soldiers.position.x[leader]
    enqueueCommand(host.sim, { type: "steer", soldier: leader, x: 1, z: 0 })
    host.update(0)
    server.acknowledge({ step: 0, tick: server.sim.tick + 1 })
    now += 1000
    host.update(0)

    // A second of walking, before the server has moved him at all.
    expect(host.sim.soldiers.position.x[leader] - x).toBeGreaterThan(0.5)
    server.sync()
    expect(host.sim.soldiers.position.x[leader] - x).toBeGreaterThan(0.5)
  })

  it("acknowledges a command only once the message being read in a worker is in the mirror", async () => {
    const server = new FakeServer()
    // Reading as the worker does: the sync comes back later, when let go.
    const inline = createInlineDecoding(map())
    const held: (() => void)[] = []
    const late: Decoding = {
      welcome: (bytes, taken) => inline.welcome(bytes, taken),
      decode: (bytes, taken) => {
        held.push(() => inline.decode(bytes, taken))
        return true
      },
      get seen() {
        return inline.seen
      },
      dispose: () => inline.dispose()
    }
    let now = 0
    const host = await serverHost(map(), setup, server, () => now, late)
    const leader = host.playerSquad.leader
    const x = host.sim.soldiers.position.x[leader]
    enqueueCommand(host.sim, { type: "steer", soldier: leader, x: 1, z: 0 })
    host.update(0)
    server.sync()
    server.acknowledge({ step: 0, tick: server.sim.tick + 1 })
    now += 1000
    host.update(0)
    expect(host.sim.soldiers.position.x[leader] - x).toBeLessThan(0.1)

    for (const letGo of held.splice(0)) {
      letGo()
    }
    host.update(0)
    expect(host.sim.soldiers.position.x[leader] - x).toBeGreaterThan(0.5)
    host.dispose()
  })

  it("says in the console which commands a dev server refused", async () => {
    const server = new FakeServer()
    const host = await serverHost(map(), setup, server)
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    server.refuse(["forecast", "flare"])
    server.refuse("nonsense")

    expect(warn).toHaveBeenNthCalledWith(1, "The server refused the page's forecast, flare")
    expect(warn).toHaveBeenNthCalledWith(2, "The server refused the page's commands")
    warn.mockRestore()
    host.dispose()
  })

  it("says when the server lets the page go, but not when the page leaves itself", async () => {
    const server = new FakeServer()
    const host = await serverHost(map(), setup, server)
    const lost = vi.fn<(code: number) => void>()
    host.onLost(lost)
    server.close(1006)
    expect(lost).toHaveBeenCalledWith(1006)

    const leaving = new FakeServer()
    const left = await serverHost(map(), setup, leaving)
    const quiet = vi.fn<(code: number) => void>()
    left.onLost(quiet)
    left.dispose()
    leaving.close(4000)
    expect(quiet).not.toHaveBeenCalled()
  })

  it("stops sending once the server has gone, and leaves when done", async () => {
    const server = new FakeServer()
    const host = await serverHost(map(), setup, server)
    server.close(4000)
    enqueueCommand(host.sim, { type: "fire", soldier: host.playerSquad.leader })
    host.update(1)
    host.attachLineOfSight(host.sightLines)
    host.dispose()

    expect(server.received).toEqual([{ step: 0, commands: [] }])
    expect(server.left).toBe(true)
  })

  it("fails if the server closes the battle before welcoming the player, and refuses what isn't the battle", async () => {
    const closed = new FakeServer(false)
    const joining = serverHost(map(), setup, closed)
    closed.close(4002)
    await expect(joining).rejects.toThrow("The server closed the battle (4002)")

    const server = new FakeServer()
    await serverHost(map(), setup, server)
    expect(() => server.sendJunk()).toThrow("The server sent the battle as something other than bytes")
  })
})
