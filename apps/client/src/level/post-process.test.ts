import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder"
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

  it("draws the depth again only when the view or what's in it changes", async () => {
    const { scene, camera } = setup(40)
    const engine = scene.getEngine()
    const ground = CreateGround("terrain-0-0", { width: 200, height: 200 }, scene)
    ground.position.set(100, 0, 100)
    ground.material = new StandardMaterial("ground", scene)
    const watching = scene.onBeforeCameraRenderObservable.observers.length
    const post = createPostProcess(scene, camera, { inDepth: (mesh) => mesh.name.startsWith("terrain-") })
    if (!post) {
      throw new Error("the pipeline should run on the null engine")
    }
    const depth = scene.enableDepthRenderer(camera)
    const drawn = vi.spyOn(depth.getDepthMap(), "render")
    // How many of the next frames draw the depth map.
    const draws = (frames: number) => {
      drawn.mockClear()
      for (let frame = 0; frame < frames; frame++) {
        scene.render()
      }
      return drawn.mock.calls.length
    }

    // Until the ground is ready to draw, it's drawn every frame, so the ground leaves no lasting hole in it.
    const ready = vi.spyOn(depth, "isReady").mockReturnValue(false)
    expect(draws(3)).toBe(3)
    ready.mockRestore()
    await vi.waitFor(() => expect(ground.subMeshes.every((subMesh) => depth.isReady(subMesh, false))).toBe(true))
    expect(draws(1)).toBe(1)
    expect(draws(5)).toBe(0)
    // The camera turning, its lens zooming, the window changing size and the caller saying the ground has changed each
    // draw it again at once, and only the once.
    const changes = [
      () => (camera.alpha += 0.1),
      () => (camera.fov *= 0.9),
      () => engine.onResizeObservable.notifyObservers(engine),
      () => post.redrawDepth()
    ]
    for (const change of changes) {
      change()
      expect(draws(1)).toBe(1)
      expect(draws(5)).toBe(0)
    }
    // While another camera draws, a dev tool's, it's drawn every frame, and again on coming back.
    scene.activeCamera = new ArcRotateCamera("dev", 1, 1, 80, Vector3.Zero(), scene)
    expect(draws(3)).toBe(3)
    scene.activeCamera = camera
    expect(draws(1)).toBe(1)
    expect(draws(5)).toBe(0)
    // Gone, it stops watching the camera, and the depth map is drawn every frame again for whatever else reads it.
    post.dispose()
    expect(scene.onBeforeCameraRenderObservable.observers).toHaveLength(watching)
    expect(draws(3)).toBe(3)
  })

  it("multisamples the scene's target alone, whichever effect came first as the pipeline was put together", () => {
    const { scene, camera } = setup(40)
    // The null engine can't multisample: let it, as WebGPU and WebGL 2 do, to see which passes would.
    const features: unknown = Reflect.get(scene.getEngine(), "_features")
    if (typeof features === "object" && features !== null) {
      Reflect.set(features, "supportMSAA", true)
    }
    scene.getEngine().getCaps().maxMSAASamples = 4
    const post = createPostProcess(scene, camera)
    if (!post) {
      throw new Error("the pipeline should run on the null engine")
    }
    const sampled = () => {
      const first = camera._getFirstPostProcess()
      expect(first).toBe(post.pipeline.depthOfField.getPostProcesses()?.[0])
      expect(first?.samples).toBe(4)
      const rest = camera._postProcesses.filter((postProcess) => postProcess !== null && postProcess !== first)
      expect(rest.length).toBeGreaterThan(5)
      expect(rest.map((postProcess) => [postProcess?.name, postProcess?.samples])).toEqual(
        rest.map((postProcess) => [postProcess?.name, 1])
      )
    }

    sampled()
    // Switched off and on again, as pnpm perf's probe does, the bloom comes first for a while.
    post.pipeline.depthOfFieldEnabled = false
    post.pipeline.depthOfFieldEnabled = true
    sampled()
    post.dispose()
  })

  it("draws the depth every frame when it draws everything the camera sees, moving or not", () => {
    const { scene, camera } = setup(40)
    const post = createPostProcess(scene, camera)
    const drawn = vi.spyOn(scene.enableDepthRenderer(camera).getDepthMap(), "render")
    for (let frame = 0; frame < 3; frame++) {
      scene.render()
    }

    expect(drawn).toHaveBeenCalledTimes(3)
    post?.dispose()
  })
})
