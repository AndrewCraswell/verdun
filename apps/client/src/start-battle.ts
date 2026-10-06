import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import { decodeElevation, generateFleurySector } from "@verdun/map"
import elevationUrl from "@verdun/map/data/fleury-elevation.bin?url"
import surroundingsUrl from "@verdun/map/data/fleury-surroundings.bin?url"
import {
  attackBehindBarrage,
  bombardEnemyLine,
  callForFire,
  callGasOn,
  createFixedStepper,
  createWarClock,
  type EntityId,
  loadWeatherRegion,
  shotEvents,
  Side,
  STEP_SECONDS,
  TICK_RATE,
  WEATHER_REGIONS
} from "@verdun/sim"
import { createBattleSounds } from "./audio/battle-sounds.ts"
import { type Music, startMusic } from "./audio/music.ts"
import { createBattlefieldScene } from "./battlefield-scene.ts"
import { createBrowserInput } from "./control/browser-input.ts"
import { cameraRigOf } from "./control/camera-rig.ts"
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
import { browserStore, localSchedule } from "./environment/war-schedule.ts"
import { createFogOfWar } from "./fog/fog-of-war.ts"
import { createHud } from "./hud/hud.ts"
import { blastRadius } from "./level/battle-damage.ts"
import { dressLevel } from "./level/dress-battlefield.ts"
import type { KitFiles } from "./level/kit-files.ts"
import { createNightLight } from "./level/night-light.ts"
import { useHeightFog } from "./level/particle-fog.ts"
import { selectEnabledMeshes } from "./render/active-meshes.ts"
import { createEngine } from "./render/create-engine.ts"
import { warmUpShaders } from "./render/shader-warm-up.ts"
import { shadowCasterCulling } from "./render/shadow-reach.ts"
import { createSnapshotDirector } from "./render/snapshot-director.ts"
import { displaySettings, frameDue } from "./settings/display.ts"
import { graphicsQuality } from "./settings/graphics.ts"
import { playSettings } from "./settings/play.ts"
import { sideSettings } from "./settings/side.ts"
import { browserStorage } from "./settings/store.ts"
import { connectToSector, serverHost } from "./sim/server-host.ts"
import { createSimHost } from "./sim/sim-host.ts"
import type { BattleSetup } from "./sim/sim-protocol.ts"
import { createSoldierCrowd } from "./soldiers/soldier-crowd.ts"
import { loadSoldierKit } from "./soldiers/soldier-kit.ts"
import { createBattleNotes } from "./ui/battle-notes.ts"
import { createCaptions } from "./ui/captions.ts"
import { createFireConfirm } from "./ui/fire-confirm.ts"
import { createFrameWatch } from "./ui/frame-watch.ts"
import { lookAt } from "./ui/look-at.ts"
import type { Menu } from "./ui/menu.ts"

/** Where the suggestion of a lower setting is remembered as made, so it's made once. */
const SLOW_SUGGESTED = "verdun.slow-suggested"

/**
 * Brings up the battle behind the menus: the renderer, the ground, the simulation in its worker, the level, the
 * soldiers and the sound, reporting each step to the loading, then runs it. Loaded on its own once the player joins the
 * battle, so the front door downloads none of Babylon or the battle. The entry opens the level kit's files alongside, so
 * its pack is already on its way.
 */
export async function startBattle(
  menu: Menu,
  { frontDoor, kitFiles }: { readonly frontDoor: boolean; readonly kitFiles: KitFiles | null }
): Promise<void> {
  const canvas = document.querySelector("canvas#battlefield")
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error("Battlefield canvas is missing from the page")
  }
  const address = new URLSearchParams(location.search)
  // The ground's surveys download while the renderer starts.
  const download = async (url: string) => (await fetch(url)).arrayBuffer()
  const surveys = Promise.all([download(elevationUrl), download(surroundingsUrl)])
  menu.progress("Starting the renderer", 0.04)
  const engine = await createEngine(canvas)
  // The battle draws at the player's render scale, changed at once from the options.
  displaySettings().listen(({ renderScale }) => engine.setHardwareScalingLevel(1 / renderScale))
  menu.progress("Surveying the ground", 0.12)
  // The Fleury sector: 600 m x 400 m at the simulation's 0.5 m resolution, on the real ground surveyed by IGN's LiDAR.
  const [elevationData, surroundingsData] = await surveys
  const elevation = decodeElevation(elevationData)
  const map = generateFleurySector({ seed: 1916, elevation })
  // History's weather, 1914-1918, in the map's region of the front (scripts/build-historical-weather.mjs), loaded before
  // the battle needs it; the seed drives gusts and showers.
  const weatherSeed = 1916
  const region = WEATHER_REGIONS.find((name) => name === map.weatherRegion) ?? "fleury"
  menu.progress("Reading the war's weather", 0.2)
  await loadWeatherRegion(region)
  // ?free plays the battle as it stands, without the playtest's operation: free play, for development.
  // The side the player chose at the front door: French unless Germany was chosen.
  const setup: BattleSetup = {
    elevation: elevationData,
    mapSeed: 1916,
    simSeed: 1916,
    region,
    weatherSeed,
    free: address.has("free"),
    side: sideSettings().current.side === "german" ? Side.German : Side.French
  }
  // The simulation runs in a Web Worker, stepping off the page's thread; `sim` here is its mirror, brought up to date
  // as each batch of steps comes back. ?inline steps it on the page instead, as before. ?server joins the battle on a
  // sector server instead (`pnpm server`), where the war goes on whoever is playing: ws://<this host>:2567 unless given,
  // as in ?server=wss://example.org.
  const server = address.get("server")
  const remote =
    server === null
      ? null
      : await serverHost(
          map,
          setup,
          await connectToSector(server || `ws://${location.hostname}:2567`, setup.side ?? Side.French)
        )
  const host = remote ?? (await createSimHost(map, setup, address.has("inline")))
  const { sim, playerSquad } = host
  // The war's calendar: on a server, the sector's own. Played locally, it's kept between visits, so the war goes on a
  // week each real day from the battle's week; each daily cutoff moves the battle on a week and stands it to. Dev:
  // ?war=1916-02-21, ?standto=0.
  const war = createWarClock(
    sim,
    remote
      ? remote.schedule
      : localSchedule({
          week: sim.environment.clock.week,
          now: Date.now(),
          store: browserStore(),
          ...(import.meta.env.DEV ? { search: new URLSearchParams(location.search) } : {})
        })
  )

  menu.attach({ war, renderer: engine.isWebGPU ? "WebGPU" : "WebGL" })
  const view = createBattlefieldScene(engine, sim, { attachControl: true, side: playerSquad.side })
  // Babylon chooses what to draw from the enabled meshes only, not the kit's switched-off sources too.
  selectEnabledMeshes(view.scene)
  // The war map's view shows the enemy only where the fog of war does: the men our side can see.
  const hud = createHud(document.body, sim, playerSquad, TICK_RATE, {
    war,
    view,
    seen: (soldier) => fog.isShown(soldier)
  })
  // The menus' battle pages: the sector map, the squad book and the log's history read the battle through these, and
  // the join screen lists its squads as soon as they're mustered. The fog is made further down; the sector map asks it
  // only in battle.
  menu.attach({
    battle: {
      sim,
      squad: playerSquad,
      tickRate: TICK_RATE,
      hud,
      seen: (soldier) => fog.isShown(soldier),
      look: (x, z) => {
        const rig = cameraRigOf(view.camera)
        if (rig) {
          lookAt(rig.model, x, z)
        }
      }
    }
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
  // The real ground round the sector out to the horizon: a 3 km survey centred on it (scripts/fetch-elevation.mjs).
  const surroundings = {
    elevation: decodeElevation(surroundingsData),
    sectorBase: elevation.base,
    sectorOrigin: { x: 1200, z: 1300 }
  }
  menu.progress("Dressing the battlefield", 0.3)
  // The graphics setting: Low drops the costliest effects, and smooths edges with FXAA rather than multisampling.
  const quality = graphicsQuality(browserStore(), address)
  const level = await dressLevel(view, map, {
    wind: () => sim.wind,
    files: kitFiles,
    surroundings,
    wire: () => sim.wire,
    fencesDown: () => sim.fencesDown,
    weather: () => sim.environment.weather,
    quality
  })
  // Animated Synty soldiers in place of the capsules, when the kit has them.
  menu.progress("Bringing up the battalion", 0.6)
  const soldierKit = level ? await loadSoldierKit(view.scene, kitFiles) : null
  // The kit's files close once the last of them, the sounds, have been read.
  void Promise.resolve(level?.sfx).finally(() => kitFiles?.close?.())
  // The soldier the player aims with, in the aim view: drawn aiming whether or not an enemy is in his sights. The
  // player's control is made further on.
  let aimingSoldier = (): EntityId => -1
  const soldiers = soldierKit
    ? createSoldierCrowd(view.scene, sim, soldierKit, { aimingSoldier: () => aimingSoldier() })
    : null
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
  // The low-lying fog, on for now only with ?heightfog until it's been measured: it replaces Babylon's distance fog on
  // the ground, props, soldiers and smoke together.
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
  // Very lights over no man's land at night, drawn from the simulation's flares.
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
    { quality }
  )

  // The notes over the battle: captions of what's heard, the question before sector-wide fire, and the suggestion of a
  // lower setting when the battle has run slowly, made once.
  const confirm = createFireConfirm(() => playSettings().current.confirmSectorFire)
  // Shouts from the player's own squad are captioned with the man's name, as the roster gives it; the rest by side.
  const captions = createCaptions(
    () => playSettings().current.captions,
    playerSquad.side === Side.German ? "de" : "fr",
    (soldier) => {
      const man = hud.state?.roster.find((slot) => slot.id === soldier)
      return man ? man.name.surname : null
    }
  )
  const notes = createBattleNotes(document.body, { captions, confirm })
  const storage = browserStorage()
  let suggested = false
  try {
    suggested = storage?.getItem(SLOW_SUGGESTED) === "yes"
  } catch {
    // Storage blocked: the suggestion may come again next visit.
  }
  const frames = createFrameWatch(suggested)
  const suggest = (fps: number) => {
    try {
      storage?.setItem(SLOW_SUGGESTED, "yes")
    } catch {
      // As above.
    }
    const lower = quality === "high" ? "try Low graphics" : "try a lower render scale"
    notes.notice(`Running slowly (${fps} fps): ${lower}.`, [
      { label: "Options", act: () => menu.showPage("options") },
      { label: "Dismiss", act: () => undefined }
    ])
  }

  // The player commands the squad in the middle of the French front line.
  const control = createPlayerControl(sim, playerSquad, view.camera, createBrowserInput(view.scene, sim.map), {
    debugActions: import.meta.env.DEV,
    commands: {
      // The whistle and the bombardment fire along the whole front: they ask for a second press first.
      whistle: () => confirm.press("whistle", () => attackBehindBarrage(sim, playerSquad.side), performance.now()),
      bombard: () => confirm.press("bombard", () => bombardEnemyLine(sim, playerSquad.side), performance.now()),
      callFire: (x, z) => callForFire(sim, playerSquad.side, x, z),
      callGas: (x, z) => callGasOn(sim, playerSquad.side, x, z)
    },
    toggleFog: () => {
      fog.enabled = !fog.enabled
    },
    // Only the enemy the player can see is picked out under the pointer. The fog is made further down.
    shown: (soldier) => fog.isShown(soldier)
  })
  aimingSoldier = () => (cameraRigOf(view.camera)?.aiming ? control.soldier : -1)
  // The facing ring, the aim line and the ring on the man in his sights follow the page's aim, not the worker's.
  const markers = createSquadMarkers(view.scene, sim, playerSquad, control)
  // The battle's sound effects, heard from the camera, when the kit has them: last in the asset pack, so they may only
  // now be arriving.
  menu.progress("Listening for the guns", 0.8)
  const sfx = level ? await level.sfx : null
  const sounds = sfx
    ? await createBattleSounds(sfx, sim, view.camera, {
        soldier: () => (control.soldier >= 0 ? control.soldier : null),
        level,
        lightning: environment?.onLightning,
        heard: (call) => captions.hear(call)
      })
    : null
  // The soundtrack, following the player's squad, when it has been built (pnpm sound:music): from when the player goes
  // into the line, and not opening on the theme again when the front door has just played it.
  let music: Music | null = null
  void menu.entered.then(async () => {
    music = await startMusic(view.scene, sim, playerSquad, () => sounds?.fighting() ?? 0, { theme: !frontDoor })
  })
  menu.progress("Plotting what each man can see", 0.9)
  // In a worker the host answers the page's questions of sight from the ground, without physics; inline, the
  // simulation's own sight lines serve both.
  if (!host.remote) {
    // Only the simulation inline needs the physics: in a worker the page never loads it.
    const { createLineOfSight } = await import("@verdun/sim/physics")
    host.attachLineOfSight(await createLineOfSight(map))
  }
  const tracers = createTracers(view.scene, {
    sim,
    camera: view.camera,
    light: () => lightLevel(sim.environment.illuminance),
    quality,
    // The flash and the round leave the rifle's muzzle as the soldier is drawn holding it.
    muzzle: (soldier) => soldiers?.muzzle(soldier) ?? null
  })
  // Rounds thud into the ground as their dirt is seen to fly, not when they're fired.
  tracers.onStrike.add(({ at, time, on }) => sounds?.strike(at.x, at.z, time, on))
  // The greybox draws shell bursts as spheres. The level draws them with the kit's flames, earth and smoke, so with it
  // the spheres would never be given a burst, yet still cost their draws every frame.
  const explosions = level ? null : createExplosions(view.scene)
  // Grenades on their way, from the thrower's hand to where they burst.
  const grenades = createGrenadeView(view.scene, { sim, tick: () => sim.tick + stepper.alpha })
  // Fog starts on: the player sees the enemy his squad sees, and the sight picture says which of them his man can shoot.
  // O turns it off.
  // What the squad can see is worked out in the simulation's worker, where its sight lines are; inline, here.
  const fog = createFogOfWar(view.scene, sim, host.sight ?? host.sightLines, {
    squad: playerSquad,
    groundMaterial: view.groundMaterial,
    // Props darken with the ground they stand on.
    materials: level?.materials,
    enabled: true,
    known: host.known ?? undefined
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
        lineOfSight: host.sightLines,
        level,
        deaths,
        environment,
        soldiers,
        sounds,
        get music() {
          return music
        },
        menu,
        notes,
        captions,
        confirm,
        night,
        war,
        flares,
        tracers,
        grenades,
        trace: stats.tracer,
        snapshots,
        shadowCasterCulling
      }
    })
    const { installInspectorToggle } = await import("./dev/inspector.ts")
    installInspectorToggle(view.scene)
    const { installEnvironmentKeys } = await import("./dev/environment-keys.ts")
    installEnvironmentKeys(sim, weatherSeed, war)
  }

  // The player's frame-rate cap: a frame the screen offers early is skipped, and the next one drawn covers the time.
  let lastFrame = performance.now()
  engine.runRenderLoop(() => {
    const now = performance.now()
    const { frameCap } = displaySettings().current
    if (!frameDue(frameCap, now - lastFrame)) {
      return
    }
    const frameSeconds = frameCap === 0 ? engine.getDeltaTime() / 1000 : Math.min(0.25, (now - lastFrame) / 1000)
    lastFrame = now
    trace("input", () => control.update(frameSeconds))
    // Paused while the menu is open, after P, or through the stand-to at the daily cutoff: the picture keeps moving, the
    // battle doesn't.
    war.update(Date.now())
    const steps = menu.paused || war.paused ? 0 : stepper.advance(frameSeconds)
    const taken = stats.time("simulation", () => host.update(steps))
    stats.time("simulation: events", () => {
      for (const step of taken) {
        // Each step played out in order: what reads `sim.tick` and `sim.events` sees the step's own. The last step's is
        // the batch's, so the mirror ends where it should.
        sim.tick = step.tick
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
              explosions?.add([event])
            }
            if (event.crater) {
              // Each crater marks only the chunks it reaches, not every chunk between it and the frame's others.
              view.terrain.markChanged(event.crater)
              environment?.reshape()
              level?.damage.blast(event.at.x, event.at.z, blastRadius(event.crater))
            }
          }
        }
      }
    })
    // Rebuild a terrain chunk a frame, nearest where the camera looks first: one craters have reshaped, or one whose
    // detail the camera's distance changes. A barrage's craters so come in over a few frames, under their smoke, rather
    // than all in one long one.
    stats.time("terrain", () => {
      const target = view.camera.getTarget()
      view.terrain.flush(target.x, target.z)
    })
    trace("effects", () => {
      tracers.update(frameSeconds)
      explosions?.update(frameSeconds)
      grenades.update()
    })
    trace("hud", () => hud.update(frameSeconds))
    notes.update(frameSeconds)
    const slow = frames.frame(frameSeconds, !menu.paused && !menu.open && document.visibilityState === "visible")
    if (slow !== null) {
      suggest(slow)
    }
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
  // The loading screen gives way once the battle has drawn its first frame, its shaders built: first those for the
  // sector seen from high up, without the sun's shadows (see atmosphere.ts).
  await level?.atmosphere?.warmUp()
  // And those the battle would first need in the middle of it: the night's lights, every layer of the soldiers (see
  // render/shader-warm-up.ts).
  await warmUpShaders(view.scene, [night, flares, soldiers])
  view.scene.executeWhenReady(() => view.scene.onAfterRenderObservable.addOnce(() => menu.ready()))
}
