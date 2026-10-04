import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine"
import { Engine } from "@babylonjs/core/Engines/engine"
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine"
import { generatePrototypeSector } from "@verdun/map"
import { createFixedStepper, createLineOfSight, createSimulation, STEP_SECONDS, stepSimulation } from "@verdun/sim"
import { createBattlefieldScene } from "./battlefield-scene.ts"
import { createBrowserInput } from "./control/browser-input.ts"
import { createPlayerControl } from "./control/player-control.ts"
import { createSquadMarkers } from "./control/soldier-marker.ts"
import { createFogOfWar } from "./fog/fog-of-war.ts"
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
  const { playerSquad } = setupSkirmish(sim)

  const view = createBattlefieldScene(engine, sim, { attachControl: true })
  const stepper = createFixedStepper(STEP_SECONDS)

  // The player commands the squad in the middle of the French front line.
  const control = createPlayerControl(
    sim,
    playerSquad,
    view.camera,
    createBrowserInput(view.scene, view.terrain.meshes),
    { debugActions: import.meta.env.DEV }
  )
  const markers = createSquadMarkers(view.scene, sim, playerSquad)
  const lineOfSight = await createLineOfSight(map)
  const fog = createFogOfWar(view.scene, sim, lineOfSight, { squad: playerSquad, groundMaterial: view.groundMaterial })
  view.camera.radius = 60
  if (import.meta.env.DEV) {
    // Dev-only handle for inspecting the running game from the browser console and automated checks.
    Object.assign(window, { verdun: { engine, sim, view, control, fog, lineOfSight } })
    const { installInspectorToggle } = await import("./dev/inspector.ts")
    installInspectorToggle(view.scene)
  }

  engine.runRenderLoop(() => {
    const frameSeconds = engine.getDeltaTime() / 1000
    control.update(frameSeconds)
    const steps = stepper.advance(frameSeconds)
    for (let step = 0; step < steps; step++) {
      stepSimulation(sim)
    }
    const sightChanged = fog.update(frameSeconds)
    if (steps > 0 || sightChanged) {
      view.syncSoldiers(fog.isShown)
    }
    markers.update()
    view.scene.render()
  })
  window.addEventListener("resize", () => engine.resize())
}

start().catch((error: unknown) => {
  console.error(error)
})
