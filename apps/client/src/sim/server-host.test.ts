import { readFileSync } from "node:fs"
import { decodeElevation, generateFleurySector } from "@verdun/map"
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
import { describe, expect, it } from "vitest"
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
  private readonly encoder = createSyncEncoder(soldierArrayLayout(this.sim))
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
      const welcome = this.encoder.welcome(this.squad.id, schedule, null)
      setTimeout(() => this.handlers.get(MESSAGE.joined)?.(welcome))
    }
    if (type === MESSAGE.commands) {
      this.received.push(message)
    }
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
    this.handlers.get(MESSAGE.sync)?.(this.encoder.encode(this.source.take()))
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
    expect(host.sim.soldiers.position.x[host.playerSquad.leader]).toBe(
      server.sim.soldiers.position.x[server.squad.leader]
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

    expect(server.received).toEqual([[{ type: "squad-order", squad: host.playerSquad.id, order: { kind: "follow" } }]])
  })

  it("stops sending once the server has gone, and leaves when done", async () => {
    const server = new FakeServer()
    const host = await serverHost(map(), setup, server)
    server.close(4000)
    enqueueCommand(host.sim, { type: "fire", soldier: host.playerSquad.leader })
    host.update(1)
    host.attachLineOfSight(host.sightLines)
    host.dispose()

    expect(server.received).toEqual([])
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
