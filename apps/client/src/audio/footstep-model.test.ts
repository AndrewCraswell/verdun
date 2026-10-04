import { createFlatMap, layOutFront, Surface } from "@verdun/map"
import { createSimulation, Side, type Simulation, spawnSoldier, Stance } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import type { Listener } from "./battle-sound-model.ts"
import { createFootstepModel, surfaceAt } from "./footstep-model.ts"

const LISTENER: Listener = { x: 100, z: 40, height: 30, rightX: 1, rightZ: 0 }
const open = () => 0

function battle(): { sim: Simulation; walker: number } {
  const flat = createFlatMap({ name: "sector", cellSize: 0.5, columns: 600, rows: 400 }, 5, Surface.Grass)
  const sim = createSimulation({ map: { ...flat, trenches: layOutFront(flat) }, seed: 1 })
  return { sim, walker: spawnSoldier(sim, { side: Side.French, x: 100, z: 40 }) }
}

/** Moves a soldier `metres` along x and runs the model over two steps, as the game would. */
function walk(
  sim: Simulation,
  model: ReturnType<typeof createFootstepModel>,
  id: number,
  metres: number,
  listener = LISTENER
) {
  sim.soldiers.position.x[id] = (sim.soldiers.position.x[id] ?? 0) + metres
  sim.tick += 2
  return model.step(listener)
}

describe("surfaceAt", () => {
  it("is snow when it lies, stone among the ruins, otherwise earth", () => {
    const { sim } = battle()
    expect(surfaceAt(sim, open, 0, 0)).toBe("step-earth")
    expect(surfaceAt(sim, () => 0.8, 0, 0)).toBe("step-stone")
    sim.environment.weather = { ...sim.environment.weather, snowCover: 5 }
    expect(surfaceAt(sim, () => 0.8, 0, 0)).toBe("step-snow")
  })
})

describe("createFootstepModel", () => {
  it("steps once a stride for a man walking close by", () => {
    const { sim, walker } = battle()
    const model = createFootstepModel(sim, open)
    sim.tick = 0
    expect(model.step(LISTENER)).toEqual([])
    // Walking pace: 0.25 m a check.
    expect(walk(sim, model, walker, 0.25)).toEqual([])
    expect(walk(sim, model, walker, 0.25)).toEqual([])
    expect(walk(sim, model, walker, 0.25).map((call) => call.cue)).toEqual(["step-earth"])
    expect(walk(sim, model, walker, 0)).toEqual([])
  })

  it("rattles a running man's kit with each stride", () => {
    const { sim, walker } = battle()
    const model = createFootstepModel(sim, open)
    sim.tick = 0
    model.step(LISTENER)
    expect(walk(sim, model, walker, 0.8).map((call) => call.cue)).toEqual(["step-earth", "gear"])
  })

  it("is silent for men lying down, and with the camera high", () => {
    const { sim, walker } = battle()
    const model = createFootstepModel(sim, open)
    sim.tick = 0
    model.step(LISTENER)
    sim.soldiers.stance.value[walker] = Stance.Prone
    expect(walk(sim, model, walker, 2)).toEqual([])
    sim.soldiers.stance.value[walker] = Stance.Standing
    expect(walk(sim, model, walker, 2, { ...LISTENER, height: 200 })).toEqual([])
  })
})
