import { readFileSync } from "node:fs"
import { decodeElevation, generateFleurySector } from "@verdun/map"
import { enqueueCommand, type LineOfSight, Side } from "@verdun/sim"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createSimHost, type SimHost, type StepTaken } from "./sim-host.ts"
import type { BattleSetup, FromWorker, ToWorker } from "./sim-protocol.ts"
import { createSimRunner } from "./sim-runner.ts"

const elevation = readFileSync(new URL("../../../../packages/map/data/fleury-elevation.bin", import.meta.url))
const setup: BattleSetup = {
  elevation: elevation.buffer.slice(elevation.byteOffset, elevation.byteOffset + elevation.byteLength),
  mapSeed: 1916,
  simSeed: 1916,
  region: "fleury",
  weatherSeed: 1916
}
const map = () => generateFleurySector({ seed: 1916, elevation: decodeElevation(setup.elevation) })

/**
 * A worker in this thread: the real runner behind the same messages, each delivered a turn later as a worker's would
 * be, and cloned as a worker's would be.
 */
class InProcessWorker {
  private readonly listeners: ((event: { data: FromWorker }) => void)[] = []
  private readonly handle = createSimRunner((message) => {
    setTimeout(() => {
      const data = structuredClone(message)
      for (const listener of this.listeners) {
        listener({ data })
      }
    })
  })

  addEventListener(type: string, listener: (event: { data: FromWorker }) => void): void {
    if (type === "message") {
      this.listeners.push(listener)
    }
  }

  postMessage(message: ToWorker): void {
    const data = structuredClone(message)
    setTimeout(() => this.handle(data))
  }

  terminate(): void {
    this.listeners.length = 0
  }
}

/** Takes the steps that come back, frame by frame, until there are `count` of them. */
async function stepsTaken(host: SimHost, count: number): Promise<StepTaken[]> {
  const taken: StepTaken[] = []
  for (let frame = 0; frame < 200 && taken.length < count; frame++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
    taken.push(...host.update(0))
  }
  return taken
}

/** Lets the stand-in worker answer. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 100))

const hosts: SimHost[] = []
afterEach(() => {
  for (const host of hosts.splice(0)) {
    host.dispose()
  }
  vi.unstubAllGlobals()
})

describe("the simulation's host", () => {
  it("steps the simulation on the page when asked to run inline", async () => {
    const host = await createSimHost(map(), setup, true)
    hosts.push(host)
    enqueueCommand(host.sim, { type: "squad-order", squad: host.playerSquad.id, order: { kind: "hold" } })
    const taken = host.update(3)

    expect(host.inWorker).toBe(false)
    expect(taken.map((step) => step.tick)).toEqual([1, 2, 3])
    expect(host.sim.tick).toBe(3)
    expect(host.playerSquad.side).toBe(Side.French)
  })

  it("runs the simulation in a worker, mirrors it, and plays its steps out in order", async () => {
    vi.stubGlobal("Worker", InProcessWorker)
    const host = await createSimHost(map(), setup)
    hosts.push(host)

    expect(host.inWorker).toBe(true)
    expect(host.playerSquad).toBe(host.sim.squads[host.playerSquad.id])
    // Asked for now, the steps come back a turn later.
    expect(host.update(3)).toEqual([])
    const taken = await stepsTaken(host, 3)
    expect(taken.map((step) => step.tick)).toEqual([1, 2, 3])
    expect(host.sim.tick).toBe(3)
  })

  it("sends the commands queued on the mirror to the simulation, and asks for no more than a batch at a time", async () => {
    vi.stubGlobal("Worker", InProcessWorker)
    const host = await createSimHost(map(), setup)
    hosts.push(host)
    const squad = host.playerSquad
    enqueueCommand(host.sim, { type: "squad-order", squad: squad.id, order: { kind: "follow" } })

    // Every frame takes what has come back, as the game's loop does, until all twenty steps are in.
    const batches: number[] = []
    let asked = 20
    for (let frame = 0; frame < 200 && batches.reduce((sum, count) => sum + count, 0) < 20; frame++) {
      const taken = host.update(asked)
      asked = 0
      if (taken.length > 0) {
        batches.push(taken.length)
      }
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    expect(batches).toEqual([8, 8, 4])
    expect(squad.order).toEqual({ kind: "follow" })
    expect(host.sim.tick).toBe(20)
  })

  it("rebuilds the page's sight lines where craters have reshaped the ground", async () => {
    vi.stubGlobal("Worker", InProcessWorker)
    const host = await createSimHost(map(), setup)
    hosts.push(host)
    const rebuilt: number[][] = []
    const lineOfSight: LineOfSight = {
      isClear: () => true,
      rebuildRegion: (...area: number[]) => {
        rebuilt.push(area)
        return 0
      },
      setSightHeight: () => undefined,
      dispose: () => undefined
    }
    host.attachLineOfSight(lineOfSight)
    expect(host.sim.lineOfSight).toBe(lineOfSight)
    enqueueCommand(host.sim, {
      type: "fire-mission",
      plan: {
        side: Side.French,
        shell: 0,
        fromX: 250,
        toX: 350,
        z: 250,
        band: 20,
        roundsPerMinute: 600,
        delay: 0,
        duration: 60
      }
    })
    for (let frame = 0; frame < 120 && rebuilt.length === 0; frame++) {
      host.update(8)
      await settle()
    }

    expect(rebuilt.length).toBeGreaterThan(0)
  })
})
