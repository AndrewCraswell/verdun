import { readFileSync } from "node:fs"
import { decodeElevation, generateFleurySector, heightAt, sampleIndex } from "@verdun/map"
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
    expect(host.sight).toBeNull()
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
    // What the squad can see comes with the steps, worked out in the worker, once.
    const look = host.sight?.take()
    expect(look?.ground.some((cell) => cell > 0)).toBe(true)
    expect(look?.enemies).toBeInstanceOf(Int32Array)
    expect(host.sight?.take()).toBeNull()
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

  it("answers the page's questions of sight from the map as it is, with no physics, in a worker", async () => {
    vi.stubGlobal("Worker", InProcessWorker)
    const ground = map()
    const host = await createSimHost(ground, setup)
    hosts.push(host)
    const physics: LineOfSight = {
      isClear: () => false,
      rebuildRegion: () => 0,
      setSightHeight: () => undefined,
      dispose: () => undefined
    }
    host.attachLineOfSight(physics)

    // The page's sight lines stay its own light ones, read from the map.
    expect(host.sim.lineOfSight).toBe(host.sightLines)
    const from = { x: 300, y: heightAt(ground, 300, 200) + 1.6, z: 200 }
    const to = { x: 302, y: heightAt(ground, 302, 200) + 1.6, z: 200 }
    expect(host.sightLines.isClear(from, to)).toBe(true)
    // A ridge thrown up between them, as the ground changes, blocks the line at once: nothing to rebuild.
    for (let column = 0; column <= ground.columns; column++) {
      for (let row = 0; row <= ground.rows; row++) {
        if (Math.abs(column * ground.cellSize - 301) < 0.3) {
          ground.heights[sampleIndex(ground, column, row)] += 5
        }
      }
    }
    expect(host.sightLines.isClear(from, to)).toBe(false)
  })

  it("gives the simulation the physics' sight lines when it runs inline", async () => {
    const host = await createSimHost(map(), setup, true)
    hosts.push(host)
    const physics: LineOfSight = {
      isClear: () => false,
      rebuildRegion: () => 0,
      setSightHeight: () => undefined,
      dispose: () => undefined
    }
    host.attachLineOfSight(physics)

    expect(host.sim.lineOfSight).toBe(physics)
    expect(host.sightLines).toBe(physics)
  })
})
