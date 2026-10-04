import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it } from "vitest"
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
    expect(closeUp.pipeline.bloomEnabled && closeUp.pipeline.grainEnabled).toBe(true)
    closeUp.dispose()
    overview.dispose()
  })
})
