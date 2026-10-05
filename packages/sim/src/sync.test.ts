import { createFlatMap, Surface, type WireBelt } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { Side } from "./components.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  soldierIds,
  spawnSoldier,
  stepSimulation
} from "./simulation.ts"
import { takeSnapshot } from "./snapshot.ts"
import { createSquad } from "./squads.ts"
import { applySync, createSyncSource, soldierArrayLayout } from "./sync.ts"

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

/** Two squads facing each other across the wire, a barrage on its way, and the French going forward. */
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

describe("keeping a mirror in step", () => {
  it("brings a mirror to the running simulation's state, step after step, craters, cut wire and all", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    const mirror = createSimulation({ map: battlefield(), seed: 7 })
    let bursts = 0
    for (let batch = 0; batch < 200; batch++) {
      // Batches of one to four steps, as a worker sends them.
      for (let step = 0; step <= batch % 4; step++) {
        stepSimulation(sim)
        bursts += sim.events.filter((event) => event.type === "burst").length
        source.stepped()
      }
      applySync(mirror, source.take())

      expect(comparable(mirror)).toEqual(comparable(sim))
    }
    expect(bursts).toBeGreaterThan(0)
    expect(mirror.map.heights).toEqual(sim.map.heights)
    expect(mirror.wire.density).toEqual(sim.wire.density)
    expect(soldierIds(mirror)).toEqual(soldierIds(sim))
  })

  it("updates the objects the client holds on to in place, rather than replacing them", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    const mirror = createSimulation({ map: battlefield(), seed: 7 })
    stepSimulation(sim)
    source.stepped()
    applySync(mirror, source.take())
    const squad = mirror.squads[0]
    const positions = mirror.soldiers.position.x

    for (let step = 0; step < 40; step++) {
      stepSimulation(sim)
      source.stepped()
    }
    const sync = source.take()
    applySync(mirror, sync)

    expect(mirror.squads[0]).toBe(squad)
    expect(mirror.soldiers.position.x).toBe(positions)
    expect(squad?.order).toEqual(sim.squads[0]?.order)
    // Every step's events come across, in order, for whatever plays them out step by step.
    expect(sync.steps.map((step) => step.tick)).toEqual(Array.from({ length: 40 }, (_, index) => index + 2))
  })
})

describe("the layout of the packed soldier arrays", () => {
  it("names every array the sync packs, in order, with its kind", () => {
    const sim = fight()
    const sync = createSyncSource(sim).take()
    const layout = soldierArrayLayout(sim)
    const sizes: Record<string, number> = {
      Float32Array: 4,
      Int32Array: 4,
      Uint32Array: 4,
      Uint16Array: 2,
      Int16Array: 2,
      Uint8Array: 1,
      Int8Array: 1
    }

    expect(layout.map((entry) => entry.name)).toContain("position.x")
    expect(layout.find((entry) => entry.name === "position.x")?.type).toBe("Float32Array")
    expect(layout.reduce((sum, entry) => sum + (sizes[entry.type] ?? 0), 0) * sync.soldiers).toBe(
      sync.arrays.byteLength
    )
  })
})

describe("craters off the map", () => {
  it("send no ground, as a shell that fell beyond the map's edge changed none of it", () => {
    const sim = fight()
    const source = createSyncSource(sim)
    source.take()
    stepSimulation(sim)
    sim.events.push({
      type: "burst",
      shell: Shell.FieldHighExplosive,
      at: { x: -40, y: 0, z: 20 },
      crater: { minX: -46, maxX: -34, minZ: 14, maxZ: 26 }
    })
    source.stepped()

    expect(source.take().ground).toEqual([])
  })
})
