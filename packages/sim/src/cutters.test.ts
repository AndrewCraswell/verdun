import { createFlatMap, Surface, type WireBelt } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Side, Stance } from "./components.ts"
import { canCut, CUT_SECONDS, isCutting } from "./cutters.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { wireAt } from "./wire.ts"

/** An intact belt of wire across a flat field at z = 50, about 3.4 m deep. */
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

/** A soldier just short of the belt, facing it. */
function atTheWire(sim: Simulation, z = 47.8) {
  const soldier = spawnSoldier(sim, { side: Side.French, x: 40.5, z })
  sim.soldiers.facing.x[soldier] = 0
  sim.soldiers.facing.z[soldier] = 1
  return soldier
}

function stepFor(sim: Simulation, seconds: number) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
  }
}

describe("cutting wire", () => {
  it("cuts a lane through an intact belt in a quarter of a minute or so, crouched, and stops once through", () => {
    const sim = field()
    const soldier = atTheWire(sim)
    expect(canCut(sim, soldier)).toBe(true)
    enqueueCommand(sim, { type: "cut-wire", soldier })
    stepSimulation(sim)
    expect(isCutting(sim, soldier)).toBe(true)
    expect(sim.soldiers.stance.value[soldier]).toBe(Stance.Crouching)

    stepFor(sim, CUT_SECONDS * 2)
    // Partway: the near edge of the belt is cut, the far side still stands.
    expect(wireAt(sim.wire, 40.5, 48.5)).toBe(0)
    expect(wireAt(sim.wire, 40.5, 51.5)).toBeGreaterThan(0.5)

    // About half way through the lane, as the HUD's ring shows it.
    expect(sim.soldiers.cutting.progress[soldier]).toBeGreaterThan(0.3)
    expect(sim.soldiers.cutting.progress[soldier]).toBeLessThan(0.75)

    let seconds = CUT_SECONDS * 2
    let progress = 0
    while (isCutting(sim, soldier)) {
      progress = sim.soldiers.cutting.progress[soldier]
      stepSimulation(sim)
      seconds += 1 / TICK_RATE
      expect(seconds).toBeLessThan(40)
    }
    expect(seconds).toBeGreaterThan(10)
    expect(progress).toBeGreaterThan(0.95)
    for (let z = 48.5; z <= 51.5; z += 1) {
      expect(wireAt(sim.wire, 40.5, z)).toBe(0)
    }
    // Neighbouring wire is untouched: a lane, not a gap.
    expect(wireAt(sim.wire, 43.5, 50.5)).toBe(1)
    // He edged on into his lane.
    expect(sim.soldiers.position.z[soldier]).toBeGreaterThan(48.5)
  })

  it("stops when he's steered away or the action key is pressed again", () => {
    const sim = field()
    const steered = atTheWire(sim)
    const pressed = spawnSoldier(sim, { side: Side.French, x: 60.5, z: 47.8 })
    sim.soldiers.facing.z[pressed] = 1
    sim.soldiers.facing.x[pressed] = 0
    enqueueCommand(sim, { type: "cut-wire", soldier: steered })
    enqueueCommand(sim, { type: "cut-wire", soldier: pressed })
    stepFor(sim, 1)
    expect(isCutting(sim, steered) && isCutting(sim, pressed)).toBe(true)

    enqueueCommand(sim, { type: "steer", soldier: steered, x: 1, z: 0 })
    enqueueCommand(sim, { type: "cut-wire", soldier: pressed })
    stepFor(sim, 0.2)
    expect(isCutting(sim, steered)).toBe(false)
    expect(isCutting(sim, pressed)).toBe(false)
  })

  it("won't start with no wire within reach, and keeps cutting across a save", () => {
    const sim = field()
    const far = atTheWire(sim, 44)
    expect(canCut(sim, far)).toBe(false)
    enqueueCommand(sim, { type: "cut-wire", soldier: far })
    const near = atTheWire(sim)
    enqueueCommand(sim, { type: "cut-wire", soldier: near })
    stepSimulation(sim)
    expect(isCutting(sim, far)).toBe(false)

    const restored = restoreSimulation(sim.map, takeSnapshot(sim))
    expect(isCutting(restored, near)).toBe(true)
  })
})
