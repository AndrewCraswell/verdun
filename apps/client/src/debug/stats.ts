import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine"
import "@babylonjs/core/Engines/WebGPU/Extensions/engine.query"
import { EngineInstrumentation } from "@babylonjs/core/Instrumentation/engineInstrumentation"
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation"
import type { Scene } from "@babylonjs/core/scene"
import type { Simulation } from "@verdun/sim"
import { debugDock } from "./dock.ts"
import { worldStats } from "./stats-model.ts"
import { createTracer, downloadTrace, type Tracer, traceScene } from "./trace.ts"
import "./stats.css"

export interface DebugStats {
  /** Times a stretch of this frame's work under a name, such as the simulation's steps, and returns its result. */
  time<T>(part: string, work: () => T): T
  /** Records the frame and redraws the overlay when due. Call once a frame, after rendering. */
  update(): void
  /** The frame tracer behind it, for timing work anywhere in the frame. */
  readonly tracer: Tracer
  /** Shows or hides the debug dock it lives in. F3 does the same. */
  toggle(): void
  readonly visible: boolean
  dispose(): void
}

/** The overlay redraws this often while shown, per second. */
const REDRAWS_PER_SECOND = 4
/** Chrome reports the JavaScript heap; other browsers don't. */
interface MemoryInfo {
  readonly usedJSHeapSize: number
}

function heapMegabytes(): string | null {
  const memory: unknown = Reflect.get(performance, "memory")
  if (typeof memory === "object" && memory !== null && "usedJSHeapSize" in memory) {
    const { usedJSHeapSize } = memory as MemoryInfo
    return `${(usedJSHeapSize / 1024 / 1024).toFixed(0)} MB heap`
  }
  return null
}

/** Seconds of frames an F4 capture records. */
const CAPTURE_SECONDS = 5

/**
 * A debug panel in the debug dock: frame rate and frame times, the GPU's time where the browser reports it, the hot
 * spots (the spans of work taking the most time a frame, from the tracer), draw calls, and what's on the battlefield.
 * F3 shows and hides the dock; F4 captures a few seconds of frames as a trace file to open in Perfetto. Babylon's
 * instrumentation only runs while the dock is shown.
 */
export function createDebugStats(
  _parent: HTMLElement,
  engine: AbstractEngine,
  scene: Scene,
  sim: Simulation,
  { visible = false }: { readonly visible?: boolean } = {}
): DebugStats {
  const dock = debugDock()
  const root = document.createElement("pre")
  root.className = "debug-stats"
  dock.element.append(root)
  const tracer = createTracer()
  const untrace = traceScene(scene, tracer)
  let instrumentation: SceneInstrumentation | null = null
  let gpu: EngineInstrumentation | null = null
  let captureNote = ""
  let shown = false
  let sinceRedraw = Infinity

  function show(on: boolean): void {
    shown = on
    if (on && !instrumentation) {
      instrumentation = new SceneInstrumentation(scene)
      instrumentation.captureRenderTime = true
      gpu = new EngineInstrumentation(engine)
      gpu.captureGPUFrameTime = true
    } else if (!on && instrumentation) {
      instrumentation.dispose()
      instrumentation = null
      gpu?.dispose()
      gpu = null
    }
  }

  function redraw(): void {
    const world = worldStats(sim)
    const { frames } = tracer
    // Babylon counts GPU time in nanoseconds, where the browser allows timestamp queries.
    const gpuMs = (gpu?.gpuFrameTimeCounter.lastSecAverage ?? 0) / 1e6
    const hot = tracer
      .hotSpots(10)
      .map(
        (spot) =>
          `  ${spot.selfMsPerFrame.toFixed(1).padStart(5)} ${spot.msPerFrame.toFixed(1).padStart(5)} ${spot.worstMs.toFixed(0).padStart(4)}  ${spot.name}`
      )
    const lines = [
      `${frames.perSecond.toFixed(0)} fps   frame ${frames.averageMs.toFixed(1)} ms, worst ${frames.worstMs.toFixed(1)} ms`,
      gpuMs > 0 ? `GPU ${gpuMs.toFixed(1)} ms a frame` : "GPU time not reported by this browser",
      "hot spots, ms a frame:  self  total  worst",
      ...hot,
      captureNote || "F4: capture a 5 s trace for Perfetto",
      `${instrumentation?.drawCallsCounter.current ?? 0} draw calls, ${scene.getActiveMeshes().length} active meshes`,
      `${engine.isWebGPU ? "WebGPU" : "WebGL2"}, ${engine.getRenderWidth()} x ${engine.getRenderHeight()}`,
      world.clock,
      `soldiers ${world.soldiers}`,
      `fallen ${world.fallen}`,
      `prisoners ${world.prisoners}`,
      world.artillery,
      world.clouds,
      world.wind,
      ...(heapMegabytes() ? [heapMegabytes() ?? ""] : [])
    ]
    root.textContent = lines.join("\n")
  }

  const onKey = (event: KeyboardEvent) => {
    if (event.code !== "F4" || event.repeat || tracer.capturing) {
      return
    }
    event.preventDefault()
    captureNote = `capturing ${CAPTURE_SECONDS} s of frames…`
    void tracer.capture(CAPTURE_SECONDS).then((trace) => {
      captureNote = `captured ${trace.traceEvents.length} spans: open the file in ui.perfetto.dev`
      downloadTrace(trace)
    })
  }
  window.addEventListener("keydown", onKey)
  const unsubscribe = dock.onToggle(show)
  if (visible) {
    dock.show(true)
  } else {
    show(dock.visible)
  }

  return {
    tracer,
    time(part, work) {
      return tracer.span(part, work)
    },
    update() {
      tracer.frame()
      if (!shown) {
        return
      }
      sinceRedraw += engine.getDeltaTime() / 1000
      if (sinceRedraw >= 1 / REDRAWS_PER_SECOND) {
        sinceRedraw = 0
        redraw()
      }
    },
    toggle() {
      dock.show(!dock.visible)
    },
    get visible() {
      return shown
    },
    dispose() {
      unsubscribe()
      untrace()
      window.removeEventListener("keydown", onKey)
      gpu?.dispose()
      instrumentation?.dispose()
      root.remove()
    }
  }
}
