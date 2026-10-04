import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { generateRollingTerrain, heightAt } from "@verdun/map"
import { createSimulation, enqueueCommand, Side, spawnSoldier, Stance, stepSimulation, surrender } from "@verdun/sim"
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

  it("builds chunked terrain over the whole map", () => {
    const view = render(createSimulation({ map, seed: 1 }))

    // 120 m x 80 m in 64 m chunks: 2 x 2.
    expect(view.terrain.meshes).toHaveLength(4)
    expect(view.terrain.meshes.every((chunk) => chunk.getTotalVertices() > 0)).toBe(true)
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

  it("leaves out soldiers that aren't shown, such as enemies out of sight", () => {
    const sim = createSimulation({ map, seed: 1 })
    spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const hidden = spawnSoldier(sim, { side: Side.German, x: 50, z: 70 })
    spawnSoldier(sim, { side: Side.German, x: 60, z: 70 })
    const view = render(sim)
    view.syncSoldiers((soldier) => soldier !== hidden)

    expect(view.soldierMeshes[Side.French].thinInstanceCount).toBe(1)
    expect(view.soldierMeshes[Side.German].thinInstanceCount).toBe(1)
    expect(view.groundMaterial.name).toBe("ground")
  })

  it("draws the fallen lying down where they dropped, darker, and always", () => {
    const sim = createSimulation({ map, seed: 1 })
    const fallen = spawnSoldier(sim, { side: Side.German, x: 30, z: 30 })
    spawnSoldier(sim, { side: Side.German, x: 40, z: 30 })
    sim.pendingCommands.push({ type: "kill", soldier: fallen })
    stepSimulation(sim)
    const view = render(sim)
    view.syncSoldiers(() => false)

    expect(view.soldierMeshes[Side.German].thinInstanceCount).toBe(0)
    expect(view.fallenMeshes[Side.German].thinInstanceCount).toBe(1)
    const [lying] = view.fallenMeshes[Side.German].thinInstanceGetWorldMatrices()
    expect(lying?.getTranslation().y).toBeCloseTo(heightAt(map, 30, 30) + 0.28, 4)
  })

  it("lays prone soldiers flat, hides men down a dugout, and draws prisoners apart", () => {
    const sim = createSimulation({ map, seed: 1 })
    const prone = spawnSoldier(sim, { side: Side.French, x: 30, z: 30 })
    const sheltering = spawnSoldier(sim, { side: Side.French, x: 40, z: 30 })
    const prisoner = spawnSoldier(sim, { side: Side.German, x: 50, z: 30 })
    sim.soldiers.stance.value[prone] = Stance.Prone
    sim.soldiers.stance.value[sheltering] = Stance.Sheltering
    surrender(sim, prisoner)
    const view = render(sim)

    expect(view.soldierMeshes[Side.French].thinInstanceCount).toBe(1)
    const [lying] = view.soldierMeshes[Side.French].thinInstanceGetWorldMatrices()
    expect(lying?.getTranslation().y).toBeCloseTo(heightAt(map, 30, 30) + 0.28, 4)
    expect(view.soldierMeshes[Side.German].thinInstanceCount).toBe(0)
    expect(view.prisonerMeshes[Side.German].thinInstanceCount).toBe(1)
  })

  it("hands soldiers over to another renderer, hiding the capsules", () => {
    const sim = createSimulation({ map, seed: 1 })
    spawnSoldier(sim, { side: Side.French, x: 30, z: 30 })
    const view = render(sim)
    const synced: unknown[] = []
    const isShown = () => true
    view.useSoldierRenderer({ sync: (shown) => synced.push(shown) })
    view.syncSoldiers(isShown)

    expect(synced).toEqual([undefined, isShown])
    expect(view.soldierMeshes[Side.French].isEnabled()).toBe(false)
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
