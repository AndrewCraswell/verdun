import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine"
import { Engine } from "@babylonjs/core/Engines/engine"
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine"
import { type ChangedArea, decodeElevation, generateFleurySector, mergeAreas } from "@verdun/map"
import elevationUrl from "@verdun/map/data/fleury-elevation.bin?url"
import {
  createFixedStepper,
  createLineOfSight,
  shotEvents,
  createSimulation,
  STEP_SECONDS,
  TICK_RATE,
  stepSimulation
} from "@verdun/sim"
import { createBattleSounds } from "./audio/battle-sounds.ts"
import { createBattlefieldScene } from "./battlefield-scene.ts"
import { createBrowserInput } from "./control/browser-input.ts"
import { createPlayerControl } from "./control/player-control.ts"
import { createSquadMarkers } from "./control/soldier-marker.ts"
import { createDebugStats } from "./debug/stats.ts"
import { createExplosions } from "./effects/explosions.ts"
import { createTracers } from "./effects/tracers.ts"
import { createEnvironmentView } from "./environment/environment-view.ts"
import { createFogOfWar } from "./fog/fog-of-war.ts"
import { createHud } from "./hud/hud.ts"
import { blastRadius } from "./level/battle-damage.ts"
import { dressLevel } from "./level/dress-battlefield.ts"
import { openKitFiles } from "./level/kit-files.ts"
import { attackBehindBarrage, bombardEnemyLine, callForFire, callGasOn, setupSkirmish } from "./skirmish.ts"
import { createSoldierCrowd } from "./soldiers/soldier-crowd.ts"
import "./style.css"
import { loadSoldierKit } from "./soldiers/soldier-kit.ts"
import { createMenu } from "./ui/menu.ts"

/** WebGPU first, WebGL2 where the browser lacks it. Dev builds take `?webgl` to force WebGL2, for testing it. */
async function createEngine(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
  const forceWebGL = import.meta.env.DEV && new URLSearchParams(location.search).has("webgl")
  if (!forceWebGL && (await WebGPUEngine.IsSupportedAsync)) {
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
  // The Fleury sector: 600 m x 400 m at the simulation's 0.5 m resolution, on the real ground surveyed by IGN's LiDAR.
  const elevation = decodeElevation(await (await fetch(elevationUrl)).arrayBuffer())
  const map = generateFleurySector({ seed: 1916, elevation })
  // The weather cycles through the season's patterns from a seed until historical records replace it.
  const weatherSeed = 1916
  const sim = createSimulation({ map, seed: 1916, environment: { forecast: { kind: "cycle", seed: weatherSeed } } })
  const { playerSquad } = setupSkirmish(sim)

  const view = createBattlefieldScene(engine, sim, { attachControl: true })
  const hud = createHud(document.body, sim, playerSquad, TICK_RATE)
  const stats = createDebugStats(document.body, engine, view.scene, sim)
  const menu = createMenu(document.body, { development: import.meta.env.DEV })
  // One read of the kit for the level and the soldiers: in production that's one fetch and decryption of the pack.
  const kitFiles = openKitFiles()
  const level = await dressLevel(view, map, { wind: () => sim.wind, files: kitFiles })
  // Animated Synty soldiers in place of the capsules, when the kit has them.
  const soldierKit = level ? await loadSoldierKit(view.scene, kitFiles) : null
  kitFiles?.close?.()
  const soldiers = soldierKit ? createSoldierCrowd(view.scene, sim, soldierKit) : null
  if (soldiers) {
    view.useSoldierRenderer(soldiers)
  }
  const stepper = createFixedStepper(STEP_SECONDS)
  const environment = createEnvironmentView(view.scene, sim, view.camera, {
    materials: [view.groundMaterial, ...(level?.materials ?? [])],
    air: level?.atmosphere
  })

  // The player commands the squad in the middle of the French front line.
  const control = createPlayerControl(
    sim,
    playerSquad,
    view.camera,
    createBrowserInput(view.scene, view.terrain.meshes),
    {
      debugActions: import.meta.env.DEV,
      commands: {
        whistle: () => attackBehindBarrage(sim, playerSquad.side),
        bombard: () => bombardEnemyLine(sim, playerSquad.side),
        callFire: (x, z) => callForFire(sim, playerSquad.side, x, z),
        callGas: (x, z) => callGasOn(sim, playerSquad.side, x, z)
      },
      toggleFog: () => {
        fog.enabled = !fog.enabled
      }
    }
  )
  const markers = createSquadMarkers(view.scene, sim, playerSquad)
  // The battle's sound effects, heard from the camera, when the kit has them.
  const sounds = level?.sfx
    ? await createBattleSounds(level.sfx, sim, view.camera, {
        soldier: () => (control.soldier >= 0 ? control.soldier : null)
      })
    : null
  const lineOfSight = await createLineOfSight(map)
  sim.lineOfSight = lineOfSight
  const tracers = createTracers(view.scene)
  const explosions = createExplosions(view.scene)
  // Fog starts off while artillery and the attack are being tuned; O turns it on.
  const fog = createFogOfWar(view.scene, sim, lineOfSight, {
    squad: playerSquad,
    groundMaterial: view.groundMaterial,
    // Props darken with the ground they stand on.
    materials: level?.materials,
    enabled: false
  })
  view.camera.radius = 60
  if (import.meta.env.DEV) {
    // Dev-only handle for inspecting the running game from the browser console and automated checks.
    const { installDeathMap } = await import("./dev/death-map.ts")
    const deaths = installDeathMap(view.scene, sim)
    Object.assign(window, {
      verdun: { engine, sim, view, control, fog, lineOfSight, level, deaths, environment, soldiers, sounds }
    })
    const { installInspectorToggle } = await import("./dev/inspector.ts")
    installInspectorToggle(view.scene)
    const { installEnvironmentKeys } = await import("./dev/environment-keys.ts")
    installEnvironmentKeys(sim, weatherSeed)
  }

  let cratered: ChangedArea | null = null
  engine.runRenderLoop(() => {
    const frameSeconds = engine.getDeltaTime() / 1000
    control.update(frameSeconds)
    // Paused while the menu is open, or after P: the picture keeps moving, the battle doesn't.
    const steps = menu.paused ? 0 : stepper.advance(frameSeconds)
    stats.time("simulation", () => {
      for (let step = 0; step < steps; step++) {
        stepSimulation(sim)
        hud.record(sim.events)
        sounds?.step()
        tracers.add(shotEvents(sim.events))
        for (const event of sim.events) {
          if (event.type === "burst") {
            explosions.add([event])
            level?.aftermath.burst(event)
            if (event.crater) {
              cratered = mergeAreas(cratered, event.crater)
              level?.damage.blast(event.at.x, event.at.z, blastRadius(event.crater))
            }
          }
        }
      }
    })
    // Craters reshape the ground: rebuild the terrain chunks they touched, once per frame however many landed.
    const crater = cratered
    if (crater) {
      stats.time("terrain", () => view.terrain.rebuildRegion(crater.minX, crater.minZ, crater.maxX, crater.maxZ))
      cratered = null
    }
    tracers.update(frameSeconds)
    explosions.update(frameSeconds)
    hud.update(frameSeconds)
    const sightChanged = fog.update(frameSeconds)
    if (steps > 0 || sightChanged) {
      view.syncSoldiers(fog.isShown)
    }
    markers.update()
    environment?.update(frameSeconds)
    sounds?.update()
    view.scene.render()
    stats.update()
  })
  window.addEventListener("resize", () => engine.resize())
}

start().catch((error: unknown) => {
  console.error(error)
})
