import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap } from "@verdun/map"
import { createSimulation, FLARE, type Flare, flarePosition, Side, type Simulation } from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
import { createFlareView } from "./flare-view.ts"

const engines: NullEngine[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

const TICKS = 20

function setup(light = 0) {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const sky = new HemisphericLight("sky", Vector3.Up(), scene)
  sky.intensity = 0.3
  scene.fogColor = new Color3(0.1, 0.1, 0.12)
  const sim: Simulation = createSimulation({
    map: createFlatMap({ name: "field", cellSize: 1, columns: 400, rows: 400 }),
    seed: 1
  })
  const state = { tick: 0, light }
  const view = createFlareView(scene, {
    sim,
    tick: () => state.tick,
    light: () => state.light,
    focus: () => new Vector3(100, 0, 100)
  })
  const launch = (x: number, z: number, firedAt = 0): Flare => {
    const flare: Flare = {
      side: Side.French,
      fromX: x,
      fromZ: z - 100,
      x,
      z,
      vx: 1,
      vz: 0,
      firedAt,
      burnsOutAt: firedAt + FLARE.burnSeconds * TICKS
    }
    sim.flares.push(flare)
    return flare
  }
  return { scene, sim, state, view, launch, sky }
}

describe("the flare view", () => {
  it("draws a flare climbing from the trench, its star bright enough to bloom", () => {
    const { view, launch, state, scene } = setup()
    const flare = launch(100, 120)
    const smoke = scene.particleSystems.filter((system) => system.name.startsWith("flare-smoke"))
    expect(smoke).toHaveLength(12)
    expect(smoke.every((system) => system instanceof ParticleSystem && system.applyFog)).toBe(true)
    state.tick = 1 * TICKS
    view.update(0.016)
    expect(view.drawn).toHaveLength(1)
    const drawn = view.drawn[0]!
    expect(drawn.position.y).toBeCloseTo(flarePosition(flare, state.tick).y, 0)
    const core = scene.getMeshByName("flare-core-0")
    expect(core?.scaling.x).toBeGreaterThan(0)
    // Still climbing: the parachute hasn't opened.
    expect(scene.getMeshByName("flare-canopy-0")?.scaling.x).toBe(0)
    const material = core?.material
    expect(material instanceof StandardMaterial && material.emissiveColor.r > 1.05).toBe(true)
  })

  it("swings under its parachute and lights the ground beneath with the leading spot light", () => {
    const { view, launch, state, scene } = setup()
    const flare = launch(100, 100)
    state.tick = 8 * TICKS
    const positions: number[] = []
    for (let frame = 0; frame < 90; frame++) {
      view.update(1 / 30)
      positions.push(view.drawn[0]!.position.x - flarePosition(flare, state.tick).x)
    }
    // A pendulum: both ways, under a metre each side.
    expect(Math.min(...positions)).toBeLessThan(-0.3)
    expect(Math.max(...positions)).toBeGreaterThan(0.3)
    expect(Math.max(...positions.map(Math.abs))).toBeLessThan(1)
    // The parachute hangs open over the swing's pivot, a few metres up, glowing with the flare's light.
    const canopy = scene.getMeshByName("flare-canopy-0")
    // Shrunk away rather than disabled while closed, so the draw list stays the same; open now.
    expect(canopy?.isEnabled()).toBe(true)
    expect(canopy?.alwaysSelectAsActiveMesh).toBe(true)
    const pivot = flarePosition(flare, state.tick)
    expect(canopy?.position.x).toBeCloseTo(pivot.x, 5)
    expect((canopy?.position.y ?? 0) - view.drawn[0]!.position.y).toBeCloseTo(3.5, 1)
    expect(canopy?.scaling.x).toBeCloseTo(1.4, 5)
    const silk = canopy?.material
    expect(silk instanceof StandardMaterial && silk.emissiveColor.r > 0.3).toBe(true)
    const [lead, second] = view.lights
    expect(lead?.isEnabled()).toBe(true)
    expect(lead?.intensity).toBeGreaterThan(0.5)
    expect(lead?.position.y).toBeGreaterThan(40)
    expect(second?.intensity).toBe(0)
    // No shadows: they never showed, for all a shadow map's drawing (see flare-view.ts).
    expect(lead?.getShadowGenerator()).toBeNull()
  })

  it("burns brighter as it sinks, then gutters orange and goes out, its smoke lingering", () => {
    const { view, launch, state } = setup()
    const flare = launch(100, 100)
    state.tick = 6 * TICKS
    view.update(0.016)
    const high = view.lights[0]!.intensity
    state.tick = (FLARE.burnSeconds - 6) * TICKS
    view.update(0.016)
    expect(view.lights[0]!.intensity).toBeGreaterThan(high)
    state.tick = flare.burnsOutAt - 0.5 * TICKS
    view.update(0.016)
    expect(view.lights[0]!.diffuse.b).toBeLessThan(view.lights[0]!.diffuse.r)
    // Burnt out: the simulation drops it, the star goes, the drawing is freed once the smoke has gone.
    state.tick = flare.burnsOutAt + 1
    view.update(0.016)
    expect(view.drawn).toHaveLength(0)
  })

  it("brightens the night sky and the haze round a flare near the camera", () => {
    const { scene, view, launch, state, sky, sim } = setup()
    launch(100, 100)
    state.tick = 8 * TICKS
    sim.tick = state.tick
    const fogBefore = scene.fogColor.clone()
    view.update(0.016)
    expect(sky.intensity).toBeGreaterThan(0.3)
    expect(scene.fogColor.r).toBeGreaterThan(fogBefore.r)
  })

  it("makes do with one light on the low setting", () => {
    const engine = new NullEngine()
    engines.push(engine)
    const world = new Scene(engine)
    const sim = createSimulation({ map: createFlatMap({ name: "f", cellSize: 1, columns: 50, rows: 50 }), seed: 1 })
    const view = createFlareView(
      world,
      { sim, tick: () => 0, light: () => 0, focus: () => Vector3.Zero() },
      { quality: "low" }
    )
    expect(view.lights).toHaveLength(1)
    view.dispose()
  })

  it("keeps the lights off by day, though the flare is still drawn", () => {
    const { view, launch, state } = setup(1)
    launch(100, 100)
    state.tick = 8 * TICKS
    view.update(0.016)
    expect(view.drawn).toHaveLength(1)
    expect(view.lights.every((light) => !light.isEnabled())).toBe(true)
  })

  it("holds its lights on by day until let go", () => {
    const { view } = setup(1)

    view.hold(true)
    // The battle's own frame goes on meanwhile, and mustn't switch them off.
    view.update(0.016)
    expect(view.lights.every((light) => light.isEnabled())).toBe(true)
    view.hold(null)
    view.update(0.016)
    expect(view.lights.every((light) => !light.isEnabled())).toBe(true)
  })

  it("draws a dozen flares at most, and frees each drawing for the next", () => {
    const { view, launch, state, sim } = setup()
    for (let index = 0; index < 15; index++) {
      launch(20 + index * 20, 100)
    }
    state.tick = 5 * TICKS
    view.update(0.016)
    expect(view.drawn).toHaveLength(12)
    sim.flares.length = 0
    for (let frame = 0; frame < 9; frame++) {
      view.update(1)
    }
    launch(100, 100, state.tick)
    view.update(0.016)
    expect(view.drawn).toHaveLength(1)
    view.dispose()
  })
})
