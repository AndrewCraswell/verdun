import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine"
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation"
import type { Scene } from "@babylonjs/core/scene"
import type { Simulation } from "@verdun/sim"
import { debugDock } from "./dock.ts"
import { createFrameTimes, worldStats } from "./stats-model.ts"
import "./stats.css"

export interface DebugStats {
  /** Times a stretch of this frame's work under a name, such as the simulation's steps, and returns its result. */
  time<T>(part: string, work: () => T): T
  /** Records the frame and redraws the overlay when due. Call once a frame, after rendering. */
  update(): void
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

/**
 * A debug panel in the debug dock: frame rate and frame times, where the time goes, draw calls, and what's on the
 * battlefield. F3 shows and hides the dock. Babylon's instrumentation only runs while it's shown.
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
  const frames = createFrameTimes()
  let parts: Record<string, number> = {}
  let instrumentation: SceneInstrumentation | null = null
  let shown = false
  let sinceRedraw = Infinity

  function show(on: boolean): void {
    shown = on
    if (on && !instrumentation) {
      instrumentation = new SceneInstrumentation(scene)
      instrumentation.captureRenderTime = true
    } else if (!on && instrumentation) {
      instrumentation.dispose()
      instrumentation = null
    }
  }

  function redraw(): void {
    const world = worldStats(sim)
    const render = instrumentation?.renderTimeCounter.lastSecAverage ?? 0
    const timed = frames.partNames.map((name) => `, ${name} ${(frames.part(name) ?? 0).toFixed(1)} ms`).join("")
    const lines = [
      `${frames.fps.toFixed(0)} fps   frame ${frames.averageMs.toFixed(1)} ms, worst ${frames.worstMs.toFixed(1)} ms`,
      `render ${render.toFixed(1)} ms${timed}`,
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

  const unsubscribe = dock.onToggle(show)
  if (visible) {
    dock.show(true)
  } else {
    show(dock.visible)
  }

  return {
    time(part, work) {
      const start = performance.now()
      try {
        return work()
      } finally {
        parts[part] = (parts[part] ?? 0) + performance.now() - start
      }
    },
    update() {
      frames.add(engine.getDeltaTime(), parts)
      parts = {}
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
      instrumentation?.dispose()
      root.remove()
    }
  }
}
