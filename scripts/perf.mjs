// Measures the game's frame rate and where the time goes, with nobody at the keyboard: builds the client, serves it,
// and runs it in headless Chrome on this machine's GPU, which unlike a background window or an embedded pane isn't
// throttled. Each scenario plays the battle for a few seconds and reports frames per second, frame time, the GPU's time
// where Chrome allows timestamp queries, and the hot spots from the game's own tracer (debug/trace.ts).
//
// Usage: node scripts/perf.mjs [--headed] [--ref HEAD] [--url http://localhost:5173] [--no-build] [--width 1920]
//                              [--height 1080] [--seconds 6] [--only "day;night"] [--out perf.json] [--shots dir]
//                              [--eval "page-side expression"] [--query "inline"] [--operation]
//                              [--ab "page-side toggle" [--ab-undo "page-side undo"] [--rounds 4] [--settle 2500]]
//                              [--chrome path/to/chrome.exe]
// --headed runs a real Chrome window off-screen: headless Chrome here aborts some module fetches. --shots saves what
// each scenario looked like, to check a faster setting still draws the picture. --eval prints a page-side expression
// once the game is up, such as counts of what's drawn. The battle is played free (?free), in the close view the
// scenarios were written for, so runs compare across builds; --operation plays the playtest's operation instead, which
// opens on its briefing in the overview.
// A free battle with nobody at the keyboard is quiet, so the last scenarios put it through what a played one does:
// "aiming" sweeps the soldier's aim, "overview" pulls the camera back, "dawn" brings the sun low and "barrage" brings a
// bombardment down in front of the camera, then "barrage, pulled back" frames it. --eval "__perf.barrage(true)" (or
// aim(true), zoom(300)) starts one for --ab; the barrage resolves a minute after its first rounds land, once its smoke
// has built up, so the toggled samples, each later than its baseline, don't read slower for thicker smoke.
// Without --url it builds the client as committed at --ref (HEAD by default, in a worktree of its own, so others'
// half-made changes stay out) and serves the build itself. Close other copies of the game first. Several runs at once
// each take a slot of their own (build tree, build folder, port), so they never swap files under each other; --no-build
// serves the build last made in the slot this run gets.
// --ab measures one change against the battle as it is, in one page: it alternates a sample of the baseline with a
// sample after the toggle (undone again by --ab-undo), --rounds times, waiting --settle milliseconds after each toggle
// for shaders to recompile, and reports the median of the paired differences. Other sessions' games and builds load
// this machine's GPU on and off, by tens of milliseconds between runs; adjacent pairs share that load, and the 20th
// percentile of per-frame GPU time (`gpuP20`), which load can only push up, holds steadiest.

import { execFileSync, spawn, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

const option = (name, fallback) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const flag = (name) => process.argv.includes(name)

const WIDTH = Number(option("--width", 1920))
const HEIGHT = Number(option("--height", 1080))
const SECONDS = Number(option("--seconds", 6))
/** Runs at once on the machine, each with its own build tree, build folder and port (see `takeSlot`). */
const SLOTS = 8
/** A page-side evaluation gives up after this long: a setting that recompiles shaders can hang the page for good. */
const EVALUATE_TIMEOUT_MS = 120_000
/** --ab: rounds of baseline and toggled samples, and how long to wait after each toggle. */
const AB = option("--ab", "")
const AB_UNDO = option("--ab-undo", "")
const ROUNDS = Number(option("--rounds", 4))
const SETTLE_MS = Number(option("--settle", 2500))
// Semicolons between names: the names have commas in them.
const ONLY = option("--only", "")
  .split(";")
  .filter((name) => name.length > 0)

const CHROMES = [
  option("--chrome", ""),
  process.env.CHROME_PATH ?? "",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome"
]

const print = (line) => process.stdout.write(`${line}\n`)

/** Stops a process and everything it started: on Windows a shell's children outlive it otherwise. */
function stopTree(child) {
  if (!child?.pid) {
    return
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" })
  } else {
    child.kill()
  }
}

/** Runs a command to completion, failing loudly. */
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: process.platform === "win32" })
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")}: ${code}`))))
  })
}

async function waitForServer(url, seconds) {
  for (let attempt = 0; attempt < seconds * 4; attempt++) {
    try {
      if ((await fetch(url)).ok) {
        return
      }
    } catch {
      // Not up yet.
    }
    await sleep(250)
  }
  throw new Error(`nothing answered at ${url}`)
}

/** A minimal Chrome DevTools Protocol client over Node's own WebSocket. */
async function connect(endpoint) {
  const socket = new WebSocket(endpoint)
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true })
    socket.addEventListener("error", reject, { once: true })
  })
  let next = 1
  const waiting = new Map()
  const errors = []
  const urls = new Map()
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data))
    if (message.method === "Runtime.exceptionThrown") {
      errors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      errors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "))
    } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      errors.push(`${message.params.entry.text} ${message.params.entry.url ?? ""}`)
    } else if (message.method === "Inspector.targetCrashed" || message.method === "Target.targetCrashed") {
      errors.push(`the page crashed: ${JSON.stringify(message.params)}`)
    } else if (message.method === "Inspector.detached") {
      errors.push(`the page went away: ${message.params.reason}`)
    } else if (message.method === "Page.frameRequestedNavigation") {
      errors.push(`asked to navigate (${message.params.reason}) to ${message.params.url}`)
    } else if (message.method === "Page.frameNavigated" && !message.params.frame.parentId) {
      errors.push(`navigated to ${message.params.frame.url}`)
    } else if (message.method === "Network.requestWillBeSent") {
      urls.set(message.params.requestId, message.params.request.url)
    } else if (message.method === "Network.loadingFailed") {
      errors.push(`${message.params.errorText} ${urls.get(message.params.requestId) ?? ""}`)
    } else if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
      errors.push(`${message.params.response.status} ${message.params.response.url}`)
    }
    const pending = waiting.get(message.id)
    if (pending) {
      waiting.delete(message.id)
      if (message.error) {
        pending.reject(new Error(message.error.message))
      } else {
        pending.resolve(message.result)
      }
    }
  })
  return {
    /** Errors the page has logged or thrown, for reporting a failed run. */
    errors,
    send(method, params = {}, sessionId) {
      const id = next++
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
      return new Promise((resolve, reject) => waiting.set(id, { resolve, reject }))
    },
    close() {
      socket.close()
    }
  }
}

async function launchChrome() {
  const chrome = CHROMES.find((path) => path && existsSync(path))
  if (!chrome) {
    throw new Error("no Chrome or Edge found: pass --chrome or set CHROME_PATH")
  }
  const profile = mkdtempSync(join(tmpdir(), "verdun-perf-"))
  const child = spawn(
    chrome,
    [
      // Headless by default; --headed runs a real window off-screen instead, for when headless Chrome misbehaves.
      ...(flag("--headed") ? ["--window-position=-3000,0", "--new-window"] : ["--headless=new"]),
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      `--window-size=${WIDTH},${HEIGHT}`,
      "--enable-unsafe-webgpu",
      // Lets WebGPU report how long the GPU spends on each frame.
      "--enable-dawn-features=allow_unsafe_apis",
      "--enable-webgpu-developer-features",
      "--ignore-gpu-blocklist",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank"
    ],
    { stdio: "ignore" }
  )
  const portFile = join(profile, "DevToolsActivePort")
  for (let attempt = 0; attempt < 80 && !existsSync(portFile); attempt++) {
    await sleep(250)
  }
  // Chrome may still hold the file open as it writes it.
  let written = ""
  for (let attempt = 0; attempt < 20 && !written.includes("\n"); attempt++) {
    try {
      written = readFileSync(portFile, "utf8")
    } catch {
      await sleep(250)
    }
  }
  const [port, path] = written.split("\n")
  return {
    endpoint: `ws://127.0.0.1:${port}${path}`,
    stop() {
      stopTree(child)
      // Chrome may hold the profile a moment longer; a profile left in the temp folder does no harm.
      setTimeout(() => {
        try {
          rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
        } catch {
          // Still locked: the temp folder's own clean-up takes it later.
        }
      }, 1500)
    }
  }
}

/** Page-side helpers, installed once the game is up. */
const HELPERS = `
window.__perf = {
  clock(utc) {
    verdun.sim.pendingCommands.push({ type: "clock", at: utc, minutesPerDay: 1e6 })
  },
  // The clock as it is now, for restoreClock to put back.
  saveClock() {
    window.__perfClock = { ...verdun.sim.environment.clock }
  },
  // At the saved week, then on by the time since it: the moment, the week and the pace all as they were.
  restoreClock() {
    const { week, elapsed, minutesPerDay } = window.__perfClock
    verdun.sim.pendingCommands.push({ type: "clock", at: week, shift: elapsed, minutesPerDay })
  },
  // Resolves once a test passes, or after a time limit in milliseconds, with whether it passed.
  async until(test, ms) {
    const end = performance.now() + ms
    while (!test() && performance.now() < end) await new Promise((r) => setTimeout(r, 100))
    return test()
  },
  async sample(seconds) {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    // A change of settings recompiles shaders, which stalls for seconds: wait for two seconds in a row that agree.
    let last = 0
    for (let second = 0; second < 15; second++) {
      await wait(1000)
      const now = verdun.trace.frames
      const steady = last > 0 && Math.abs(now.averageMs - last) < last * 0.1 && now.worstMs < now.averageMs * 3
      last = now.averageMs
      if (steady) break
    }
    const engine = verdun.engine
    // With ?gputime, Babylon times the frame, its main pass and each render target's on the GPU, in nanoseconds.
    const gpu = engine._timestampQuery?.enable ? engine._timestampQuery.gpuFrameTimeCounter : null
    // Each frame's GPU time too: its low percentiles stand clear of other programs' load on the GPU.
    const frames = []
    let collecting = true
    const collect = () => {
      if (collecting) {
        if (gpu?.current > 0) frames.push(gpu.current / 1e6)
        requestAnimationFrame(collect)
      }
    }
    requestAnimationFrame(collect)
    const seconds_ = []
    for (let second = 0; second < seconds; second++) {
      await wait(1000)
      const f = verdun.trace.frames
      seconds_.push({ fps: f.perSecond, ms: f.averageMs, worst: f.worstMs, gpu: gpu ? gpu.lastSecAverage / 1e6 : 0 })
    }
    collecting = false
    frames.sort((a, b) => a - b)
    const percentile = (q) => (frames.length > 0 ? frames[Math.floor((frames.length - 1) * q)] : 0)
    const mean = (key) => seconds_.reduce((sum, s) => sum + s[key], 0) / seconds_.length
    const passes = []
    if (engine.gpuTimeInFrameForMainPass) {
      passes.push(["main pass", engine.gpuTimeInFrameForMainPass.counter.lastSecAverage / 1e6])
    }
    for (const target of engine._renderTargetWrapperCache ?? []) {
      if (target.gpuTimeInFrame) {
        passes.push([target.label || "unnamed", target.gpuTimeInFrame.counter.lastSecAverage / 1e6])
      }
    }
    return {
      fps: mean("fps"),
      frameMs: mean("ms"),
      worstMs: Math.max(...seconds_.map((s) => s.worst)),
      gpuMs: mean("gpu"),
      gpuP20: percentile(0.2),
      gpuP50: percentile(0.5),
      passes: passes.filter(([, ms]) => ms > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, ms]) => [name, +ms.toFixed(2)]),
      snapshot: verdun.snapshots ? (verdun.snapshots.playing ? "replaying" : "live: " + verdun.snapshots.lastReason) : "off",
      hot: verdun.trace.hotSpots(20).map((s) => [s.name, +s.selfMsPerFrame.toFixed(2)])
    }
  },
  // Swings the zoom 25 m either side of where it was. Off, it zooms back there: left wherever the swing stopped, every
  // scenario after it would be seen from a different distance on each run.
  async moveCamera(on) {
    clearInterval(window.__perfMove)
    if (on) {
      const camera = verdun.engine.scenes[0].activeCamera
      const base = camera.radius
      window.__perfMoveBase = base
      let t = 0
      window.__perfMove = setInterval(() => { t += 0.05; camera.radius = base + 25 * Math.sin(t) }, 16)
    } else if (window.__perfMoveBase !== undefined) {
      const base = window.__perfMoveBase
      window.__perfMoveBase = undefined
      await __perf.zoom(base)
    }
  },
  // Zooms the player's camera as the wheel would: the camera rig takes a radius set from outside as the player's zoom
  // (camera-rig.ts) and eases the view there, tipping it toward overhead. Resolves once the view has arrived, and
  // throws if it hasn't within five seconds, rather than measure a camera still on the move.
  async zoom(radius) {
    const camera = verdun.view.camera
    camera.radius = radius
    // A few frames for the rig to take it, then until the distance has landed and the angle, which lags it, stopped.
    // The rig lands the last half millimetre at once, so landed is all but exact: within a centimetre it would still
    // be easing, and through the field view's zooms, where the angle holds at 55°, nothing else would show it.
    await new Promise((r) => setTimeout(r, 250))
    let beta = NaN
    const arrived = await __perf.until(() => {
      const still = Math.abs(camera.radius - radius) < 1e-5 && camera.beta === beta
      beta = camera.beta
      return still
    }, 5000)
    if (!arrived) throw new Error("zoom: the view didn't settle at " + radius + " m")
  },
  // Sweeps the controlled soldier's aim 30° either side of straight at the enemy and back, a face command every 16 ms as
  // the player's mouse sends them at 60 fps (player-control.ts), 1.2° apart: more than the 0.8° under which the page
  // sends none. Off, faces him back the way he was.
  aim(on) {
    clearInterval(window.__perfAim)
    const sim = verdun.sim
    const facing = sim.soldiers.facing
    if (on) {
      const soldier = verdun.control.soldier
      window.__perfAimWas = soldier >= 0 ? { soldier, x: facing.x[soldier], z: facing.z[soldier] } : null
      // The French face north, toward +z; the Germans south.
      const ahead = verdun.control.squad.side === 0 ? Math.PI / 2 : -Math.PI / 2
      let step = 0
      window.__perfAim = setInterval(() => {
        const soldier = verdun.control.soldier
        if (soldier < 0) return
        step = (step + 1) % 100
        const angle = ahead + (Math.PI / 6) * (1 - 2 * Math.abs(step / 50 - 1))
        sim.pendingCommands.push({ type: "face", soldier, x: Math.cos(angle), z: Math.sin(angle) })
      }, 16)
    } else if (window.__perfAimWas) {
      const { soldier, x, z } = window.__perfAimWas
      sim.pendingCommands.push({ type: "face", soldier, x, z })
      window.__perfAimWas = null
    }
  },
  // The bombardment the player calls on the enemy's front line (bombardEnemyLine, packages/sim/src/operation.ts), on the
  // 200 m of it in front of the camera at the same weight of fire a metre: heavy and field guns on the trench, field guns
  // sweeping the wire in front of it. It fires until switched off. Its first rounds land some ten seconds after the
  // order, and it resolves settle seconds after that, once their smoke has built up: smoke thins with a half-life of
  // 25 s (BURST_SMOKE, packages/sim/src/gas.ts), so sampled sooner it would still be thickening, and later samples
  // would read slower for it. Off, it stops the guns, gives the side back the shells fired and lets those in the air
  // land.
  async barrage(on, settle = 60) {
    const sim = verdun.sim
    // Field and heavy high explosive, by Shell in packages/sim/src/artillery.ts.
    const kinds = [0, 2]
    if (on) {
      const side = verdun.control.squad.side
      const middle = (trench) => trench.points.reduce((sum, point) => sum + point[1], 0) / trench.points.length
      // His front line as the simulation picks it: of his fire trenches, the one nearest no man's land. The French hold
      // the south of the map and face north; the Germans the north, facing south.
      const line = sim.map.trenches
        .filter((trench) => trench.kind === "fire" && trench.facing === (side === 0 ? "south" : "north"))
        .sort((a, b) => (side === 0 ? middle(a) - middle(b) : middle(b) - middle(a)))[0]
      const zs = line.points.map((point) => point[1])
      const forward = side === 0 ? Math.min(...zs) : Math.max(...zs)
      const rear = side === 0 ? Math.max(...zs) : Math.min(...zs)
      const width = sim.map.columns * sim.map.cellSize
      const x = verdun.view.camera.target.x
      const fromX = Math.max(0, x - 100)
      const toX = Math.min(width, x + 100)
      const share = (toX - fromX) / width
      const target = { side, fromX, toX, z: middle(line), band: Math.abs(rear - forward) + 20, delay: 0, duration: 3600 }
      const plans = [
        { ...target, shell: 2, roundsPerMinute: 30 * share },
        { ...target, shell: 0, roundsPerMinute: 120 * share },
        { ...target, z: forward + (side === 0 ? -30 : 30), band: 30, shell: 0, roundsPerMinute: 600 * share }
      ]
      const ours = (shell) =>
        shell.side === side && kinds.includes(shell.shell) && shell.x > fromX - 50 && shell.x < toX + 50
      window.__perfBarrage = { side, fromX, toX, ours, rounds: [...sim.artillery.ammunition[side]] }
      for (const plan of plans) sim.pendingCommands.push({ type: "fire-mission", plan })
      // A shell lands in the step taken from its tick, which the page plays out as the tick after.
      let first = Infinity
      const landed = await __perf.until(() => {
        for (const shell of sim.artillery.shells) if (ours(shell)) first = Math.min(first, shell.landsAtTick)
        return sim.tick > first
      }, 30000)
      if (!landed) throw new Error("barrage: no round landed within 30 s")
      await new Promise((r) => setTimeout(r, settle * 1000))
      return plans
    }
    const was = window.__perfBarrage
    if (!was) return
    window.__perfBarrage = null
    const missions = () =>
      sim.artillery.missions.filter((m) => m.side === was.side && m.fromX === was.fromX && m.toX === was.toX)
    // No command calls a mission off, but one ends when its kind of shell runs out: empty the side's stock until every
    // one has, then put back what it had before the barrage.
    for (const shell of kinds) sim.pendingCommands.push({ type: "ammunition", side: was.side, shell, rounds: 0 })
    await __perf.until(() => missions().every((m) => m.finished), 15000)
    for (const shell of kinds) {
      sim.pendingCommands.push({ type: "ammunition", side: was.side, shell, rounds: was.rounds[shell] })
    }
    await __perf.until(() => !sim.artillery.shells.some(was.ours), 20000)
  }
}
true`

const PIPELINE = "verdun.engine.scenes[0].postProcessRenderPipelineManager.supportedPipelines[0]"

/**
 * A scenario changing one setting of the post-processing pipeline for its sample, then putting it back. Not every
 * setting survives being changed on a running pipeline: changing `samples` leaves it drawing a blank frame, which
 * measures as fast as anything. Check a new probe's picture with --shots.
 */
function pipelineProbe(name, property, value) {
  return [
    {
      name: `day, ${name}`,
      setup: `{ const p = ${PIPELINE}; if (p) { window.__perfWas = p.${property}; p.${property} = ${JSON.stringify(value)} } }`,
      teardown: `{ const p = ${PIPELINE}; if (p) p.${property} = window.__perfWas }`
    }
  ]
}

/** What's measured: each a name and the page-side code that sets it up before sampling. */
const SCENARIOS = [
  { name: "day", setup: "__perf.clock(Date.UTC(1916, 5, 23, 10))" },
  { name: "day, camera moving", setup: "__perf.moveCamera(true)", teardown: "__perf.moveCamera(false)" },
  { name: "night", setup: "__perf.clock(Date.UTC(1916, 5, 23, 22, 30))" },
  {
    name: "day, half resolution",
    setup: "__perf.clock(Date.UTC(1916, 5, 23, 10)); verdun.engine.setHardwareScalingLevel(2)",
    teardown: "verdun.engine.setHardwareScalingLevel(1)"
  },
  {
    name: "day, no post-processing",
    setup:
      "{ const s = verdun.engine.scenes[0]; const p = s.postProcessRenderPipelineManager.supportedPipelines[0]; if (p) s.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline(p.name, [s.activeCamera]) }",
    teardown:
      "{ const s = verdun.engine.scenes[0]; const p = s.postProcessRenderPipelineManager.supportedPipelines[0]; if (p) s.postProcessRenderPipelineManager.attachCamerasToRenderPipeline(p.name, [s.activeCamera]) }"
  },
  // Put back as found: with the camera high up (--eval), the game has already switched the sun's shadows off.
  {
    name: "day, no sun shadows",
    setup:
      "{ const sun = verdun.engine.scenes[0].lights.find((l) => l.name === 'sun'); if (sun) { window.__perfWas = sun.shadowEnabled; sun.shadowEnabled = false } }",
    teardown:
      "{ const sun = verdun.engine.scenes[0].lights.find((l) => l.name === 'sun'); if (sun) sun.shadowEnabled = window.__perfWas }"
  },
  ...pipelineProbe("no depth of field", "depthOfFieldEnabled", false),
  ...pipelineProbe("no bloom", "bloomEnabled", false),
  {
    name: "day, no backdrop woods",
    setup:
      "for (const m of verdun.engine.scenes[0].meshes) if (m.name.startsWith('backdrop-')) { m.metadata = { ...m.metadata, perfWas: m.isEnabled(false) }; m.setEnabled(false) }",
    teardown:
      "for (const m of verdun.engine.scenes[0].meshes) if (m.name.startsWith('backdrop-')) m.setEnabled(m.metadata?.perfWas ?? true)"
  },
  // The busy paths a quiet battle never takes. Each sets its own time of day, so it can be run alone with --only.
  // Every aim the player moves goes to the simulation as a face command, which waits for the next step's batch
  // (sim-host.ts). The worker turns him and keeps his aim's bookkeeping (target.id and aim.since, commands.ts), and the
  // page turns his figure and works out whom his aim would strike (control/aimed-target.ts), as it does every step
  // anyway. So it should measure about as the day does: it's here to show that it still does.
  { name: "aiming", setup: "__perf.clock(Date.UTC(1916, 5, 23, 10)); __perf.aim(true)", teardown: "__perf.aim(false)" },
  // The map view: 300 m back and some 250 m up, above the height where the sun's shadows stop (atmosphere.ts).
  {
    name: "overview",
    setup: "__perf.clock(Date.UTC(1916, 5, 23, 10)); window.__perfRadius = verdun.view.camera.radius; __perf.zoom(300)",
    teardown: "__perf.zoom(window.__perfRadius)"
  },
  // A low sun, 11° up at 05:00 UTC on the same June day: shadows five times as long as what casts them.
  {
    name: "dawn",
    setup: "__perf.saveClock(); __perf.clock(Date.UTC(1916, 5, 23, 5))",
    teardown: "__perf.restoreClock()"
  },
  // Switching snapshot rendering off is for good.
  { name: "day, no snapshot rendering", setup: "verdun.snapshots?.dispose()" },
  // Last of all: a barrage's craters, cut wire and dead are for good too, and its smoke hangs about for a minute.
  // Looking down at 55° from 60 m, the top of the screen reaches some 45 m ahead and its rounds land past it, so this
  // measures the work of its craters, wire and smoke but little of drawing them. It keeps firing for the next scenario.
  { name: "barrage", setup: "__perf.clock(Date.UTC(1916, 5, 23, 10)); __perf.barrage(true)" },
  // The same barrage on screen: 170 m back, the view reaches some 113 m ahead, over the wire the field guns sweep. The
  // camera is 143 m above the soldier, whose ground stands 32 m up, so some 15 m under the height where the sun's
  // shadows stop (atmosphere.ts), as in the close view.
  {
    name: "barrage, pulled back",
    setup:
      "(async () => { if (!window.__perfBarrage) { __perf.clock(Date.UTC(1916, 5, 23, 10)); await __perf.barrage(true) } window.__perfRadius = verdun.view.camera.radius; await __perf.zoom(170) })()",
    teardown: "(async () => { await __perf.zoom(window.__perfRadius); await __perf.barrage(false) })()"
  }
]

/** --ab's scenarios: the day, then baseline and toggled samples in turn, each toggle followed by time to settle. */
function abScenarios() {
  const settled = (code) =>
    `(async () => { ${code}; await new Promise((resolve) => setTimeout(resolve, ${SETTLE_MS})) })()`
  const rounds = Array.from({ length: ROUNDS }, (_, round) => [
    { name: `base ${round + 1}`, setup: "0" },
    { name: `with ${round + 1}`, setup: settled(AB), teardown: AB_UNDO ? settled(AB_UNDO) : undefined }
  ])
  return [{ name: "day", setup: "__perf.clock(Date.UTC(1916, 5, 23, 10))" }, ...rounds.flat()]
}

/** --ab's verdict: the median of each measure's paired differences, toggled minus baseline. */
function abSummary(results) {
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0
  const pairs = []
  for (let round = 1; round <= ROUNDS; round++) {
    const base = results.find((result) => result.scenario === `base ${round}`)
    const toggled = results.find((result) => result.scenario === `with ${round}`)
    if (base && toggled) {
      pairs.push({ base, toggled })
    }
  }
  const difference = (key) => pairs.map(({ base, toggled }) => toggled[key] - base[key])
  const line = (label, key) =>
    `${label.padEnd(16)} ${median(difference(key)).toFixed(1).padStart(6)} ms  (pairs ${difference(key)
      .map((d) => d.toFixed(1))
      .join(", ")}; baseline about ${median(pairs.map(({ base }) => base[key])).toFixed(1)} ms)`
  return [
    `--ab over ${pairs.length} pairs, toggled minus baseline (negative is faster):`,
    line("GPU 20th pct", "gpuP20"),
    line("GPU median", "gpuP50"),
    line("GPU mean", "gpuMs"),
    line("frame", "frameMs")
  ].join("\n")
}

/**
 * Builds the client as committed at a ref, in a worktree of its own: several sessions edit the shared working tree at
 * once, and a build of it can catch someone's change half made. The encrypted asset pack isn't committed, so it's
 * copied in from this checkout's cache.
 */
async function buildCommit(ref, outDir, slot) {
  // Slot 0 keeps the tree earlier runs installed in, so its dependencies are already there.
  const tree = join(tmpdir(), slot === 0 ? "verdun-perf-tree" : `verdun-perf-tree-${slot}`)
  // Resolved here: in the build tree, HEAD would name the commit that tree last checked out.
  const commit = execFileSync("git", ["rev-parse", ref], { encoding: "utf8" }).trim()
  if (existsSync(join(tree, ".git"))) {
    await run("git", ["-C", tree, "checkout", "--force", "--detach", commit], process.cwd())
  } else {
    await run("git", ["worktree", "add", "--force", "--detach", tree, commit], process.cwd())
  }
  print(`building ${commit.slice(0, 7)}`)
  const pack = join(process.cwd(), ".asset-cache", "pack")
  if (existsSync(pack)) {
    cpSync(pack, join(tree, ".asset-cache", "pack"), { recursive: true })
  }
  await run("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], tree)
  await run("pnpm", ["--filter", "@verdun/client", "exec", "vite", "build", "--outDir", outDir, "--emptyOutDir"], tree)
}

/** A CPU profile's costliest functions by their own time, as lines of milliseconds, name and place. */
function costliest(profile, count) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
  const own = new Map()
  profile.samples.forEach((id, index) => {
    const { functionName, url, lineNumber } = nodes.get(id).callFrame
    const key = `${functionName || "(anonymous)"} ${url.split("/").pop()}:${lineNumber + 1}`
    own.set(key, (own.get(key) ?? 0) + (profile.timeDeltas[index] ?? 0))
  })
  return [...own]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([key, micros]) => `${(micros / 1000).toFixed(0).padStart(38)} ms  ${key}`)
    .join("\n")
}

/**
 * Takes the first free slot of `SLOTS`, by a lock file holding this run's process id, so runs from several sessions at
 * once never build into or serve each other's folders; a lock whose process has gone is taken over. Returns the slot and
 * a function that frees it.
 */
function takeSlot() {
  for (let slot = 0; slot < SLOTS; slot++) {
    const lock = join(tmpdir(), `verdun-perf-slot-${slot}.lock`)
    try {
      writeFileSync(lock, String(process.pid), { flag: "wx" })
    } catch {
      const holder = Number(readFileSync(lock, "utf8"))
      let alive = false
      try {
        process.kill(holder, 0)
        alive = true
      } catch {
        // No such process: its run ended without freeing the slot.
      }
      if (alive) {
        continue
      }
      writeFileSync(lock, String(process.pid))
    }
    return { slot, free: () => rmSync(lock, { force: true }) }
  }
  throw new Error(`all ${SLOTS} perf slots are in use: other runs are measuring, so numbers now would be noise anyway`)
}

/**
 * Clears Chrome profiles earlier runs left in the temp folder, an hour old or more: Chrome can hold one past the clean-up
 * at the end of a run, and they piled up by the dozen.
 */
function sweepOldProfiles() {
  const hourAgo = Date.now() - 3_600_000
  for (const name of readdirSync(tmpdir())) {
    if (!/^verdun-perf-[A-Za-z0-9]{6}$/.test(name)) {
      continue
    }
    const folder = join(tmpdir(), name)
    try {
      if (statSync(folder).mtimeMs < hourAgo) {
        rmSync(folder, { recursive: true, force: true })
      }
    } catch {
      // In use or already gone: the next run tries again.
    }
  }
}

/** A port nobody's listening on now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, () => {
      const address = server.address()
      server.close(() =>
        typeof address === "object" && address ? resolve(address.port) : reject(new Error("no port"))
      )
    })
  })
}

async function main() {
  let preview = null
  let url = option("--url", "")
  const { slot, free } = takeSlot()
  process.on("exit", free)
  sweepOldProfiles()
  if (!url) {
    // Its own build folder: other sessions build into apps/client/dist, and would swap files out under a running game.
    const outDir = join(tmpdir(), `verdun-perf-dist-${slot}`)
    if (!flag("--no-build")) {
      await buildCommit(option("--ref", "HEAD"), outDir, slot)
    }
    const port = await freePort()
    url = `http://localhost:${port}`
    preview = spawn(
      "pnpm",
      [
        "--filter",
        "@verdun/client",
        "exec",
        "vite",
        "preview",
        "--outDir",
        outDir,
        "--port",
        String(port),
        "--strictPort"
      ],
      { stdio: "ignore", shell: process.platform === "win32" }
    )
    await waitForServer(url, 30)
  }
  let chrome = null
  let cdp = null
  try {
    chrome = await launchChrome()
    cdp = await connect(chrome.endpoint)
  } catch (error) {
    // Never leave the preview server or Chrome behind.
    chrome?.stop()
    stopTree(preview)
    throw error
  }
  try {
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" })
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true })
    const evaluate = async (expression) => {
      let timer
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`the page didn't answer within ${EVALUATE_TIMEOUT_MS / 1000} s: ${expression.slice(0, 80)}`)
            ),
          EVALUATE_TIMEOUT_MS
        )
      })
      const { result, exceptionDetails } = await Promise.race([
        cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId),
        timeout
      ]).finally(() => clearTimeout(timer))
      if (exceptionDetails) {
        throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text)
      }
      return result.value
    }
    await cdp.send("Runtime.enable", {}, sessionId)
    await cdp.send("Log.enable", {}, sessionId)
    await cdp.send("Network.enable", {}, sessionId)
    await cdp.send("Page.enable", {}, sessionId)
    await cdp.send("Inspector.enable", {}, sessionId)
    await cdp.send("Target.setDiscoverTargets", { discover: true })
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
      sessionId
    )
    // --query: more of the game's own options for the address, such as inline or snapshot.
    const query = [flag("--operation") ? "" : "free", option("--query", "")].filter(Boolean).join("&")
    await cdp.send(
      "Page.navigate",
      { url: `${url}${url.includes("?") ? "&" : "?"}debug&gputime${query ? `&${query}` : ""}` },
      sessionId
    )
    // Wait for the game, then for the level to be dressed (a few hundred meshes); without the level kit it stays greybox.
    let state = { game: false, meshes: 0 }
    let reloads = 0
    for (let attempt = 0; attempt < 240 && state.meshes <= 300; attempt++) {
      await sleep(500)
      // Chrome here now and then aborts a few of the many module fetches, and the game never starts. A reload finds
      // most of them cached and gets through.
      if (!state.game && reloads < 3 && cdp.errors.some((line) => line.includes("Failed to fetch"))) {
        reloads++
        cdp.errors.length = 0
        print(`some files failed to load: reloading (${reloads})`)
        await cdp.send("Page.reload", {}, sessionId)
        attempt = 0
        continue
      }
      state = await evaluate(
        "({ game: !!window.verdun?.trace, meshes: window.verdun?.engine.scenes[0].meshes.length ?? 0 })"
      ).catch(() => state)
      if (state.game && attempt > 60 && state.meshes <= 300) {
        print("the level kit didn't load: measuring the greybox battlefield (is .asset-cache/pack up to date?)")
        break
      }
    }
    if (!state.game) {
      const said = cdp.errors.slice(0, 8).join("\n")
      throw new Error(`the game didn't start within two minutes. The page said:\n${said}`)
    }
    const machine = await evaluate(`(() => {
      ${HELPERS}
      const device = verdun.engine._device
      return {
        renderer: verdun.engine.isWebGPU ? "WebGPU" : "WebGL2",
        timestamps: device ? [...device.features].includes("timestamp-query") : false,
        size: [verdun.engine.getRenderWidth(), verdun.engine.getRenderHeight()],
        hidden: document.hidden
      }
    })()`)
    print(
      `${machine.renderer} at ${machine.size.join("×")}, GPU timestamps ${machine.timestamps ? "on" : "unavailable"}${machine.hidden ? ", PAGE HIDDEN: throttled" : ""}`
    )
    // Let the camera drop in and the first recordings settle.
    await sleep(8000)
    // --eval: page-side code to report on before measuring, such as counts of what's drawn.
    const report = option("--eval", "")
    if (report) {
      print(JSON.stringify(await evaluate(report), null, 1))
    }
    const results = []
    // What was measured is written even when a scenario fails part way.
    try {
      for (const scenario of AB ? abScenarios() : SCENARIOS) {
        // --only picks among the usual scenarios; --ab brings its own.
        if (!AB && ONLY.length > 0 && !ONLY.includes(scenario.name)) {
          continue
        }
        await evaluate(scenario.setup)
        // --profile: a CPU profile of each scenario's sample, for Chrome's DevTools, and its costliest functions here.
        const profiles = option("--profile", "")
        if (profiles) {
          await cdp.send("Profiler.enable", {}, sessionId)
          await cdp.send("Profiler.start", {}, sessionId)
        }
        const result = await evaluate(`__perf.sample(${SECONDS})`)
        if (profiles) {
          const { profile } = await cdp.send("Profiler.stop", {}, sessionId)
          writeFileSync(join(profiles, `${scenario.name.replace(/[^\w]+/g, "-")}.cpuprofile`), JSON.stringify(profile))
          print(costliest(profile, 15))
        }
        const shots = option("--shots", "")
        if (shots) {
          // What each scenario looked like, to check a faster setting still draws the same picture.
          const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 80 }, sessionId)
          writeFileSync(join(shots, `${scenario.name.replace(/[^\w]+/g, "-")}.jpg`), Buffer.from(data, "base64"))
        }
        if (scenario.teardown) {
          await evaluate(scenario.teardown)
        }
        results.push({ scenario: scenario.name, ...result })
        const hot = result.hot
          .slice(0, 4)
          .map(([name, ms]) => `${ms} ${name.replace("babylon: ", "")}`)
          .join(" | ")
        print(
          `${scenario.name.padEnd(28)} ${result.fps.toFixed(1).padStart(5)} fps  ${result.frameMs.toFixed(1).padStart(5)} ms (worst ${result.worstMs.toFixed(0)})  GPU ${result.gpuMs ? `${result.gpuMs.toFixed(1)} ms, 20th pct ${result.gpuP20.toFixed(1)}` : "n/a"}  ${result.snapshot}\n${" ".repeat(30)}${hot}` +
            (result.passes.length > 0
              ? `\n${" ".repeat(30)}GPU: ${result.passes.map(([name, ms]) => `${ms} ${name}`).join(" | ")}`
              : "")
        )
      }
    } finally {
      const out = option("--out", "")
      if (out) {
        writeFileSync(out, JSON.stringify({ machine, width: WIDTH, height: HEIGHT, results }, null, 2))
      }
    }
    if (AB) {
      print(abSummary(results))
    }
  } catch (error) {
    print(`the page said, last:\n${cdp.errors.slice(-12).join("\n")}`)
    throw error
  } finally {
    cdp.close()
    chrome.stop()
    stopTree(preview)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
