import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine"
import { Engine } from "@babylonjs/core/Engines/engine"
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine"
import { displaySettings } from "../settings/display.ts"

/**
 * WebGPU first, WebGL2 where the browser lacks it or the player chose it in the options. Dev builds also take `?webgl`
 * to force WebGL2, for testing it. `?gputime`
 * times each frame's passes on the GPU, where the browser allows timestamp queries (see scripts/perf.mjs): asked for at
 * the start, since each render target takes its timer as it's made.
 *
 * Neither engine multisamples the canvas. The post-process pipeline multisamples the scene in a target of its own
 * (level/post-process.ts) and the canvas gets only the finished picture, so a multisampled canvas would add a resolve
 * of its own, and the memory for it, for nothing. The greybox, drawn without the pipeline, shows jagged edges.
 */
export async function createEngine(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
  const parameters = new URLSearchParams(location.search)
  const forceWebGL = displaySettings().current.renderer === "webgl" || (import.meta.env.DEV && parameters.has("webgl"))
  if (!forceWebGL && (await WebGPUEngine.IsSupportedAsync)) {
    const gpuTime = parameters.has("gputime")
    const engine = new WebGPUEngine(canvas, {
      antialias: false,
      ...(gpuTime ? { deviceDescriptor: { requiredFeatures: ["timestamp-query"] } } : {})
    })
    await engine.initAsync()
    engine.enableGPUTimingMeasurements = gpuTime
    return engine
  }
  // Without WebGPU, WebGL 2 or nothing: a browser with neither gets told so plainly (S23), not a blank page.
  if (!document.createElement("canvas").getContext("webgl2")) {
    throw unsupported()
  }
  try {
    return new Engine(canvas, false)
  } catch {
    throw unsupported()
  }
}

/** The error a browser that can't draw the battle raises: the menus know it by its name. */
function unsupported(): Error {
  const error = new Error("Neither WebGPU nor WebGL 2 is available")
  error.name = "UnsupportedBrowser"
  return error
}
