import { carveTrenches, createFlatMap, type Trench } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { hitChance } from "./combat.ts"
import { MaskState, Side } from "./components.ts"
import {
  concentrationAt,
  createGasField,
  GAS_CELL,
  GAS_DETECTED,
  type GasField,
  gasTolerance,
  releaseGas,
  spreadGas
} from "./gas.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { isAlive } from "./squads.ts"

const flat = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5)

function stepFor(sim: Simulation, seconds: number) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
  }
}

function total(field: GasField): number {
  return field.concentration.reduce((sum, value) => sum + value, 0)
}

/** Concentration-weighted centre of the cloud, in metres. */
function centre(field: GasField): { x: number; z: number } {
  let x = 0
  let z = 0
  let sum = 0
  field.concentration.forEach((value, cell) => {
    x += value * ((cell % field.columns) + 0.5) * GAS_CELL
    z += value * (Math.floor(cell / field.columns) + 0.5) * GAS_CELL
    sum += value
  })
  return { x: x / sum, z: z / sum }
}

function spreadFor(field: GasField, wind: { x: number; z: number }, seconds: number) {
  for (let step = 0; step < seconds * 5; step++) {
    spreadGas(field, wind, 0.2)
  }
}

describe("gas clouds", () => {
  it("drift with the wind and spread as they go", () => {
    const field = createGasField(flat)
    releaseGas(field, 50, 100, 600_000)
    const peak = concentrationAt(field, 50, 100)
    spreadFor(field, { x: 2, z: 0 }, 20)

    const { x, z } = centre(field)
    expect(x).toBeGreaterThan(50 + 30)
    expect(x).toBeLessThan(50 + 50)
    expect(z).toBeCloseTo(102, 0)
    expect(concentrationAt(field, x, z)).toBeLessThan(peak / 10)
    expect(concentrationAt(field, x, z)).toBeGreaterThan(GAS_DETECTED)
  })

  it("thin away over minutes, and leave the field quiet once clear", () => {
    const field = createGasField(flat)
    releaseGas(field, 100, 100, 600_000)
    expect(field.active).toBe(true)
    const released = total(field)
    spreadFor(field, { x: 0, z: 0 }, 60)
    expect(total(field)).toBeGreaterThan(released * 0.7)
    expect(total(field)).toBeLessThan(released)

    spreadFor(field, { x: 0, z: 0 }, 1800)
    expect(field.active).toBe(false)
    expect(total(field)).toBe(0)
  })

  it("run into trenches and linger there", () => {
    const trench: Trench = {
      kind: "fire",
      points: [
        [20, 100],
        [180, 100]
      ],
      facing: "north"
    }
    const map = createFlatMap({ name: "trench", cellSize: 0.5, columns: 400, rows: 400 }, 5)
    carveTrenches(map, [trench])
    const field = createGasField(map)
    releaseGas(field, 100, 112, 600_000)
    spreadFor(field, { x: 0, z: 0 }, 120)

    expect(concentrationAt(field, 100, 100)).toBeGreaterThan(3 * concentrationAt(field, 100, 112))
    expect(concentrationAt(field, 60, 100)).toBeGreaterThan(concentrationAt(field, 60, 112))
    expect(concentrationAt(field, -5, 100)).toBe(0)
  })

  it("is released by gas shells, whose small burster barely dents the ground", () => {
    const sim = createSimulation({ map: { ...flat, heights: flat.heights.slice() }, seed: 1 })
    sim.artillery.shells.push({ shell: Shell.FieldGas, side: Side.German, x: 100, z: 100, landsAtTick: sim.tick })
    stepSimulation(sim)

    expect(concentrationAt(sim.gas, 100, 100)).toBeGreaterThan(1000)
    expect(sim.events).toContainEqual(expect.objectContaining({ type: "burst", shell: Shell.FieldGas }))
  })
})

describe("gas masks", () => {
  function gassed(seed = 1) {
    const sim = createSimulation({ map: flat, seed, wind: { x: 0, z: 0 } })
    const near = spawnSoldier(sim, { side: Side.French, x: 100, z: 100 })
    const friend = spawnSoldier(sim, { side: Side.French, x: 140, z: 100 })
    const far = spawnSoldier(sim, { side: Side.French, x: 190, z: 190 })
    const enemy = spawnSoldier(sim, { side: Side.German, x: 120, z: 100 })
    for (let index = 0; index < 8; index++) {
      releaseGas(sim.gas, 100 + (index % 2) * 4, 100 + Math.floor(index / 2) * 4, 600_000)
    }
    return { sim, near, friend, far, enemy }
  }

  it("go on within seconds of smelling gas, and the alarm warns friends nearby", () => {
    const { sim, near, friend, far, enemy } = gassed()
    stepFor(sim, 0.5)

    expect(sim.soldiers.mask.state[near]).toBe(MaskState.Donning)
    expect(sim.soldiers.mask.state[friend]).toBe(MaskState.Donning)
    expect(sim.soldiers.mask.state[far]).toBe(MaskState.Off)
    expect(sim.soldiers.morale.value[near]).toBeLessThan(1)
    stepFor(sim, 12)
    expect([near, friend].map((soldier) => sim.soldiers.mask.state[soldier])).toEqual([MaskState.On, MaskState.On])
    // The enemy smelled it too, on his own.
    expect(sim.soldiers.mask.state[enemy]).not.toBe(MaskState.Off)
  })

  it("keep masked men alive in a cloud that disables the unmasked", () => {
    const { sim, near } = gassed()
    const unmasked = spawnSoldier(sim, { side: Side.German, x: 102, z: 102 })
    // Asleep, or fumbling a damaged mask: this one never gets it on.
    sim.soldiers.mask.state[unmasked] = MaskState.Donning
    sim.soldiers.mask.at[unmasked] = 2 ** 30
    stepFor(sim, 240)

    expect(isAlive(sim, near)).toBe(true)
    expect(sim.soldiers.gasDose.value[near]).toBeLessThan(gasTolerance(near))
    expect(isAlive(sim, unmasked)).toBe(false)
  })

  it("come off once the air has been clear for a minute", () => {
    const sim = createSimulation({ map: flat, seed: 1, wind: { x: 0, z: 0 } })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 100, z: 100 })
    releaseGas(sim.gas, 100, 100, 600_000)
    stepFor(sim, 15)
    expect(sim.soldiers.mask.state[soldier]).toBe(MaskState.On)

    enqueueCommand(sim, { type: "wind", x: 3, z: 0 })
    stepFor(sim, 60)
    expect(sim.soldiers.mask.state[soldier]).toBe(MaskState.On)
    stepFor(sim, 120)
    expect(sim.soldiers.mask.state[soldier]).toBe(MaskState.Off)
    expect(sim.wind).toEqual({ x: 3, z: 0 })
  })

  it("make a soldier shoot worse", () => {
    const sim = createSimulation({ map: flat, seed: 1 })
    const shooter = spawnSoldier(sim, { side: Side.French, x: 100, z: 100 })
    const target = spawnSoldier(sim, { side: Side.German, x: 100, z: 150 })
    const bare = hitChance(sim, shooter, target)
    sim.soldiers.mask.state[shooter] = MaskState.On

    expect(hitChance(sim, shooter, target)).toBeCloseTo(bare * 0.7)
  })

  it("and the cloud are saved and restored", () => {
    const { sim } = gassed()
    stepFor(sim, 3)
    const file = JSON.stringify(takeSnapshot(sim))
    const restored = restoreSimulation(flat, JSON.parse(file))
    stepFor(sim, 5)
    stepFor(restored, 5)

    expect(takeSnapshot(restored)).toEqual(takeSnapshot(sim))
    expect(restored.gas.active).toBe(true)
  })
})
