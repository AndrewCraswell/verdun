import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import { Node } from "@babylonjs/core/node"
import type { Scene } from "@babylonjs/core/scene"

/**
 * Snapshot rendering (WebGPU only): the GPU commands of a frame are recorded once and replayed in later frames, so the
 * CPU no longer encodes every draw call every frame. Babylon's standard mode still runs the frame's JavaScript, so
 * everything held in GPU buffers keeps moving: the camera, lights, materials' values, meshes' positions and their thin
 * instances' matrices. What a replay can't change is which draws it makes: which meshes, how many instances each, with
 * which shaders, in which render passes. The director re-records whenever that changes:
 *
 * - at once, when a buffer a recording points at is about to be replaced or freed (a mesh disposed, a thin-instance
 *   buffer set anew): before the frame draws, or if it's already drawing, by dropping out of replay for the rest of it;
 * - from the next frame, when something is switched on or off;
 * - as each render pass ends, when it isn't the pass the recording made at that point (a pass that only runs now and
 *   then), dropping out of replay for the rest of the frame rather than replay a recording into the wrong pass;
 * - otherwise from a signature of what the last frame drew (the meshes in view, their instance counts and shaders, the
 *   camera, the render passes): when it differs from the recorded frame's, the next frame records afresh. A change can
 *   so show a frame late, as an object coming into view a frame after it should.
 *
 * Re-recording every frame costs more than not recording at all, so while the picture keeps changing (the camera
 * moving, say) the director stands aside and renders normally, and takes up recording again once it's been still for a
 * moment.
 */
export interface SnapshotDirector {
  /** Whether frames are being replayed from a recording now. */
  readonly playing: boolean
  /** Recordings started in the last second, and why the latest was. */
  readonly recordsPerSecond: number
  readonly lastReason: string
  /**
   * Asks for a fresh recording before the next frame draws, for a change the director can't see for itself, and stops
   * replaying the frame drawing now, if any: for changes that free or replace what a recording points at.
   */
  invalidate(reason: string): void
  /** Asks for a fresh recording from the next frame on, letting the frame drawing now finish as it is. */
  recordNext(reason: string): void
  /** Call once a frame, before rendering the scene. */
  beforeRender(): void
  /** Call once a frame, after rendering the scene. */
  afterRender(): void
  dispose(): void
}

export interface SnapshotDirectorOptions {
  /** Frames the signature must hold before recording resumes after the director stood aside. */
  readonly settleFrames?: number
  /** Recordings within a second past which the director stands aside. */
  readonly maxRecordsPerSecond?: number
}

/** What the director needs of the engine: Babylon's engines have it, and a test can stand in for one. */
export interface SnapshotEngine {
  readonly isWebGPU: boolean
  snapshotRendering: boolean
  snapshotRenderingMode: number
}

/** Babylon's standard snapshot mode: JavaScript runs as usual and the recorded GPU commands are replayed. */
const SNAPSHOTRENDERING_STANDARD = 0

/** Directors watching for changes, for the patched Babylon methods below to tell. */
const directors = new Set<SnapshotDirector>()
let patched = false

/**
 * Wraps the Babylon methods that replace or free what a recording points at, so every director hears of it before the
 * frame draws. Done once, for the page.
 */
function watchBabylon(): void {
  if (patched) {
    return
  }
  patched = true
  const tell = (reason: string) => {
    for (const director of directors) {
      director.invalidate(reason)
    }
  }
  const mention = (reason: string) => {
    for (const director of directors) {
      director.recordNext(reason)
    }
  }
  const setBuffer = Mesh.prototype.thinInstanceSetBuffer
  Mesh.prototype.thinInstanceSetBuffer = function (this: Mesh, ...args: Parameters<typeof setBuffer>) {
    tell(`instance buffer set on ${this.name}`)
    return setBuffer.apply(this, args)
  }
  const dispose = Mesh.prototype.dispose
  Mesh.prototype.dispose = function (this: Mesh, ...args: Parameters<typeof dispose>) {
    tell(`${this.name} disposed`)
    return dispose.apply(this, args)
  }
  const setEnabled = Node.prototype.setEnabled
  Node.prototype.setEnabled = function (this: Node, value: boolean) {
    // Switching off frees nothing a recording points at, so the frame drawing now can finish its replay.
    if (this.isEnabled(false) !== value) {
      mention(`${this.name} ${value ? "enabled" : "disabled"}`)
    }
    return setEnabled.call(this, value)
  }
}

/** A running hash of numbers, cheap enough to take over every drawn mesh each frame. */
function createHash() {
  let value = 2166136261
  return {
    add(number: number) {
      value = Math.imul(value ^ (number | 0), 16777619)
      value = Math.imul(value ^ ((number * 1024) | 0), 16777619)
    },
    get value() {
      return value >>> 0
    }
  }
}

/** The shaders a mesh draws with, as the unique ids of its sub-meshes' effects. */
function effectIds(mesh: AbstractMesh, add: (id: number) => void): void {
  for (const subMesh of mesh.subMeshes ?? []) {
    add(subMesh.effect?.uniqueId ?? -1)
  }
}

/** Builds a snapshot director for a scene on a WebGPU engine. On any other engine it does nothing. */
export function createSnapshotDirector(
  engine: SnapshotEngine,
  scene: Scene,
  { settleFrames = 20, maxRecordsPerSecond = 6 }: SnapshotDirectorOptions = {}
): SnapshotDirector {
  const supported = engine.isWebGPU
  let recordedSignature: number | null = null
  let pending: string | null = "start"
  let standingAside = false
  let stillFrames = 0
  let lastSignature = 0
  let recordTimes: number[] = []
  let lastReason = ""
  // The render passes of the recorded frame, by the render target each drew into, and those of the frame drawing now.
  let recordedPasses: unknown[] = []
  let framePasses: unknown[] = []
  // Whether a frame is drawing: between beforeRender and afterRender.
  let drawing = false
  const replaying = () => engine.snapshotRendering && recordedSignature !== null && !standingAside
  /** Stops replaying for the rest of this frame: it draws normally, and the next records afresh. */
  const dropOut = (reason: string) => {
    pending ??= reason
    if (drawing && replaying()) {
      engine.snapshotRendering = false
      recordedSignature = null
    }
  }

  const signature = (): number => {
    const hash = createHash()
    const camera = scene.activeCamera
    if (camera) {
      // The view moves the shadow cascades and decides what's culled: hold it to a centimetre and a few hundredths of
      // a degree.
      const view = camera.getViewMatrix().m
      for (let index = 0; index < 16; index++) {
        hash.add((view[index] ?? 0) * 100)
      }
      hash.add(camera.fov * 1000)
    }
    const active = scene.getActiveMeshes()
    hash.add(active.length)
    for (let index = 0; index < active.length; index++) {
      const mesh = active.data[index]
      if (!mesh) {
        continue
      }
      hash.add(mesh.uniqueId)
      hash.add(mesh instanceof Mesh && mesh.hasThinInstances ? mesh.thinInstanceCount : 0)
      effectIds(mesh, hash.add)
    }
    for (const light of scene.lights) {
      hash.add(light.isEnabled() ? light.uniqueId : -light.uniqueId)
    }
    hash.add(scene.postProcesses.length)
    return hash.value
  }

  const record = (reason: string) => {
    lastReason = reason
    recordTimes.push(performance.now())
    recordedSignature = null
    recordedPasses = []
    // Switching it off and on is Babylon's own reset: the next frame records.
    engine.snapshotRendering = false
    engine.snapshotRenderingMode = SNAPSHOTRENDERING_STANDARD
    engine.snapshotRendering = true
  }

  const standAside = (reason: string) => {
    lastReason = reason
    standingAside = true
    stillFrames = 0
    recordedSignature = null
    engine.snapshotRendering = false
  }

  // Watch each render pass end, to check a replayed frame makes the same passes as the recording.
  const endPass: unknown = Reflect.get(engine, "_endCurrentRenderPass")
  if (supported && typeof endPass === "function") {
    Reflect.set(engine, "_endCurrentRenderPass", function (this: SnapshotEngine, ...args: unknown[]) {
      // Babylon calls this with no pass open too; only passes that were open count.
      if (drawing && Reflect.get(engine, "_currentRenderPass")) {
        const target: unknown = Reflect.get(engine, "_currentRenderTarget") ?? null
        if (replaying() && recordedPasses[framePasses.length] !== target) {
          dropOut("render passes changed")
        }
        framePasses.push(target)
      }
      return Reflect.apply(endPass, this, args)
    })
  }

  const director: SnapshotDirector = {
    get playing() {
      return supported && replaying() && pending === null
    },
    get recordsPerSecond() {
      return recordTimes.length
    },
    get lastReason() {
      return lastReason
    },
    invalidate(reason) {
      if (supported && !standingAside) {
        dropOut(reason)
      }
    },
    recordNext(reason) {
      if (supported && !standingAside) {
        pending ??= reason
      }
    },
    beforeRender() {
      if (!supported) {
        return
      }
      const now = performance.now()
      recordTimes = recordTimes.filter((time) => now - time < 1000)
      framePasses = []
      drawing = true
      if (standingAside || pending === null) {
        return
      }
      if (recordTimes.length >= maxRecordsPerSecond) {
        standAside(`recording too often (${pending})`)
        pending = null
        return
      }
      record(pending)
      pending = null
    },
    afterRender() {
      if (!supported) {
        return
      }
      drawing = false
      const current = signature()
      if (standingAside) {
        stillFrames = current === lastSignature ? stillFrames + 1 : 0
        lastSignature = current
        if (stillFrames >= settleFrames) {
          // Settled: the recordings that made it stand aside are history.
          standingAside = false
          recordTimes = []
          pending = "settled"
        }
        return
      }
      if (!engine.snapshotRendering) {
        // Dropped out of replay during the frame: the next records afresh.
        return
      }
      if (recordedSignature === null) {
        // This frame was the recording.
        recordedSignature = current
        recordedPasses = [...framePasses]
        return
      }
      if (current !== recordedSignature) {
        pending ??= "what's drawn changed"
      } else if (framePasses.length !== recordedPasses.length) {
        pending ??= "render passes changed"
      }
    },
    dispose() {
      directors.delete(director)
      if (supported && typeof endPass === "function") {
        Reflect.set(engine, "_endCurrentRenderPass", endPass)
      }
      engine.snapshotRendering = false
    }
  }
  if (supported) {
    watchBabylon()
    directors.add(director)
  }
  return director
}
