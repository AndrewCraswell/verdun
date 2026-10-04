import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { generateRollingTerrain, heightAt } from "@verdun/map"
import { createSimulation, enqueueCommand, Side, spawnSoldier, stepSimulation } from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
import { type BattlefieldView, CAMERA_TILT_DEGREES, createBattlefieldScene } from "./battlefield-scene.ts"

const map = generateRollingTerrain({
  name: "test",
  widthMeters: 120,
  depthMeters: 80,
  cellSize: 0.5,
  seed: 3,
  amplitude: 8
})

const engines: NullEngine[] = []

function render(sim: ReturnType<typeof createSimulation>): BattlefieldView {
  const engine = new NullEngine()
  engines.push(engine)
  return createBattlefieldScene(engine, sim)
}

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

describe("createBattlefieldScene", () => {
  it("frames the map from an angled top-down camera", () => {
    const view = render(createSimulation({ map, seed: 1 }))
    const tiltBelowHorizon = 90 - (view.camera.beta * 180) / Math.PI

    expect(tiltBelowHorizon).toBeCloseTo(CAMERA_TILT_DEGREES)
    expect(view.camera.target.x).toBeCloseTo(60)
    expect(view.camera.target.z).toBeCloseTo(40)
  })

  it("builds the terrain mesh from the map at a coarser step", () => {
    const view = render(createSimulation({ map, seed: 1 }))

    // 240 x 160 cells sampled every 4th: 61 x 41 vertices.
    expect(view.terrain.getTotalVertices()).toBe(61 * 41)
  })

  it("draws each side's soldiers on the ground, and follows them as they move", () => {
    const sim = createSimulation({ map, seed: 1 })
    const french = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    spawnSoldier(sim, { side: Side.German, x: 50, z: 70 })
    spawnSoldier(sim, { side: Side.German, x: 60, z: 70 })
    const view = render(sim)

    expect(view.soldierMeshes[Side.French].thinInstanceCount).toBe(1)
    expect(view.soldierMeshes[Side.German].thinInstanceCount).toBe(2)
    const [initial] = view.soldierMeshes[Side.French].thinInstanceGetWorldMatrices()
    expect(initial?.getTranslation().y).toBeCloseTo(heightAt(map, 10, 10) + 0.9, 4)

    enqueueCommand(sim, { type: "move-to", soldier: french, x: 10, z: 40 })
    for (let step = 0; step < 20; step++) {
      stepSimulation(sim)
    }
    view.syncSoldiers()

    const [moved] = view.soldierMeshes[Side.French].thinInstanceGetWorldMatrices()
    expect(moved?.getTranslation().z).toBeCloseTo(sim.soldiers.position.z[french])
    expect(moved?.getTranslation().z).toBeGreaterThan(10)
  })

  it("grows its instance buffers when more soldiers join", () => {
    const sim = createSimulation({ map, seed: 1 })
    spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const view = render(sim)

    for (let index = 0; index < 5; index++) {
      spawnSoldier(sim, { side: Side.French, x: 10 + index, z: 12 })
    }
    view.syncSoldiers()

    expect(view.soldierMeshes[Side.French].thinInstanceCount).toBe(6)
  })
})
