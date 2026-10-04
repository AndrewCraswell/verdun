import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it } from "vitest"
import { createSnapshotDirector, type SnapshotDirector } from "./snapshot-director.ts"

/** A WebGPU engine as far as the director can tell: snapshot switches, and a render pass hook to watch. */
function fakeWebGPU() {
  const engine = {
    isWebGPU: true,
    snapshotRendering: false,
    snapshotRenderingMode: 1,
    _currentRenderTarget: null as unknown,
    // A pass is open whenever one ends here; Babylon also calls the end with none open, which the director ignores.
    _currentRenderPass: {} as unknown,
    passesEnded: 0,
    _endCurrentRenderPass() {
      engine.passesEnded++
      return 0
    }
  }
  return engine
}

const opened: { dispose(): void }[] = []
afterEach(() => {
  for (const each of opened.splice(0)) {
    each.dispose()
  }
})

function world(engine = fakeWebGPU(), options = {}) {
  const babylon = new NullEngine()
  const scene = new Scene(babylon)
  const camera = new ArcRotateCamera("camera", 0, 1, 20, Vector3.Zero(), scene)
  scene.activeCamera = camera
  const box = CreateBox("box", { size: 1 }, scene)
  const crowd = CreateBox("crowd", { size: 1 }, scene)
  crowd.thinInstanceSetBuffer("matrix", new Float32Array(16 * 64), 16, false)
  crowd.thinInstanceCount = 32
  const director = createSnapshotDirector(engine, scene, options)
  opened.push(director, babylon)
  /** A frame: the director's hooks round a render that makes the given render passes. */
  const frame = (passes: unknown[] = [null]) => {
    director.beforeRender()
    scene.render()
    for (const target of passes) {
      engine._currentRenderTarget = target
      engine._endCurrentRenderPass()
    }
    director.afterRender()
  }
  return { engine, scene, camera, box, crowd, director, frame }
}

function settle(director: SnapshotDirector, frame: () => void, frames: number) {
  for (let index = 0; index < frames; index++) {
    frame()
  }
  return director
}

describe("the snapshot director", () => {
  it("records the first frame in standard mode, then replays while nothing drawn changes", () => {
    const { engine, director, frame } = world()
    frame()
    expect(engine.snapshotRendering).toBe(true)
    expect(engine.snapshotRenderingMode).toBe(0)
    expect(director.playing).toBe(true)

    settle(director, frame, 10)
    expect(director.recordsPerSecond).toBe(1)
    expect(director.playing).toBe(true)
  })

  it("drops out of replay at once when a mesh goes or a buffer is replaced, and records the next frame", () => {
    const { director, box, crowd, frame } = world()
    frame()
    box.dispose()
    expect(director.playing).toBe(false)
    frame()
    expect(director.recordsPerSecond).toBe(2)
    expect(director.lastReason).toBe("box disposed")
    expect(director.playing).toBe(true)

    crowd.thinInstanceSetBuffer("matrix", new Float32Array(16 * 128), 16, false)
    expect(director.playing).toBe(false)
    frame()
    expect(director.lastReason).toMatch(/instance buffer/)
  })

  it("records afresh after a frame draws a different number of instances, or from somewhere else", () => {
    const { director, crowd, camera, frame } = world()
    frame()
    crowd.thinInstanceCount = 64
    frame()
    expect(director.playing).toBe(false)
    frame()
    expect(director.recordsPerSecond).toBe(2)

    camera.alpha += 0.3
    frame()
    frame()
    expect(director.recordsPerSecond).toBe(3)
    expect(director.lastReason).toBe("what's drawn changed")
  })

  it("records afresh from the next frame when something is switched off, and only if it changed", () => {
    const { director, box, frame } = world()
    frame()
    box.setEnabled(true)
    expect(director.playing).toBe(true)
    box.setEnabled(false)
    expect(director.playing).toBe(false)
    frame()
    expect(director.lastReason).toBe("box disabled")
    expect(director.playing).toBe(true)
  })

  it("drops out mid-frame when a render pass isn't the one recorded, rather than replay into it", () => {
    const { director, frame } = world()
    const shadowMap = {}
    frame([shadowMap, null])
    frame([shadowMap, null])
    expect(director.playing).toBe(true)

    frame([{}, shadowMap, null])
    expect(director.playing).toBe(false)
    frame([{}, shadowMap, null])
    expect(director.lastReason).toBe("render passes changed")
    expect(director.playing).toBe(true)
  })

  it("ignores passes ended outside a frame, and pass ends with no pass open", () => {
    const { engine, director, scene, frame } = world()
    frame([null])
    // Between frames: doesn't count against the recording.
    engine._currentRenderTarget = {}
    engine._endCurrentRenderPass()
    // In a frame, ends with no pass open among the real one.
    director.beforeRender()
    scene.render()
    engine._currentRenderPass = null
    engine._endCurrentRenderPass()
    engine._currentRenderPass = {}
    engine._currentRenderTarget = null
    engine._endCurrentRenderPass()
    director.afterRender()
    frame([null])

    expect(director.recordsPerSecond).toBe(1)
    expect(director.playing).toBe(true)
  })

  it("stands aside while what's drawn keeps changing, and takes up recording once it settles", () => {
    const { engine, director, camera, frame } = world(fakeWebGPU(), { settleFrames: 3, maxRecordsPerSecond: 3 })
    // A frame that records can't be checked against itself: moving on every frame, every other frame records.
    for (let index = 0; index < 8; index++) {
      camera.alpha += 0.1
      frame()
    }
    expect(engine.snapshotRendering).toBe(false)
    expect(director.lastReason).toMatch(/recording too often/)

    settle(director, frame, 5)
    expect(engine.snapshotRendering).toBe(true)
    expect(director.lastReason).toBe("settled")
  })

  it("does nothing on an engine without snapshot rendering", () => {
    const engine = { ...fakeWebGPU(), isWebGPU: false }
    const { director, frame, box } = world(engine)
    frame()
    box.dispose()
    frame()
    expect(engine.snapshotRendering).toBe(false)
    expect(director.playing).toBe(false)
    expect(director.recordsPerSecond).toBe(0)
  })
})
