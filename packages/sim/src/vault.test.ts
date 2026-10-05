import { beltLayout, createFlatMap, sampleIndex, type Scenery, Surface, type WireBelt } from "@verdun/map"
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
import { acrossFence, astrideFence, FENCE_CLIMB_SECONDS, isVaulting, startVault, vaultLanding } from "./vault.ts"

/** A belt of wire running east-west across a flat field at z = 50, 100 m long. */
const BELT: WireBelt = {
  points: [
    [0, 50],
    [100, 50]
  ]
}

/** A wooden fence at (x, 50), its rails running east-west (it faces north), and a low stone wall the same at (x, 70). */
const fenceAt = (x: number): Scenery => ({ kind: "knife-rest", x, z: 50, heading: 0, variant: 0, scale: 1 })
const wallAt = (x: number): Scenery => ({ kind: "wall", x, z: 70, heading: 0, variant: 0, scale: 1 })

function field(scenery: readonly Scenery[] = [], wire: readonly WireBelt[] = []): Simulation {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass)
  return createSimulation({ map: { ...map, scenery, wire }, seed: 1 })
}

/** A soldier at (x, z), facing north. */
function facingNorth(sim: Simulation, x: number, z: number) {
  const soldier = spawnSoldier(sim, { side: Side.French, x, z })
  sim.soldiers.facing.x[soldier] = 0
  sim.soldiers.facing.z[soldier] = 1
  return soldier
}

/** Steps until he's over, counting the seconds he spends astride. */
function climb(sim: Simulation, soldier: number) {
  let astride = 0
  let seconds = 0
  while (isVaulting(sim, soldier) || seconds === 0) {
    stepSimulation(sim)
    seconds += 1 / TICK_RATE
    if (astrideFence(sim, sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier])) {
      astride += 1 / TICK_RATE
    }
    if (seconds > 8) {
      break
    }
  }
  return { astride, seconds }
}

describe("climbing a wooden fence or a low wall", () => {
  it("walks into a fence and stops there, then climbs it, taking a few seconds over it, whatever the steering", () => {
    const sim = field([fenceAt(50)])
    const soldier = facingNorth(sim, 50, 47)
    enqueueCommand(sim, { type: "steer", soldier, x: 0, z: 1 })
    for (let step = 0; step < 3 * TICK_RATE; step++) {
      stepSimulation(sim)
    }
    // The rails stop him a body's half-width short.
    expect(sim.soldiers.position.z[soldier]).toBeLessThan(49.65)
    expect(sim.soldiers.position.z[soldier]).toBeGreaterThan(49.4)
    expect(acrossFence(sim, 50, sim.soldiers.position.z[soldier])).toEqual({ x: -0, z: -1 })

    expect(vaultLanding(sim, soldier)?.z).toBeCloseTo(50.5, 5)
    enqueueCommand(sim, { type: "vault", soldier })
    // Steering mid-climb doesn't pull him off the fence.
    enqueueCommand(sim, { type: "steer", soldier, x: 1, z: 0 })
    const { astride, seconds } = climb(sim, soldier)
    // A barrier: on it for the length of a climb, not stepped over at a walk.
    expect(seconds).toBeGreaterThan(FENCE_CLIMB_SECONDS * 0.9)
    expect(astride).toBeLessThan(FENCE_CLIMB_SECONDS * 1.15)
    expect(sim.soldiers.position.z[soldier]).toBeGreaterThan(50.45)
  })

  it("climbs a low stone wall the same way", () => {
    const sim = field([wallAt(50)])
    const soldier = facingNorth(sim, 50, 67)
    enqueueCommand(sim, { type: "steer", soldier, x: 0, z: 1 })
    for (let step = 0; step < 3 * TICK_RATE; step++) {
      stepSimulation(sim)
    }
    // Its stones stand 0.3 m either side of its line.
    expect(sim.soldiers.position.z[soldier]).toBeCloseTo(69.4, 3)
    expect(startVault(sim, soldier)).toBe(true)
    climb(sim, soldier)
    expect(sim.soldiers.position.z[soldier]).toBeGreaterThan(70.6)
  })

  it("won't climb a fence he heads along, past its end, out of reach, out of breath, or while already climbing", () => {
    const sim = field([fenceAt(50)])
    const along = facingNorth(sim, 46, 49.5)
    sim.soldiers.facing.x[along] = 1
    sim.soldiers.facing.z[along] = 0
    expect(vaultLanding(sim, along)).toBeNull()
    // Past its end, where he walks round.
    expect(vaultLanding(sim, facingNorth(sim, 53, 49.5))).toBeNull()
    expect(vaultLanding(sim, facingNorth(sim, 50, 45))).toBeNull()

    const winded = facingNorth(sim, 50.5, 49.5)
    sim.soldiers.stamina.spent[winded] = 1
    expect(startVault(sim, winded)).toBe(false)
    sim.soldiers.stamina.spent[winded] = 0
    expect(startVault(sim, winded)).toBe(true)
    expect(startVault(sim, winded)).toBe(false)

    const still = spawnSoldier(sim, { side: Side.French, x: 49, z: 49.5 })
    sim.soldiers.facing.x[still] = 0
    sim.soldiers.facing.z[still] = 0
    expect(vaultLanding(sim, still)).toBeNull()
  })

  it("comes down a little further on where the end of the next fence along leaves no room", () => {
    // The next fence's end stands just past where he'd come down.
    const sim = field([fenceAt(50), { kind: "knife-rest", x: 48, z: 50.7, heading: 0, variant: 0, scale: 1 }])
    const landing = vaultLanding(sim, facingNorth(sim, 50.1, 49.5))
    expect(landing?.z).toBeGreaterThan(50.5)
    expect(landing?.z).toBeLessThan(51.1)
  })

  it("won't come down onto ground far above or below him", () => {
    const sim = field([fenceAt(50)])
    // A ditch 2 m deep just past the fence.
    for (let row = 0; row <= sim.map.rows; row++) {
      if (row * sim.map.cellSize >= 50.3) {
        for (let column = 0; column <= sim.map.columns; column++) {
          sim.map.heights[sampleIndex(sim.map, column, row)] = 3
        }
      }
    }
    expect(vaultLanding(sim, facingNorth(sim, 50, 49.5))).toBeNull()
  })

  it("won't come down where there's no room past it", () => {
    // A tree just behind the fence.
    const sim = field([fenceAt(50), { kind: "tree", x: 50, z: 51, heading: 0, variant: 0, scale: 1 }])
    expect(vaultLanding(sim, facingNorth(sim, 50, 49.5))).toBeNull()
  })
})

describe("barbed wire", () => {
  it("is never climbed: not the staked fence of an intact belt, nor one the guns have broken up", () => {
    const sim = field([], [BELT])
    const { fences } = beltLayout(BELT)
    const soldier = facingNorth(sim, fences[3]?.x ?? 0, 47)
    expect(vaultLanding(sim, soldier)).toBeNull()
    expect(astrideFence(sim, fences[3]?.x ?? 0, 50)).toBe(false)

    sim.wire.density.forEach((density, cell) => {
      sim.wire.density[cell] = density / 2
    })
    expect(vaultLanding(sim, soldier)).toBeNull()
    enqueueCommand(sim, { type: "vault", soldier })
    stepSimulation(sim)
    expect(hasComponent(sim.world, soldier, sim.soldiers.vault)).toBe(false)
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
