import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createPostProcess } from "./post-process.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function setup(radius: number) {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const camera = new ArcRotateCamera("camera", 0, 1, radius, new Vector3(100, 5, 100), scene)
  return { scene, camera }
}

describe("createPostProcess", () => {
  it("focuses where the camera looks, with a shallower focus the further out it is", () => {
    const near = setup(15)
    const far = setup(160)
    const closeUp = createPostProcess(near.scene, near.camera)
    const overview = createPostProcess(far.scene, far.camera)
    if (!closeUp || !overview) {
      throw new Error("the pipeline should run on the null engine")
    }

    closeUp.update()
    overview.update()

    expect(closeUp.pipeline.depthOfField.focusDistance).toBeCloseTo(15_000)
    expect(overview.pipeline.depthOfField.focusDistance).toBeCloseTo(160_000)
    expect(overview.pipeline.depthOfField.fStop).toBeLessThan(closeUp.pipeline.depthOfField.fStop)
    // The focal length grows with the distance, keeping the same model-like focus.
    expect(overview.pipeline.depthOfField.focalLength / closeUp.pipeline.depthOfField.focalLength).toBeCloseTo(160 / 15)
    expect(closeUp.pipeline.samples).toBe(4)
    expect(closeUp.pipeline.fxaaEnabled).toBe(false)
    expect(closeUp.pipeline.bloomEnabled && closeUp.pipeline.grainEnabled).toBe(true)
    expect(closeUp.pipeline.depthOfFieldBlurLevel).toBe(DepthOfFieldEffectBlurLevel.Medium)
    closeUp.dispose()
    overview.dispose()
  })

  it("smooths edges with FXAA instead of multisampling on the low setting, blurs less and leaves out the grain", () => {
    const { scene, camera } = setup(40)
    const low = createPostProcess(scene, camera, { quality: "low" })
    if (!low) {
      throw new Error("the pipeline should run on the null engine")
    }

    expect(low.pipeline.samples).toBe(1)
    expect(low.pipeline.fxaaEnabled).toBe(true)
    expect(low.pipeline.depthOfFieldBlurLevel).toBe(DepthOfFieldEffectBlurLevel.Low)
    expect(low.pipeline.grainEnabled).toBe(false)
    // The bloom and the miniature's focus stay.
    expect(low.pipeline.bloomEnabled && low.pipeline.depthOfFieldEnabled).toBe(true)
    expect(low.pipeline.bloomScale).toBe(0.5)
    low.dispose()
  })

  it("draws the depth the focus reads at half the screen's size, leaving out what it's told to", () => {
    const { scene, camera } = setup(40)
    const engine = scene.getEngine()
    const post = createPostProcess(scene, camera, { inDepth: (mesh) => !mesh.name.startsWith("grass") })
    const depth = scene.enableDepthRenderer(camera).getDepthMap()

    expect(depth.getSize().width).toBe(Math.round(engine.getRenderWidth() / 2))
    const grass = new Mesh("grass", scene)
    const wall = new Mesh("wall", scene)
    expect(depth.getCustomRenderList?.(0, [grass, wall], 2)).toEqual([wall])
    expect(depth.getCustomRenderList?.(0, null, 0)).toEqual([])
    // It keeps to half the screen as the window changes size.
    vi.spyOn(engine, "getRenderWidth").mockReturnValue(400)
    vi.spyOn(engine, "getRenderHeight").mockReturnValue(300)
    engine.onResizeObservable.notifyObservers(engine)
    expect(depth.getSize()).toEqual({ width: 200, height: 150 })
    post?.dispose()
  })
})
