import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine"
import { Engine } from "@babylonjs/core/Engines/engine"
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine"
import { generatePrototypeSector } from "@verdun/map"
import { createFixedStepper, createSimulation, STEP_SECONDS, stepSimulation } from "@verdun/sim"
import { createBattlefieldScene } from "./battlefield-scene.ts"
import { setupSkirmish } from "./skirmish.ts"
import "./style.css"

/** WebGPU first, WebGL2 where the browser lacks it. */
async function createEngine(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
  if (await WebGPUEngine.IsSupportedAsync) {
    const engine = new WebGPUEngine(canvas, { antialias: true })
    await engine.initAsync()
    return engine
  }
  return new Engine(canvas, true)
}

async function start(): Promise<void> {
  const canvas = document.querySelector("canvas#battlefield")
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Battlefield canvas is missing from the page")
  }

  const engine = await createEngine(canvas)
  // Prototype sector: 600 m x 400 m at the simulation's 0.5 m resolution.
  const map = generatePrototypeSector({
    name: "Prototype sector",
    widthMeters: 600,
    depthMeters: 400,
    cellSize: 0.5,
    seed: 1916,
    amplitude: 14
  })
  const sim = createSimulation({ map, seed: 1916 })
  setupSkirmish(sim)

  const view = createBattlefieldScene(engine, sim, { attachControl: true })
  const stepper = createFixedStepper(STEP_SECONDS)
  if (import.meta.env.DEV) {
    // Dev-only handle for inspecting the running game from the browser console and automated checks.
    Object.assign(window, { verdun: { engine, sim, view } })
    const { installInspectorToggle } = await import("./dev/inspector.ts")
    installInspectorToggle(view.scene)
  }

  engine.runRenderLoop(() => {
    const steps = stepper.advance(engine.getDeltaTime() / 1000)
    for (let step = 0; step < steps; step++) {
      stepSimulation(sim)
    }
    if (steps > 0) {
      view.syncSoldiers()
    }
    view.scene.render()
  })
  window.addEventListener("resize", () => engine.resize())
}

start().catch((error: unknown) => {
  console.error(error)
})
