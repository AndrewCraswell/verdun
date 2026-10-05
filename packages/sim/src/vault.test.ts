import { beltLayout, createFlatMap, sampleIndex, Surface, type WireBelt } from "@verdun/map"
import { hasComponent } from "bitecs"
import { describe, expect, it } from "vitest"
import { Side } from "./components.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { astrideFence, FENCE_CLIMB_SECONDS, isVaulting, startVault, vaultLanding } from "./vault.ts"

/** A belt of wire running east-west across a flat field at z = 50, 100 m long: ten lengths of fence. */
const BELT: WireBelt = {
  points: [
    [0, 50],
    [100, 50]
  ]
}

/** Every belt half torn down, as a bombardment leaves it: wreckage that can be climbed (intact wire can't). */
function brokenUp(sim: Simulation): Simulation {
  sim.wire.density.forEach((density, cell) => {
    sim.wire.density[cell] = density / 2
  })
  return sim
}

function field(intact = false): Simulation {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass)
  const sim = createSimulation({ map: { ...map, wire: [BELT] }, seed: 1 })
  return intact ? sim : brokenUp(sim)
}

/** A soldier 3 m short of the belt at `x`, facing it. */
function facingTheWire(sim: Simulation, x: number) {
  const soldier = spawnSoldier(sim, { side: Side.French, x, z: 47 })
  sim.soldiers.facing.x[soldier] = 0
  sim.soldiers.facing.z[soldier] = 1
  return soldier
}

const { fences, tangles } = beltLayout(BELT)
/** A length of fence with no tangle beside it, and one with. */
const bare = fences.find((fence) => !tangles.some((tangle) => Math.abs(tangle.x - fence.x) < 3))
const tangled = tangles[0]

describe("vaulting a wire fence", () => {
  it("lays the belt out as the art draws it: a fence in lengths, and tangles beside most of them", () => {
    expect(fences).toHaveLength(10)
    expect(tangles.length).toBeGreaterThan(3)
    expect(tangles.length).toBeLessThan(10)
    expect(bare).toBeDefined()
  })

  it("climbs the staked fence where no tangle lies in his way, taking a few seconds over the fence itself", () => {
    const sim = field()
    const soldier = facingTheWire(sim, bare?.x ?? 0)
    const landing = vaultLanding(sim, soldier)
    expect(landing?.z).toBeGreaterThan(51.7)

    enqueueCommand(sim, { type: "vault", soldier })
    // Steering mid-climb doesn't pull him off the fence.
    enqueueCommand(sim, { type: "steer", soldier, x: 1, z: 0 })
    let astride = 0
    let seconds = 0
    while (isVaulting(sim, soldier) || seconds === 0) {
      stepSimulation(sim)
      seconds += 1 / TICK_RATE
      if (astrideFence(sim, sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier])) {
        astride += 1 / TICK_RATE
      }
      expect(seconds).toBeLessThan(8)
    }
    // A barrier: astride it for the length of a climb, not stepped over at a walk.
    expect(astride).toBeGreaterThan(FENCE_CLIMB_SECONDS * 0.85)
    expect(astride).toBeLessThan(FENCE_CLIMB_SECONDS * 1.15)
    expect(sim.soldiers.position.z[soldier]).toBeGreaterThan(51.7)
  })

  it("won't climb a belt the guns haven't broken up", () => {
    const sim = field(true)
    const soldier = facingTheWire(sim, bare?.x ?? 0)

    expect(vaultLanding(sim, soldier)).toBeNull()
    expect(startVault(sim, soldier)).toBe(false)
  })

  it("won't climb where a tangle of coils lies across his way, nor with no wire ahead", () => {
    const sim = field()
    const snared = facingTheWire(sim, tangled?.x ?? 0)
    expect(vaultLanding(sim, snared)).toBeNull()
    enqueueCommand(sim, { type: "vault", soldier: snared })
    stepSimulation(sim)
    expect(hasComponent(sim.world, snared, sim.soldiers.vault)).toBe(false)

    const away = spawnSoldier(sim, { side: Side.French, x: 50, z: 20 })
    sim.soldiers.facing.z[away] = 1
    expect(vaultLanding(sim, away)).toBeNull()
  })

  it("won't climb a belt too deep to get over in one go, out of breath, or while already climbing", () => {
    const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass)
    // Three belts one behind another: twelve metres of wire.
    const deep = [48, 52, 56].map((z): WireBelt => ({
      points: [
        [0, z],
        [100, z]
      ]
    }))
    const sim = brokenUp(createSimulation({ map: { ...map, wire: deep }, seed: 1 }))
    const soldier = facingTheWire(sim, 50)
    expect(vaultLanding(sim, soldier)).toBeNull()

    const fresh = field()
    const winded = facingTheWire(fresh, bare?.x ?? 0)
    fresh.soldiers.stamina.spent[winded] = 1
    expect(startVault(fresh, winded)).toBe(false)
    fresh.soldiers.stamina.spent[winded] = 0
    expect(startVault(fresh, winded)).toBe(true)
    expect(startVault(fresh, winded)).toBe(false)

    const still = spawnSoldier(fresh, { side: Side.French, x: 30, z: 47 })
    fresh.soldiers.facing.x[still] = 0
    fresh.soldiers.facing.z[still] = 0
    expect(vaultLanding(fresh, still)).toBeNull()
  })
})

describe("vaulting a trench wall", () => {
  /** A field 3 m up with a trench 2 m deep along z = 48 to 52, and a soldier on its floor facing the far wall. */
  function inTheTrench() {
    const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 3, Surface.Grass)
    for (let row = 0; row <= map.rows; row++) {
      const z = row * map.cellSize
      if (z >= 48 && z <= 52) {
        for (let column = 0; column <= map.columns; column++) {
          map.heights[sampleIndex(map, column, row)] = 1
        }
      }
    }
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 50, z: 51 })
    sim.soldiers.facing.x[soldier] = 0
    sim.soldiers.facing.z[soldier] = 1
    return { sim, soldier }
  }

  it("vaults onto the parapet in a couple of seconds", () => {
    const { sim, soldier } = inTheTrench()
    const landing = vaultLanding(sim, soldier)
    expect(landing?.z).toBeGreaterThan(52)

    enqueueCommand(sim, { type: "vault", soldier })
    for (let step = 0; step < 3 * TICK_RATE; step++) {
      stepSimulation(sim)
    }
    expect(sim.soldiers.position.z[soldier]).toBeGreaterThan(52)
    expect(hasComponent(sim.world, soldier, sim.soldiers.vault)).toBe(false)
  })

  it("keeps a vault in a snapshot, and finds nothing to vault facing along the trench", () => {
    const { sim, soldier } = inTheTrench()
    enqueueCommand(sim, { type: "vault", soldier })
    stepSimulation(sim)
    const saved = takeSnapshot(sim)
    expect(saved.soldiers.find((state) => state.id === soldier)?.vault).toBeDefined()
    const restored = restoreSimulation(sim.map, saved)
    expect(hasComponent(restored.world, soldier, restored.soldiers.vault)).toBe(true)

    sim.soldiers.facing.x[soldier] = 1
    sim.soldiers.facing.z[soldier] = 0
    sim.soldiers.position.z[soldier] = 50
    expect(vaultLanding(sim, soldier)).toBeNull()
  })
})
