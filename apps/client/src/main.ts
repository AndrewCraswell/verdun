import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine"
import { Engine } from "@babylonjs/core/Engines/engine"
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine"
import { type ChangedArea, decodeElevation, generateFleurySector, mergeAreas } from "@verdun/map"
import elevationUrl from "@verdun/map/data/fleury-elevation.bin?url"
import surroundingsUrl from "@verdun/map/data/fleury-surroundings.bin?url"
import {
  createFixedStepper,
  createLineOfSight,
  shotEvents,
  loadWeatherRegion,
  WEATHER_REGIONS,
  STEP_SECONDS,
  TICK_RATE
} from "@verdun/sim"
import { createBattleSounds } from "./audio/battle-sounds.ts"
import { type Music, startMenuMusic, startMusic } from "./audio/music.ts"
import { createBattlefieldScene } from "./battlefield-scene.ts"
import { createBrowserInput } from "./control/browser-input.ts"
import { createPlayerControl } from "./control/player-control.ts"
import { createSquadMarkers } from "./control/soldier-marker.ts"
import { createDebugStats } from "./debug/stats.ts"
import { createExplosions } from "./effects/explosions.ts"
import { createFlareView } from "./effects/flare-view.ts"
import { createGrenadeView } from "./effects/grenades.ts"
import { bucketInstanceCounts } from "./effects/instance-buffer.ts"
import { createTracers } from "./effects/tracers.ts"
import { lightLevel } from "./environment/daylight.ts"
import { createEnvironmentView } from "./environment/environment-view.ts"
import { createWarClock } from "./environment/war-clock.ts"
import { browserStore, localSchedule } from "./environment/war-schedule.ts"
import { createFogOfWar } from "./fog/fog-of-war.ts"
import { createHud } from "./hud/hud.ts"
import { castsShadow } from "./level/atmosphere.ts"
import { blastRadius } from "./level/battle-damage.ts"
import { dressLevel } from "./level/dress-battlefield.ts"
import { openKitFiles } from "./level/kit-files.ts"
import { createNightLight } from "./level/night-light.ts"
import { useHeightFog } from "./level/particle-fog.ts"
import { createSnapshotDirector } from "./render/snapshot-director.ts"
import { displaySettings } from "./settings/display.ts"
import { graphicsQuality } from "./settings/graphics.ts"
import { createSimHost } from "./sim/sim-host.ts"
import { attackBehindBarrage, bombardEnemyLine, callForFire, callGasOn } from "./skirmish.ts"
import { createSoldierCrowd } from "./soldiers/soldier-crowd.ts"
import "./style.css"
import { loadSoldierKit } from "./soldiers/soldier-kit.ts"
import { createMenu } from "./ui/menu.ts"

/**
 * WebGPU first, WebGL2 where the browser lacks it or the player chose it in the options. Dev builds also take `?webgl`
 * to force WebGL2, for testing it. `?gputime`
 * times each frame's passes on the GPU, where the browser allows timestamp queries (see scripts/perf.mjs): asked for at
 * the start, since each render target takes its timer as it's made.
 */
async function createEngine(canvas: HTMLCanvasElement): Promise<AbstractEngine> {
  const parameters = new URLSearchParams(location.search)
  const forceWebGL = displaySettings().current.renderer === "webgl" || (import.meta.env.DEV && parameters.has("webgl"))
  if (!forceWebGL && (await WebGPUEngine.IsSupportedAsync)) {
    const gpuTime = parameters.has("gputime")
    const engine = new WebGPUEngine(canvas, {
      antialias: true,
      ...(gpuTime ? { deviceDescriptor: { requiredFeatures: ["timestamp-query"] } } : {})
    })
    await engine.initAsync()
    engine.enableGPUTimingMeasurements = gpuTime
    return engine
  }
  return new Engine(canvas, true)
}

async function start(): Promise<void> {
  const canvas = document.querySelector("canvas#battlefield")
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Battlefield canvas is missing from the page")
  }

  // The front door the game opens on, with the battle coming up behind it; ?play goes straight into the line, and so
  // does ?debug, for measuring (scripts/perf.mjs).
  const address = new URLSearchParams(location.search)
  const frontDoor = !address.has("play") && !address.has("debug")
  const build: unknown = import.meta.env.VERDUN_BUILD
  const menu = createMenu(document.body, {
    development: import.meta.env.DEV,
    frontDoor,
    build: typeof build === "string" ? build : "dev"
  })
  // The theme plays at the front door, and fades as the player goes into the line.
  if (frontDoor) {
    void startMenuMusic().then((theme) => menu.entered.then(() => theme?.stop()))
  }
  menu.progress("Starting the renderer", 0.04)
  const engine = await createEngine(canvas)
  // The battle draws at the player's render scale, changed at once from the options.
  displaySettings().listen(({ renderScale }) => engine.setHardwareScalingLevel(1 / renderScale))
  menu.progress("Surveying the ground", 0.12)
  // The Fleury sector: 600 m x 400 m at the simulation's 0.5 m resolution, on the real ground surveyed by IGN's LiDAR.
  const elevationData = await (await fetch(elevationUrl)).arrayBuffer()
  const elevation = decodeElevation(elevationData)
  const map = generateFleurySector({ seed: 1916, elevation })
  // History's weather, 1914-1918, in the map's region of the front (scripts/build-historical-weather.mjs), loaded before
  // the battle needs it; the seed drives gusts and showers.
  const weatherSeed = 1916
  const region = WEATHER_REGIONS.find((name) => name === map.weatherRegion) ?? "fleury"
  menu.progress("Reading the war's weather", 0.2)
  await loadWeatherRegion(region)
  // The simulation runs in a Web Worker, stepping off the page's thread; `sim` here is its mirror, brought up to date
  // as each batch of steps comes back. ?inline steps it on the page instead, as before.
  const host = await createSimHost(
    map,
    { elevation: elevationData, mapSeed: 1916, simSeed: 1916, region, weatherSeed },
    address.has("inline")
  )
  const { sim, playerSquad } = host
  // The war's calendar, until the war map runs it: kept between visits, so the war goes on a week each real day from the
  // battle's week; each daily cutoff moves the battle on a week and stands it to. Dev: ?war=1916-02-21, ?standto=0.
  const war = createWarClock(
    sim,
    localSchedule({
      week: sim.environment.clock.week,
      now: Date.now(),
      store: browserStore(),
      ...(import.meta.env.DEV ? { search: new URLSearchParams(location.search) } : {})
    })
  )

  menu.attach({ war, renderer: engine.isWebGPU ? "WebGPU" : "WebGL" })
  const view = createBattlefieldScene(engine, sim, { attachControl: true })
  // The war map's view shows the enemy only where the fog of war does: the men our side can see.
  const hud = createHud(document.body, sim, playerSquad, TICK_RATE, {
    war,
    view,
    seen: (soldier) => fog.isShown(soldier)
  })
  const stats = createDebugStats(document.body, engine, view.scene, sim)
  const trace = stats.tracer.span
  sim.systemTimer = trace
  // Replaying recorded frames on WebGPU (snapshot rendering) saves CPU, but the battle's frames are bound by the GPU
  // on the machines measured so far, so it gains nothing there, and a replay can't yet show particles that change from
  // frame to frame (shell bursts, smoke): off unless asked for with ?snapshot.
  const snapshots = new URLSearchParams(location.search).has("snapshot")
    ? createSnapshotDirector(engine, view.scene)
    : null
  stats.watchSnapshots(snapshots)
  bucketInstanceCounts(snapshots !== null)
  // One read of the kit for the level and the soldiers: in production that's one fetch and decryption of the pack.
  const kitFiles = openKitFiles()
  // The real ground round the sector out to the horizon: a 3 km survey centred on it (scripts/fetch-elevation.mjs).
  const surroundings = {
    elevation: decodeElevation(await (await fetch(surroundingsUrl)).arrayBuffer()),
    sectorBase: elevation.base,
    sectorOrigin: { x: 1200, z: 1300 }
  }
  menu.progress("Dressing the battlefield", 0.3)
  const level = await dressLevel(view, map, {
    wind: () => sim.wind,
    files: kitFiles,
    surroundings,
    wire: () => sim.wire,
    weather: () => sim.environment.weather
  })
  // Animated Synty soldiers in place of the capsules, when the kit has them.
  menu.progress("Bringing up the battalion", 0.6)
  const soldierKit = level ? await loadSoldierKit(view.scene, kitFiles) : null
  kitFiles?.close?.()
  const soldiers = soldierKit ? createSoldierCrowd(view.scene, sim, soldierKit) : null
  // After dark: braziers, fires and rifle flashes light the ground around them; flares come when the sim fires them.
  const night = level
    ? createNightLight(
        view.scene,
        {
          darkness: () => 1 - lightLevel(sim.environment.illuminance),
          // Whichever camera is drawing: the player's, or one a dev tool switched to.
          focus: () => {
            const camera = view.scene.activeCamera
            return camera instanceof TargetCamera ? camera.getTarget() : view.camera.getTarget()
          },
          fires: () => [...level.life.braziers, ...level.aftermath.fires].map((fire) => fire.position)
        },
        [view.groundMaterial, ...level.materials, ...(soldierKit?.materials ?? [])]
      )
    : null
  if (soldiers) {
    view.useSoldierRenderer(soldiers)
  }
  const stepper = createFixedStepper(STEP_SECONDS)
  // The graphics setting (Low drops the costliest effects), and the low-lying fog, on for now only with ?heightfog
  // until it's been measured: it replaces Babylon's distance fog on the ground, props, soldiers and smoke together.
  const quality = graphicsQuality(browserStore(), address)
  const lowFog = address.has("heightfog")
  const environment = createEnvironmentView(view.scene, sim, view.camera, {
    materials: [view.groundMaterial, ...(level?.materials ?? [])],
    fogOnlyMaterials: soldierKit?.materials ?? [],
    air: level?.atmosphere,
    heightFog: lowFog,
    quality
  })
  if (lowFog && environment) {
    useHeightFog(view.scene, () => environment.heightFog)
  }
  // Very lights over no man's land at night, drawn from the simulation's flares; shadows from what throws the sun's.
  const flares = createFlareView(
    view.scene,
    {
      sim,
      tick: () => sim.tick + stepper.alpha,
      light: () => lightLevel(sim.environment.illuminance),
      focus: () => {
        const camera = view.scene.activeCamera
        return camera instanceof TargetCamera ? camera.getTarget() : view.camera.getTarget()
      }
    },
    castsShadow,
    { quality }
  )

  // The player commands the squad in the middle of the French front line.
  const control = createPlayerControl(sim, playerSquad, view.camera, createBrowserInput(view.scene, sim.map), {
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
  })
  const markers = createSquadMarkers(view.scene, sim, playerSquad)
  // The battle's sound effects, heard from the camera, when the kit has them.
  menu.progress("Listening for the guns", 0.8)
  const sounds = level?.sfx
    ? await createBattleSounds(level.sfx, sim, view.camera, {
        soldier: () => (control.soldier >= 0 ? control.soldier : null),
        level,
        lightning: environment?.onLightning
      })
    : null
  // The soundtrack, following the player's squad, when it has been built (pnpm sound:music): from when the player goes
  // into the line, and not opening on the theme again when the front door has just played it.
  let music: Music | null = null
  void menu.entered.then(async () => {
    music = await startMusic(view.scene, sim, playerSquad, () => sounds?.fighting() ?? 0, { theme: !frontDoor })
  })
  menu.progress("Plotting what each man can see", 0.9)
  const lineOfSight = await createLineOfSight(map)
  host.attachLineOfSight(lineOfSight)
  const tracers = createTracers(view.scene, {
    sim,
    camera: view.camera,
    light: () => lightLevel(sim.environment.illuminance),
    quality
  })
  // Rounds thud into the ground as their dirt is seen to fly, not when they're fired.
  tracers.onStrike.add(({ at, time, on }) => sounds?.strike(at.x, at.z, time, on))
  const explosions = createExplosions(view.scene)
  // Grenades on their way, from the thrower's hand to where they burst.
  const grenades = createGrenadeView(view.scene, { sim, tick: () => sim.tick + stepper.alpha })
  // Fog starts off while artillery and the attack are being tuned; O turns it on.
  const fog = createFogOfWar(view.scene, sim, lineOfSight, {
    squad: playerSquad,
    groundMaterial: view.groundMaterial,
    // Props darken with the ground they stand on.
    materials: level?.materials,
    enabled: false
  })
  view.camera.radius = 60
  if (import.meta.env.DEV || new URLSearchParams(location.search).has("debug")) {
    // A handle for inspecting the running game from the browser console and automated checks: always in development,
    // and with ?debug in a production build, for measuring it (scripts/perf.mjs).
    const { installDeathMap } = await import("./dev/death-map.ts")
    const deaths = installDeathMap(view.scene, sim)
    Object.assign(window, {
      verdun: {
        engine,
        sim,
        view,
        hud,
        control,
        fog,
        lineOfSight,
        level,
        deaths,
        environment,
        soldiers,
        sounds,
        get music() {
          return music
        },
        menu,
        night,
        war,
        flares,
        tracers,
        grenades,
        trace: stats.tracer,
        snapshots
      }
    })
    const { installInspectorToggle } = await import("./dev/inspector.ts")
    installInspectorToggle(view.scene)
    const { installEnvironmentKeys } = await import("./dev/environment-keys.ts")
    installEnvironmentKeys(sim, weatherSeed, war)
  }

  let cratered: ChangedArea | null = null
  engine.runRenderLoop(() => {
    const frameSeconds = engine.getDeltaTime() / 1000
    trace("input", () => control.update(frameSeconds))
    // Paused while the menu is open, after P, or through the stand-to at the daily cutoff: the picture keeps moving, the
    // battle doesn't.
    war.update(Date.now())
    const steps = menu.paused || war.paused ? 0 : stepper.advance(frameSeconds)
    const taken = stats.time("simulation", () => host.update(steps))
    stats.time("simulation: events", () => {
      for (const step of taken) {
        // Each step's events, played out in order: what reads `sim.events` sees the step's own.
        sim.events.length = 0
        sim.events.push(...step.events)
        trace("hud: log", () => hud.record(sim.events))
        trace("sound: step", () => sounds?.step())
        const shots = shotEvents(sim.events)
        tracers.add(shots)
        grenades.add(sim.events)
        night?.flash(shots.map((shot) => shot.from))
        for (const event of sim.events) {
          if (event.type === "burst") {
            // The level draws bursts with the kit's flames, earth and smoke; the greybox has its spheres.
            if (level) {
              level.aftermath.burst(event)
            } else {
              explosions.add([event])
            }
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
      environment?.reshape()
      cratered = null
    }
    trace("effects", () => {
      tracers.update(frameSeconds)
      explosions.update(frameSeconds)
      grenades.update()
    })
    trace("hud", () => hud.update(frameSeconds))
    const sightChanged = trace("fog", () => fog.update(frameSeconds))
    if (taken.length > 0 || sightChanged) {
      trace("soldiers: sync", () => view.syncSoldiers(fog.isShown))
    }
    trace("markers", () => markers.update())
    trace("night", () => night?.update(frameSeconds))
    trace("environment", () => environment?.update(frameSeconds))
    trace("flares", () => flares.update(frameSeconds))
    trace("sound", () => sounds?.update())
    trace("render", () => {
      trace("snapshot: before", () => snapshots?.beforeRender())
      view.scene.render()
      trace("snapshot: after", () => snapshots?.afterRender())
    })
    stats.update()
  })
  window.addEventListener("resize", () => engine.resize())
  menu.ready()
}

start().catch((error: unknown) => {
  console.error(error)
})
