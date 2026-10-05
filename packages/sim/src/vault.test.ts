import { beltLayout, createFlatMap, Surface, type WireBelt } from "@verdun/map"
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
import { vaultLanding } from "./vault.ts"

/** A belt of wire running east-west across a flat field at z = 50, 100 m long: ten lengths of fence. */
const BELT: WireBelt = {
  points: [
    [0, 50],
    [100, 50]
  ]
}

function field(): Simulation {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass)
  return createSimulation({ map: { ...map, wire: [BELT] }, seed: 1 })
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

  it("climbs the staked fence where no tangle lies in his way, and is over in seconds", () => {
    const sim = field()
    const soldier = facingTheWire(sim, bare?.x ?? 0)
    const landing = vaultLanding(sim, soldier)
    expect(landing?.z).toBeGreaterThan(51.7)

    enqueueCommand(sim, { type: "vault", soldier })
    // Steering mid-climb doesn't pull him off the fence.
    enqueueCommand(sim, { type: "steer", soldier, x: 1, z: 0 })
    for (let step = 0; step < 6 * TICK_RATE; step++) {
      stepSimulation(sim)
    }
    expect(sim.soldiers.position.z[soldier]).toBeGreaterThan(51.7)
    expect(hasComponent(sim.world, soldier, sim.soldiers.vault)).toBe(false)
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
})
