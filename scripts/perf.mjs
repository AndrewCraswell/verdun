// Measures the game's frame rate and where the time goes, with nobody at the keyboard: builds the client, serves it,
// and runs it in headless Chrome on this machine's GPU, which unlike a background window or an embedded pane isn't
// throttled. Each scenario plays the battle for a few seconds and reports frames per second, frame time, the GPU's time
// where Chrome allows timestamp queries, and the hot spots from the game's own tracer (debug/trace.ts).
//
// Usage: node scripts/perf.mjs [--headed] [--ref HEAD] [--url http://localhost:5173] [--no-build] [--width 1920]
//                              [--height 1080] [--seconds 6] [--only "day;night"] [--out perf.json] [--shots dir]
//                              [--eval "page-side expression"] [--query "inline"] [--operation] [--profile dir]
//                              [--ab "page-side toggle" [--ab-undo "page-side undo"] [--rounds 4] [--settle 2500]]
//                              [--budget | --write-budget [--rounds 3]] [--chrome path/to/chrome.exe]
// --headed runs a real Chrome window off-screen: headless Chrome here aborts some module fetches. --shots saves what
// each scenario looked like, to check a faster setting still draws the picture. --eval prints a page-side expression
// once the game is up, such as counts of what's drawn. --profile saves a CPU profile of each scenario for Chrome's
// DevTools and prints its costliest functions, named and placed in the game's or Babylon's source by the build's
// source maps. The battle is played free (?free), in the close view the
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
// Each scenario also counts what it drew, which other programs' load barely moves: a frame's draw calls and render
// passes, by the target each drew into, its meshes in view, triangles and particles, and the GPU memory, pipelines,
// shaders and materials held at the end. Passes, draws, GPU memory and pipelines come from a tap on WebGPU's own calls
// (GPU_TAP), set in each tab before the game's scripts; the canvas's own textures never pass through it. A frame that
// redrew the depth map is set apart, since how many do depends on the frame rate (__perf.count).
// --budget holds those counts to scripts/perf-budget.json as committed at the build measured: each of BUDGET_SCENARIOS
// plays in a fresh tab at its graphics setting, so none carries what an earlier one made, and it fails naming every
// count over its limit, and which commits since the budget was recorded could be why. It measures a commit, so commit
// first. --write-budget plays them --rounds times and records the most each count reached, with the headroom COUNTS and
// BUDGET_SCENARIOS allow, as the limits for HEAD: commit the file after the change that means to cost more. Both take
// --only, but not --url, --ab, --operation, --query, --eval, --width, --height or --seconds.

import { execFileSync, spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { SourceMap } from "node:module"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { fileURLToPath } from "node:url"

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
/** --budget checks the build against the budget file; --write-budget records it there. */
const BUDGET = flag("--budget")
const WRITE_BUDGET = flag("--write-budget")
/**
 * --ab: rounds of baseline and toggled samples, and how long to wait after each toggle. --write-budget: how many times
 * it plays each budgeted scenario, each in a fresh tab, to see how far its counts move from run to run.
 */
const AB = option("--ab", "")
const AB_UNDO = option("--ab-undo", "")
const ROUNDS = Number(option("--rounds", WRITE_BUDGET ? 3 : 4))
const SETTLE_MS = Number(option("--settle", 2500))
// Semicolons between names: the names have commas in them.
const ONLY = option("--only", "")
  .split(";")
  .filter((name) => name.length > 0)
/** The budget file: read as committed at the build measured, written in this checkout. */
const BUDGET_PATH = "scripts/perf-budget.json"
const BUDGET_FILE = fileURLToPath(new URL("perf-budget.json", import.meta.url))
/** What a build leaves in its folder: the commit it was built from and which asset pack it carries. */
const STAMP = "perf-build.json"
/**
 * The scenarios held to a budget, by graphics setting (a page load of its own, as ?quality= has it), each with more
 * headroom than COUNTS gives where it moves more from run to run: the night's sentries send flares up of their own, and
 * a barrage's bursts come and go.
 */
const BUDGET_SCENARIOS = {
  high: {
    day: {},
    "night, flare up": { draws: { rel: 0.15 }, triangles: { rel: 0.2 }, particles: { rel: 1 } },
    overview: {},
    "barrage, pulled back": { draws: { rel: 0.12 }, particles: { rel: 1 } }
  },
  low: { day: {}, "night, flare up": { draws: { rel: 0.15 }, particles: { rel: 1 } } }
}
/**
 * The counts held to a budget. A frame's counts are held by their mean over the sample's frames (bind groups by their
 * median: one made every frame is a cache missing, one now and then something new drawn); the rest by what's held at its
 * end. --write-budget allows `rel` more than the most a count reached over its rounds, or `abs` more, or as much more as
 * the rounds differed by, whichever is most. Buffers aren't held by number: the GPU timer's read-back pool (?gputime)
 * grows a buffer whenever the GPU falls behind, so their number moves with load.
 */
const COUNTS = {
  draws: { by: "mean", rel: 0.08, abs: 30, label: "draw calls" },
  passes: { by: "mean", rel: 0, abs: 0.25, label: "render passes" },
  meshes: { by: "mean", rel: 0.08, abs: 15, label: "meshes in view" },
  triangles: { by: "mean", rel: 0.1, abs: 50_000, label: "triangles" },
  particles: { by: "mean", rel: 0.5, abs: 1000, label: "particles" },
  bindGroups: { by: "p50", rel: 0, abs: 1, label: "bind groups made" },
  textureMB: { by: "end", rel: 0.03, abs: 8, label: "MB of textures" },
  textures: { by: "end", rel: 0.03, abs: 8, label: "textures" },
  bufferMB: { by: "end", rel: 0.1, abs: 8, label: "MB of buffers" },
  pipelines: { by: "end", rel: 0.05, abs: 10, label: "render pipelines" },
  effects: { by: "end", rel: 0.05, abs: 10, label: "shaders" },
  materials: { by: "end", rel: 0.03, abs: 3, label: "materials" }
}
/** Drawing far less than recorded is a broken picture, a blank frame say, not a saving: these fail under half. */
const BROKEN_UNDER = { share: 0.5, counts: ["draws", "passes", "triangles"] }
/** A budgeted sample needs this many frames between depth-map redraws to count. */
const FEWEST_FRAMES = 60

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

/**
 * Set in each tab before any of the game's scripts (Page.addScriptToEvaluateOnNewDocument): tallies what the page asks
 * WebGPU for, whatever Babylon's own bookkeeping covers, which misses the main depth buffer and keeps multisampled
 * copies apart. A texture counts at its logical size, every texel of every mip level, layer and sample at its format's
 * size: the least the driver holds, without its padding; depth24plus, whose size WebGPU leaves to the driver, at 4
 * bytes. Sizes are read off the texture itself, as Babylon does, and off a buffer's descriptor, as Babylon does too
 * (its GPUBuffer.size has failed under automation). Textures and buffers dropped without destroy() still count; the
 * canvas's own textures (getCurrentTexture), query sets and external textures never pass through here.
 * `frame` tallies render passes and their draws by the target each drew into, as the label Babylon gives the pass names
 * it, for the page to read and start afresh each frame. Draws recorded into render bundles aren't counted, only the
 * bundles run: in its compatibility mode, its default, Babylon records every draw straight into the pass. A second
 * device, or a lost one, which Babylon replaces by making everything again, would spoil the tallies, so both are counted.
 */
const GPU_TAP = `(() => {
  if (typeof GPUDevice === "undefined" || window.__gpuTap) return
  const tap = {
    textures: 0, textureBytes: 0, buffers: 0, bufferBytes: 0, renderPasses: 0, computePasses: 0, draws: 0, bundles: 0,
    pipelines: 0, bindGroups: 0, devices: 0, lost: 0, adapter: null, features: null, frame: new Map()
  }
  window.__gpuTap = tap
  const sizes = new WeakMap()
  const tallies = new WeakMap()
  const texel = (f) =>
    /^rgba32/.test(f) ? 16
    : /^(rg32|rgba16|depth32float-stencil8)/.test(f) ? 8
    : /^(r32|rg16|rgba8|bgra8|rgb10a2|rg11b10|rgb9e5|depth32float|depth24plus)/.test(f) ? 4
    : /^(r16|rg8|depth16)/.test(f) ? 2
    : /^(r8|stencil8)/.test(f) ? 1
    : 4
  // Compressed formats: block width, height and bytes.
  const block = (f) => {
    const astc = /^astc-(\\d+)x(\\d+)-/.exec(f)
    if (astc) return [Number(astc[1]), Number(astc[2]), 16]
    if (/^(bc1|bc4|etc2-rgb8unorm|etc2-rgb8a1|eac-r11)/.test(f)) return [4, 4, 8]
    if (/^(bc|etc2|eac)/.test(f)) return [4, 4, 16]
    return [1, 1, texel(f)]
  }
  const textureBytes = (t) => {
    const [bw, bh, bb] = block(t.format)
    let bytes = 0
    for (let level = 0; level < t.mipLevelCount; level++) {
      const w = Math.max(1, t.width >> level)
      const h = Math.max(1, t.height >> level)
      const d = t.dimension === "3d" ? Math.max(1, t.depthOrArrayLayers >> level) : t.depthOrArrayLayers
      bytes += Math.ceil(w / bw) * Math.ceil(h / bh) * d * bb
    }
    return bytes * t.sampleCount
  }
  // Wraps a method to call then(what it returned, its arguments, the object it was called on) after it.
  const after = (proto, name, then) => {
    const original = proto[name]
    proto[name] = function (...args) {
      const made = original.apply(this, args)
      then(made, args, this)
      return made
    }
  }
  after(GPUDevice.prototype, "createTexture", (texture) => {
    const bytes = textureBytes(texture)
    sizes.set(texture, bytes)
    tap.textures++
    tap.textureBytes += bytes
  })
  after(GPUDevice.prototype, "createBuffer", (buffer, [descriptor]) => {
    sizes.set(buffer, descriptor.size)
    tap.buffers++
    tap.bufferBytes += descriptor.size
  })
  const destroyed = (proto, count, total) => {
    const original = proto.destroy
    proto.destroy = function () {
      const bytes = sizes.get(this)
      if (bytes !== undefined) {
        sizes.delete(this)
        tap[count]--
        tap[total] -= bytes
      }
      return original.call(this)
    }
  }
  destroyed(GPUTexture.prototype, "textures", "textureBytes")
  destroyed(GPUBuffer.prototype, "buffers", "bufferBytes")
  // Babylon labels a pass "[frame|pass] - MainRenderPass", or "[frame|pass] - <its target's name> - RenderPass".
  after(GPUCommandEncoder.prototype, "beginRenderPass", (pass, [descriptor]) => {
    tap.renderPasses++
    const label = String(descriptor?.label ?? "").replace(/^\\[[^\\]]*\\] - /, "").replace(/ - RenderPass$/, "")
    let tally = tap.frame.get(label || "unlabelled")
    if (!tally) {
      tally = { passes: 0, draws: 0 }
      tap.frame.set(label || "unlabelled", tally)
    }
    tally.passes++
    tallies.set(pass, tally)
  })
  for (const name of ["draw", "drawIndexed", "drawIndirect", "drawIndexedIndirect"]) {
    after(GPURenderPassEncoder.prototype, name, (_made, _args, pass) => {
      tap.draws++
      const tally = tallies.get(pass)
      if (tally) tally.draws++
    })
  }
  after(GPURenderPassEncoder.prototype, "executeBundles", () => tap.bundles++)
  after(GPUCommandEncoder.prototype, "beginComputePass", () => tap.computePasses++)
  after(GPUDevice.prototype, "createRenderPipeline", () => tap.pipelines++)
  after(GPUDevice.prototype, "createRenderPipelineAsync", () => tap.pipelines++)
  after(GPUDevice.prototype, "createBindGroup", () => tap.bindGroups++)
  const requestDevice = GPUAdapter.prototype.requestDevice
  GPUAdapter.prototype.requestDevice = async function (...args) {
    const device = await requestDevice.apply(this, args)
    tap.devices++
    const info = this.info ?? {}
    tap.adapter = [info.vendor, info.architecture, info.device, info.description].filter(Boolean).join(" ") || "unknown"
    tap.features = [...device.features].sort().join(", ")
    device.lost.then(() => tap.lost++)
    return device
  }
})()`

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
  // A change of settings recompiles shaders, which stalls for seconds: resolves after two seconds in a row that agree,
  // or 15 seconds.
  async steady() {
    let last = 0
    for (let second = 0; second < 15; second++) {
      await new Promise((r) => setTimeout(r, 1000))
      const now = verdun.trace.frames
      const steady = last > 0 && Math.abs(now.averageMs - last) < last * 0.1 && now.worstMs < now.averageMs * 3
      last = now.averageMs
      if (steady) return
    }
  },
  // What the battle holds: GPU memory and pipelines from the tap (WebGPU only), the rest from Babylon.
  held() {
    const engine = verdun.engine
    const scene = engine.scenes[0]
    const tap = engine.isWebGPU ? window.__gpuTap ?? null : null
    return {
      textureMB: tap ? +(tap.textureBytes / 1048576).toFixed(1) : null,
      textures: tap ? tap.textures : null,
      bufferMB: tap ? +(tap.bufferBytes / 1048576).toFixed(1) : null,
      buffers: tap ? tap.buffers : null,
      pipelines: tap ? tap.pipelines : null,
      effects: engine._compiledEffects ? Object.keys(engine._compiledEffects).length : null,
      materials: scene.materials.length,
      meshes: scene.meshes.length,
      enabledMeshes: scene.getActiveMeshCandidates().length,
      particleSystems: scene.particleSystems.length
    }
  },
  // Counts each frame between the engine beginning it and ending it (onBeginFrameObservable, onEndFrameObservable). The
  // tap gives its render passes and draws, by the target each drew into; Babylon's own draw count (engine._drawCalls,
  // cleared otherwise only by an open inspector) is kept beside them as a check; the scene's counts are of the frame it
  // drew. A frame the render loop passed over (the frame cap) drew none of the scene, and isn't counted. A frame that
  // drew the depth map again, as the game does only once the ground or the view has changed (level/post-process.ts), is
  // set apart: how many do depends on the frame rate, with a barrage's craters and shakes coming several a second, so
  // the counts held are those of the frames between. Anything that throws in here is caught and reported: a throw in
  // the engine's frame observers would stop its render loop for good.
  count() {
    const engine = verdun.engine
    const scene = engine.scenes[0]
    const tap = engine.isWebGPU ? window.__gpuTap ?? null : null
    const babylon = typeof engine._drawCalls?.fetchNewFrame === "function" ? engine._drawCalls : null
    const redrawn = /DepthRenderer/
    const frames = []
    let open = null
    let failed = null
    const guarded = (body) => () => {
      if (failed !== null) return
      try {
        body()
      } catch (error) {
        failed = String(error)
      }
    }
    const began = engine.onBeginFrameObservable.add(guarded(() => {
      babylon?.fetchNewFrame()
      if (tap) tap.frame = new Map()
      open = { id: scene.getFrameId(), bindGroups: tap ? tap.bindGroups : 0 }
    }))
    const ended = engine.onEndFrameObservable.add(guarded(() => {
      const was = open
      open = null
      if (!was || scene.getFrameId() === was.id) return
      const frame = {
        draws: babylon ? babylon.current : null,
        babylonDraws: babylon ? babylon.current : null,
        passes: null,
        meshes: scene.getActiveMeshes().length,
        triangles: Math.round(scene.getActiveIndices() / 3),
        particles: scene.getActiveParticles(),
        bones: scene.getActiveBones(),
        bindGroups: tap ? tap.bindGroups - was.bindGroups : null,
        redrew: false,
        byTarget: {}
      }
      if (tap) {
        frame.draws = 0
        frame.passes = 0
        for (const [label, tally] of tap.frame) {
          frame.draws += tally.draws
          frame.passes += tally.passes
          frame.byTarget[label] = tally.draws
          if (redrawn.test(label)) frame.redrew = true
        }
      }
      frames.push(frame)
    }))
    return {
      stop() {
        began.remove()
        ended.remove()
      },
      summary() {
        const steady = frames.filter((frame) => !frame.redrew)
        const spread = (name, list) => {
          const values = list.map((frame) => frame[name]).filter((value) => typeof value === "number")
          if (values.length === 0) return null
          const sorted = [...values].sort((a, b) => a - b)
          const at = (q) => sorted[Math.floor((sorted.length - 1) * q)]
          const mean = values.reduce((sum, value) => sum + value, 0) / values.length
          return { mean: +mean.toFixed(1), p50: at(0.5), p90: at(0.9), max: sorted[sorted.length - 1] }
        }
        const counts = {}
        for (const name of ["draws", "babylonDraws", "passes", "meshes", "triangles", "particles", "bones", "bindGroups"]) {
          counts[name] = spread(name, steady)
        }
        // What each target drew, a frame on average: where a count over budget grew.
        const byTarget = {}
        for (const frame of steady) {
          for (const [label, draws] of Object.entries(frame.byTarget)) byTarget[label] = (byTarget[label] ?? 0) + draws
        }
        for (const label in byTarget) byTarget[label] = +(byTarget[label] / steady.length).toFixed(1)
        const redrew = frames.filter((frame) => frame.redrew)
        return {
          counted: frames.length,
          steady: steady.length,
          redrew: redrew.length,
          redrewDraws: spread("draws", redrew)?.mean ?? null,
          counts,
          byTarget,
          failed
        }
      }
    }
  },
  // Samples the battle for some seconds, first waiting for it to run steadily unless the scenario has already.
  async sample(seconds, settle = true) {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    if (settle) await __perf.steady()
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
    const start = __perf.held()
    const counter = __perf.count()
    requestAnimationFrame(collect)
    const seconds_ = []
    try {
      for (let second = 0; second < seconds; second++) {
        await wait(1000)
        const f = verdun.trace.frames
        seconds_.push({ fps: f.perSecond, ms: f.averageMs, worst: f.worstMs, gpu: gpu ? gpu.lastSecAverage / 1e6 : 0 })
      }
    } finally {
      collecting = false
      counter.stop()
    }
    const totals = __perf.held()
    // Grown while sampling: a scenario standing still that keeps taking memory or making pipelines leaks them.
    const grew = {}
    for (const name of ["textureMB", "bufferMB", "pipelines", "effects"]) {
      grew[name] = totals[name] === null || start[name] === null ? null : +(totals[name] - start[name]).toFixed(1)
    }
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
    const tap = engine.isWebGPU ? window.__gpuTap ?? null : null
    return {
      fps: mean("fps"),
      frameMs: mean("ms"),
      worstMs: Math.max(...seconds_.map((s) => s.worst)),
      gpuMs: mean("gpu"),
      gpuP20: percentile(0.2),
      gpuP50: percentile(0.5),
      passes: passes.filter(([, ms]) => ms > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, ms]) => [name, +ms.toFixed(2)]),
      snapshot: verdun.snapshots ? (verdun.snapshots.playing ? "replaying" : "live: " + verdun.snapshots.lastReason) : "off",
      hot: verdun.trace.hotSpots(20).map((s) => [s.name, +s.selfMsPerFrame.toFixed(2)]),
      ...counter.summary(),
      totals,
      grew,
      flares: verdun.sim.flares.length,
      gpu: tap ? { devices: tap.devices, lost: tap.lost, bundles: tap.bundles, adapter: tap.adapter, features: tap.features } : null
    }
  },
  // Sends a flare up over where the camera looks, from 80 m behind it on the player's side, as one of his sentries would
  // (the flare command, packages/sim/src/commands.ts), and resolves with it once it's age seconds old: 20 ticks a second.
  async flareOver(age) {
    const sim = verdun.sim
    const side = verdun.control.squad.side
    const { x, z } = verdun.view.camera.target
    const after = sim.tick
    // The French hold the south of the map and face north, toward +z; the Germans the north.
    sim.pendingCommands.push({ type: "flare", side, fromX: x, fromZ: z + (side === 0 ? -80 : 80), x, z })
    const ours = () => sim.flares.find((f) => f.firedAt >= after && Math.hypot(f.x - x, f.z - z) < 1)
    if (!(await __perf.until(() => ours() !== undefined, 10000))) {
      throw new Error("no flare went up: does the simulation take the flare command?")
    }
    const flare = ours()
    if (!(await __perf.until(() => sim.tick - flare.firedAt >= age * 20, 60000))) {
      throw new Error("the flare didn't reach " + age + " s old within a minute")
    }
    return flare
  },
  // The night under a flare over where the camera looks, the same on every run: whether one is up, and where, swings
  // the night's draws, since the leading flare's shadows take whatever stands within its light's reach
  // (effects/flare-view.ts), and the sentries send theirs up at random. Sampled from 4 to 10 s old, it hangs 86 to 65 m
  // up (FLARE, packages/sim/src/flares.ts). Where it throws shadows, a first flare goes up and burns out before it, so
  // the shaders its shadows need are made before the sample rather than in it, and so the first doesn't take the light
  // from the one measured. The sentries' own flares may still go up beside it: the sample says how many were up.
  async flareUp() {
    __perf.clock(Date.UTC(1916, 5, 23, 22, 30))
    // Dark, the flares' lights come on, and every lit material compiles again.
    await __perf.steady()
    if (verdun.engine.scenes[0].getLightByName("flare-light-0")?.getShadowGenerator()) {
      const first = await __perf.flareOver(4)
      await __perf.steady()
      await __perf.until(() => !verdun.sim.flares.some((f) => f.firedAt === first.firedAt), 30000)
    }
    await __perf.flareOver(4)
  },
  // Resolves once the flares have burnt out and their smoke and sparks have gone (AFTERLIFE, effects/flare-view.ts).
  async flaresOut() {
    await __perf.until(() => verdun.sim.flares.length === 0, 30000)
    await new Promise((r) => setTimeout(r, 7000))
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

/**
 * What's measured: each a name and the page-side code that sets it up before sampling. An `optional` scenario plays
 * only when --only or a budget names it; a `settled` one's setup leaves the battle running steadily, so its sample
 * starts at once.
 */
const SCENARIOS = [
  { name: "day", setup: "__perf.clock(Date.UTC(1916, 5, 23, 10))" },
  { name: "day, camera moving", setup: "__perf.moveCamera(true)", teardown: "__perf.moveCamera(false)" },
  { name: "night", setup: "__perf.clock(Date.UTC(1916, 5, 23, 22, 30))" },
  // For budgets: the night under a flare of the camera's own (flareUp), a minute or so to set up.
  {
    name: "night, flare up",
    optional: true,
    settled: true,
    setup: "__perf.flareUp()",
    teardown: "(async () => { __perf.clock(Date.UTC(1916, 5, 23, 10)); await __perf.flaresOut() })()"
  },
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
  // The counts show whether the toggle took at all: one that changes nothing drawn measures as noise.
  const count = (label, name) => {
    const changes = pairs.map(({ base, toggled }) => {
      const before = measured(base, name)
      const now = measured(toggled, name)
      return before === null || now === null ? null : +(now - before).toFixed(1)
    })
    if (changes.length === 0 || changes.includes(null)) {
      return `${label.padEnd(16)}    n/a     (not counted: the GPU tap counts on WebGPU only)`
    }
    return `${label.padEnd(16)} ${String(median(changes)).padStart(6)}     (pairs ${changes.join(", ")})`
  }
  return [
    `--ab over ${pairs.length} pairs, toggled minus baseline (negative is faster):`,
    line("GPU 20th pct", "gpuP20"),
    line("GPU median", "gpuP50"),
    line("GPU mean", "gpuMs"),
    line("frame", "frameMs"),
    count("draw calls", "draws"),
    count("render passes", "passes"),
    count("MB of textures", "textureMB")
  ].join("\n")
}

/** A count as a budget holds it (see COUNTS), or null where it wasn't counted. */
function measured(result, name) {
  const { by } = COUNTS[name]
  const value = by === "end" ? result.totals?.[name] : result.counts?.[name]?.[by]
  return typeof value === "number" ? value : null
}

/** The lines under a scenario's timings: what a frame drew and into which targets, then what's held. */
function countsLines(result) {
  const { counts, totals, grew } = result
  const frame = (name, label) =>
    counts[name]
      ? `${counts[name].mean} ${label}${counts[name].max > counts[name].mean ? ` (most ${counts[name].max})` : ""}`
      : `no ${label}`
  const triangles = counts.triangles ? `${(counts.triangles.mean / 1e6).toFixed(2)} M triangles` : "no triangles"
  const targets = Object.entries(result.byTarget)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([label, draws]) => `${draws} ${label}`)
  const growth = Object.entries(grew)
    .filter(([, change]) => change)
    .map(([name, change]) => `${change > 0 ? "+" : ""}${change} ${COUNTS[name].label}`)
  return [
    `${frame("draws", "draws")} (Babylon's count ${counts.babylonDraws?.mean ?? "n/a"}), ${frame("passes", "passes")}, ${frame("meshes", "meshes")}, ${triangles}, ${frame("particles", "particles")}, ${counts.bindGroups?.p50 ?? "no"} bind groups made a frame`,
    `${result.steady} of ${result.counted} frames counted, ${result.redrew} redrawing the depth map${result.redrewDraws === null ? "" : ` (${result.redrewDraws} draws)`}; ${result.flares} flares up; draws by target: ${targets.join(" | ") || "n/a"}`,
    `${totals.textureMB ?? "n/a"} MB in ${totals.textures ?? "n/a"} textures, ${totals.bufferMB ?? "n/a"} MB in ${totals.buffers ?? "n/a"} buffers, ${totals.pipelines ?? "n/a"} pipelines, ${totals.effects ?? "n/a"} shaders, ${totals.materials} materials, ${totals.enabledMeshes} of ${totals.meshes} meshes enabled` +
      (growth.length > 0 ? `; while sampling ${growth.join(", ")}` : "") +
      (result.failed ? `; COUNTING FAILED: ${result.failed}` : "")
  ]
}

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim()

/** The budget file as committed at a commit, or null where it has none. */
function budgetAt(commit) {
  let text = null
  try {
    text = execFileSync("git", ["show", `${commit}:${BUDGET_PATH}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    })
  } catch {
    return null
  }
  return JSON.parse(text)
}

/** The build in a folder, as the stamp its build left there has it ({ commit, pack }), or null where there's none. */
function stampOf(outDir) {
  const file = join(outDir, STAMP)
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null
}

/**
 * --budget and --write-budget's runs: each budgeted scenario at its graphics setting in a tab of its own, so that what
 * it holds is what it made, not what scenarios before it did, --only narrowing them; --write-budget plays them all
 * --rounds times.
 */
function budgetRuns() {
  const runs = []
  for (let round = 1; round <= (WRITE_BUDGET ? ROUNDS : 1); round++) {
    for (const [quality, budgeted] of Object.entries(BUDGET_SCENARIOS)) {
      for (const name of Object.keys(budgeted)) {
        const scenario = SCENARIOS.find((each) => each.name === name)
        if (!scenario) {
          throw new Error(`BUDGET_SCENARIOS names "${name}", which is no scenario`)
        }
        if (ONLY.length === 0 || ONLY.includes(name)) {
          runs.push({ round, quality, scenarios: [scenario] })
        }
      }
    }
  }
  return runs
}

/** Why a sample can't be held to a budget, if it can't: too few frames, a hidden page, a lost device. */
function unfit(result) {
  const where = `${result.quality}, ${result.scenario}`
  const reasons = []
  if (result.failed) {
    reasons.push(`${where}: counting failed in the page: ${result.failed}`)
  }
  if (result.steady < FEWEST_FRAMES) {
    reasons.push(`${where}: ${result.steady} of ${result.counted} frames between depth-map redraws, too few to count`)
  }
  if (result.hidden) {
    reasons.push(`${where}: the page was hidden, and throttled`)
  }
  if (!result.gpu) {
    reasons.push(`${where}: no GPU tap in the page: budgets are for WebGPU`)
  } else if (result.gpu.devices !== 1 || result.gpu.lost > 0) {
    reasons.push(`${where}: ${result.gpu.devices} GPU devices made and ${result.gpu.lost} lost: the tallies are spoilt`)
  } else if (result.gpu.bundles > 0) {
    reasons.push(`${where}: ${result.gpu.bundles} render bundles ran, whose draws the tap can't see`)
  }
  return reasons
}

/** What differs between the run that recorded a budget and this one, which may be why a count moved. */
function differences(entry, result, machine, build) {
  const was = {
    chrome: entry.chrome,
    babylon: entry.babylon,
    adapter: entry.adapter,
    features: entry.features,
    pack: entry.pack
  }
  const now = {
    chrome: machine.chrome,
    babylon: machine.babylon,
    adapter: result.gpu?.adapter,
    features: result.gpu?.features,
    pack: build.pack
  }
  return Object.keys(was)
    .filter((key) => was[key] !== now[key])
    .map((key) => `recorded with ${key} ${was[key] ?? "unknown"}, measured with ${now[key] ?? "unknown"}`)
}

/** Which targets' draws grew most against what the budget recorded, for a draw count over it. */
function grownTargets(entry, result) {
  const grown = Object.entries(result.byTarget)
    .map(([label, draws]) => [label, +(draws - (entry.drawsByTarget?.[label] ?? 0)).toFixed(1)])
    .filter(([, change]) => change > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
  return grown.length > 0 ? `; grown most: ${grown.map(([label, change]) => `${label} +${change}`).join(", ")}` : ""
}

/**
 * Holds each result to the budget committed with the build, and each sample to being one worth holding. Prints every
 * count over its limit, by how much and, for draws, in which targets; every count far under what was recorded; and on
 * any failure, the commits since each failing budget was recorded. Returns whether all held.
 */
function checkBudget(budget, results, machine, build) {
  const problems = []
  // Notes by their text, with the scenarios each was true of: a new Chrome is true of them all.
  const notes = new Map()
  const note = (text, where) => notes.set(text, [...(notes.get(text) ?? []), where])
  const since = new Set()
  if (budget.renderer !== machine.renderer || budget.size !== machine.size.join("x")) {
    problems.push(
      `the budget is for ${budget.renderer} at ${budget.size}, but this ran ${machine.renderer} at ${machine.size.join("x")}`
    )
  }
  for (const result of results) {
    const where = `${result.quality}, ${result.scenario}`
    problems.push(...unfit(result))
    const entry = budget.profiles?.[result.quality]?.[result.scenario]
    if (!entry) {
      problems.push(`${where}: no budget at ${build.commit.slice(0, 7)}; record one with --write-budget`)
      continue
    }
    for (const difference of differences(entry, result, machine, build)) {
      note(difference, where)
    }
    let over = false
    for (const [name, { least, limit }] of Object.entries(entry.counts)) {
      const value = name in COUNTS ? measured(result, name) : null
      const label = COUNTS[name]?.label ?? name
      if (value === null) {
        problems.push(`${where}: the budget holds ${label}, which weren't counted`)
        over = true
      } else if (value > limit) {
        const by = +(value - limit).toFixed(1)
        problems.push(
          `${where}: ${value} ${label} against a budget of ${limit}, ${by} (${Math.round((by / limit) * 100)}%) over${name === "draws" ? grownTargets(entry, result) : ""}`
        )
        over = true
      } else if (BROKEN_UNDER.counts.includes(name) && value < least * BROKEN_UNDER.share) {
        problems.push(
          `${where}: ${value} ${label}, under half the least recorded (${least}): check --shots for a blank frame`
        )
        over = true
      } else if (value < least * 0.8) {
        note(`${value} ${label}, well under the ${least} recorded: --write-budget would tighten it`, where)
      }
    }
    if (over) {
      since.add(entry.commit)
    }
    print(`budget ${where}: ${over ? "not met" : `all ${Object.keys(entry.counts).length} counts within`}`)
  }
  for (const [text, scenarios] of notes) {
    print(`note: ${text} (${scenarios.join("; ")})`)
  }
  for (const problem of problems) {
    print(`BUDGET NOT MET ${problem}`)
  }
  for (const commit of since) {
    let log = ""
    try {
      log = git("log", "--oneline", "--no-merges", "-20", `${commit}..${build.commit}`, "--", "apps", "packages")
    } catch {
      log = `(${commit.slice(0, 7)} isn't in this checkout's history)`
    }
    print(
      `committed to apps and packages since the budget was recorded at ${commit.slice(0, 7)}:\n${log || "(nothing)"}`
    )
  }
  if (since.size > 0) {
    print(`if the cost is meant, record it with --write-budget and commit ${BUDGET_PATH}`)
  }
  return problems.length === 0
}

/**
 * The limits a scenario's rounds set: the most each count reached, plus `rel` of it, or `abs`, or as much as the rounds
 * differed by, whichever is most (COUNTS, with the scenario's own headroom over it). Rounded up to a tenth: a frame's
 * counts are means.
 */
function limitsOf(rounds, headroom) {
  const counts = {}
  for (const [name, count] of Object.entries(COUNTS)) {
    const { rel, abs } = { ...count, ...headroom[name] }
    const values = rounds.map((result) => measured(result, name))
    if (values.includes(null)) {
      continue
    }
    const least = Math.min(...values)
    const most = Math.max(...values)
    const limit = Math.ceil((most + Math.max(abs, most * rel, most - least)) * 10) / 10
    counts[name] = { least, most, limit }
  }
  return counts
}

/** Each target's draws a frame, on average over a scenario's rounds. */
function drawsByTarget(rounds) {
  const totals = {}
  for (const result of rounds) {
    for (const [label, draws] of Object.entries(result.byTarget)) {
      totals[label] = (totals[label] ?? 0) + draws / rounds.length
    }
  }
  return Object.fromEntries(Object.entries(totals).map(([label, draws]) => [label, +draws.toFixed(1)]))
}

/**
 * Records the rounds as the budget for their graphics settings and scenarios, with what they were measured on, keeping
 * the other entries as committed at HEAD and dropping scenarios no longer budgeted, and prints what changed. Writes
 * nothing if any round is missing or unfit.
 */
function writeBudget(results, machine, build) {
  const problems = results.flatMap(unfit)
  for (const run of budgetRuns()) {
    const [scenario] = run.scenarios
    if (
      !results.some(
        (each) => each.round === run.round && each.quality === run.quality && each.scenario === scenario.name
      )
    ) {
      problems.push(`${run.quality}, ${scenario.name}: round ${run.round} measured nothing`)
    }
  }
  if (problems.length > 0) {
    throw new Error(`nothing written to ${BUDGET_PATH}:\n${problems.join("\n")}`)
  }
  if (git("rev-parse", "HEAD") !== build.commit) {
    throw new Error(`HEAD moved from ${build.commit.slice(0, 7)} while measuring: nothing written; run it again`)
  }
  const was = budgetAt("HEAD")?.profiles ?? {}
  const profiles = {}
  for (const [quality, budgeted] of Object.entries(BUDGET_SCENARIOS)) {
    profiles[quality] = {}
    for (const [name, headroom] of Object.entries(budgeted)) {
      const rounds = results.filter((each) => each.quality === quality && each.scenario === name)
      const before = was[quality]?.[name]
      if (rounds.length === 0) {
        if (before) {
          profiles[quality][name] = before
        }
        continue
      }
      const entry = {
        commit: build.commit,
        pack: build.pack,
        chrome: machine.chrome,
        babylon: machine.babylon,
        adapter: rounds[0].gpu.adapter,
        features: rounds[0].gpu.features,
        rounds: rounds.length,
        counts: limitsOf(rounds, headroom),
        drawsByTarget: drawsByTarget(rounds)
      }
      profiles[quality][name] = entry
      const changes = Object.entries(entry.counts)
        .filter(([count, { limit }]) => before?.counts?.[count]?.limit !== limit)
        .map(([count, { limit }]) => `${count} ${before?.counts?.[count]?.limit ?? "none"} to ${limit}`)
      print(`budget ${quality}, ${name}: ${before ? changes.join(", ") || "limits unchanged" : "recorded"}`)
    }
  }
  const budget = {
    about:
      "Written by pnpm perf --write-budget (scripts/perf.mjs), not by hand: what pnpm perf --budget holds each scenario to, by graphics setting. Each count's limit is the most it reached over the rounds recorded plus the headroom COUNTS and BUDGET_SCENARIOS give; change those to give more.",
    renderer: machine.renderer,
    size: machine.size.join("x"),
    seconds: SECONDS,
    profiles
  }
  writeFileSync(BUDGET_FILE, `${JSON.stringify(budget, null, 2)}\n`)
  print(`wrote ${BUDGET_PATH}: commit it`)
}

/**
 * Builds the client as committed at a ref, in a worktree of its own: several sessions edit the shared working tree at
 * once, and a build of it can catch someone's change half made. The encrypted asset pack isn't committed, so it's
 * copied in from this checkout's cache. Leaves a stamp of the commit and the pack beside the build, for budgets.
 */
async function buildCommit(ref, outDir, slot) {
  // Slot 0 keeps the tree earlier runs installed in, so its dependencies are already there.
  const tree = join(tmpdir(), slot === 0 ? "verdun-perf-tree" : `verdun-perf-tree-${slot}`)
  // Resolved here: in the build tree, HEAD would name the commit that tree last checked out.
  const commit = execFileSync("git", ["rev-parse", ref], { encoding: "utf8" }).trim()
  if (existsSync(join(tree, ".git"))) {
    await run("git", ["-C", tree, "checkout", "--force", "--detach", commit], process.cwd())
  } else {
    // A removal stopped by a file still open leaves the tree without its .git, and git won't add a worktree over it:
    // every run in the slot failed until someone cleared it. Its node_modules links point within it, and rmSync
    // unlinks a link rather than follow it.
    rmSync(tree, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 })
    await run("git", ["worktree", "add", "--force", "--detach", tree, commit], process.cwd())
  }
  print(`building ${commit.slice(0, 7)}`)
  const pack = join(process.cwd(), ".asset-cache", "pack")
  if (existsSync(pack)) {
    cpSync(pack, join(tree, ".asset-cache", "pack"), { recursive: true })
  }
  await run("pnpm", ["install", "--frozen-lockfile", "--prefer-offline"], tree)
  // Source maps beside the chunks, unlinked from them, so --profile can name the functions it finds.
  await run(
    "pnpm",
    [
      "--filter",
      "@verdun/client",
      "exec",
      "vite",
      "build",
      "--outDir",
      outDir,
      "--emptyOutDir",
      "--sourcemap",
      "hidden"
    ],
    tree
  )
  // The pack is encrypted afresh on each build of it, so its hash tells packs apart but can't be set against a commit.
  const packFile = join(tree, ".asset-cache", "pack", "level.pack")
  const packHash = existsSync(packFile)
    ? createHash("sha256").update(readFileSync(packFile)).digest("hex").slice(0, 12)
    : null
  writeFileSync(join(outDir, STAMP), JSON.stringify({ commit, pack: packHash }))
}

/** The source maps of a build's chunks, read as first asked for: null for a chunk without one, or with no build. */
function sourceMaps(outDir) {
  const maps = new Map()
  return (url) => {
    const file = url.split("/").pop() ?? ""
    if (!outDir || !file.endsWith(".js")) {
      return null
    }
    if (!maps.has(file)) {
      const path = join(outDir, "assets", `${file}.map`)
      maps.set(file, existsSync(path) ? new SourceMap(JSON.parse(readFileSync(path, "utf8"))) : null)
    }
    return maps.get(file)
  }
}

/**
 * A function in a CPU profile as its name and place: in the source it was built from where the build's source map
 * says (the game's file under src, or the package's), else in the built chunk.
 */
function placeOf({ functionName, url, lineNumber, columnNumber }, maps) {
  const found = maps(url)?.findOrigin(lineNumber + 1, columnNumber + 1)
  if (found?.fileName) {
    const file = found.fileName
      .replaceAll("\\", "/")
      .replace(/^.*\/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?/, "")
      .replace(/^(?:\.\.\/)+/, "")
    return `${found.name || functionName || "(anonymous)"} ${file}:${found.lineNumber}`
  }
  return `${functionName || "(anonymous)"} ${url.split("/").pop()}:${lineNumber + 1}`
}

/** A CPU profile's costliest functions by their own time, as lines of milliseconds, name and place. */
function costliest(profile, count, maps) {
  const nodes = new Map(profile.nodes.map((node) => [node.id, node]))
  const own = new Map()
  profile.samples.forEach((id, index) => {
    const key = placeOf(nodes.get(id).callFrame, maps)
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
  const budgeting = BUDGET || WRITE_BUDGET
  if (BUDGET && WRITE_BUDGET) {
    throw new Error("--budget checks against the budget and --write-budget replaces it: pick one")
  }
  if (budgeting) {
    const refused = ["--url", "--ab", "--operation", "--query", "--eval", "--width", "--height", "--seconds"].filter(
      flag
    )
    if (refused.length > 0) {
      throw new Error(
        `budgets hold for the free battle as built, at 1920×1080, 6 s a sample: leave out ${refused.join(", ")}`
      )
    }
  }
  if (WRITE_BUDGET) {
    if (git("rev-parse", option("--ref", "HEAD")) !== git("rev-parse", "HEAD")) {
      throw new Error("--write-budget records the budget for HEAD, as it commits on top of it: leave out --ref")
    }
    if (git("status", "--porcelain", "--", BUDGET_PATH)) {
      throw new Error(`${BUDGET_PATH} has changes not committed, perhaps another session's: leave them to their owner`)
    }
    if (!(ROUNDS >= 2)) {
      throw new Error("--write-budget needs two rounds at least, to see how far its counts move from run to run")
    }
  }
  // Each run is a tab of its own, a page load: the graphics setting is read once, as the battle is built
  // (settings/graphics.ts), and a budget's scenario holds only what it made.
  const runs = budgeting
    ? budgetRuns()
    : [
        {
          round: 1,
          quality: null,
          // --only picks among the usual scenarios, optional ones too; --ab brings its own.
          scenarios: AB
            ? abScenarios()
            : SCENARIOS.filter((scenario) => (ONLY.length > 0 ? ONLY.includes(scenario.name) : !scenario.optional))
        }
      ]
  if (runs.length === 0) {
    const budgeted = [...new Set(Object.values(BUDGET_SCENARIOS).flatMap((scenarios) => Object.keys(scenarios)))]
    throw new Error(`--only names none of the budgeted scenarios, which are: ${budgeted.join("; ")}`)
  }
  let preview = null
  let url = option("--url", "")
  // A game served from elsewhere (--url) is profiled as it's served.
  let maps = sourceMaps(null)
  // What was built, from its stamp: budgets go by it.
  let build = null
  let budget = null
  const { slot, free } = takeSlot()
  process.on("exit", free)
  sweepOldProfiles()
  if (!url) {
    // Its own build folder: other sessions build into apps/client/dist, and would swap files out under a running game.
    const outDir = join(tmpdir(), `verdun-perf-dist-${slot}`)
    maps = sourceMaps(outDir)
    if (!flag("--no-build")) {
      await buildCommit(option("--ref", "HEAD"), outDir, slot)
    }
    build = stampOf(outDir)
    if (budgeting && !build) {
      throw new Error(`--no-build would serve a build with no ${STAMP} saying what it was built from: build it again`)
    }
    if (WRITE_BUDGET && build.commit !== git("rev-parse", "HEAD")) {
      throw new Error(`the build in this slot is of ${build.commit.slice(0, 7)}, not HEAD: build it again`)
    }
    // --budget holds the build to the budget committed with it, not to what's in this checkout now.
    budget = BUDGET ? budgetAt(build.commit) : null
    if (BUDGET && !budget) {
      throw new Error(`${build.commit.slice(0, 7)} has no ${BUDGET_PATH} yet: record one with --write-budget`)
    }
    if (build) {
      print(`measuring ${build.commit.slice(0, 7)}, asset pack ${build.pack ?? "none"}`)
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
  let browser = "unknown"
  try {
    chrome = await launchChrome()
    cdp = await connect(chrome.endpoint)
    browser = (await cdp.send("Browser.getVersion")).product
  } catch (error) {
    // Never leave the preview server or Chrome behind.
    chrome?.stop()
    stopTree(preview)
    throw error
  }

  /**
   * Opens the game in a tab of its own, at a graphics setting or as --query has it, with the GPU tap set before any of
   * its scripts, and waits until the level is dressed and the camera has dropped in.
   */
  async function openGame(quality) {
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
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: GPU_TAP }, sessionId)
    await cdp.send(
      "Emulation.setDeviceMetricsOverride",
      { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false },
      sessionId
    )
    // --query: more of the game's own options for the address, such as inline or snapshot. A budget's tab names its
    // graphics setting, High too: the tabs share the setting the game keeps in the browser.
    const query = [flag("--operation") ? "" : "free", quality ? `quality=${quality}` : "", option("--query", "")]
      .filter(Boolean)
      .join("&")
    cdp.errors.length = 0
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
        if (budgeting) {
          throw new Error(
            "the level kit didn't load, and budgets are for the dressed battlefield (is .asset-cache/pack up to date?)"
          )
        }
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
      let quality = "high"
      try {
        // The graphics setting as the game read it: the address's, which it keeps, else what it kept (settings/graphics.ts).
        quality = localStorage.getItem("verdun.graphics") ?? "high"
      } catch {}
      return {
        renderer: verdun.engine.isWebGPU ? "WebGPU" : "WebGL2",
        babylon: verdun.engine.constructor.Version,
        quality,
        adapter: window.__gpuTap?.adapter ?? null,
        timestamps: device ? [...device.features].includes("timestamp-query") : false,
        size: [verdun.engine.getRenderWidth(), verdun.engine.getRenderHeight()],
        hidden: document.hidden
      }
    })()`)
    print(
      `${machine.renderer} at ${machine.size.join("×")}, ${machine.quality} graphics, GPU timestamps ${machine.timestamps ? "on" : "unavailable"}, ${machine.adapter ? `GPU ${machine.adapter}` : "NO GPU TAP: no passes, draws by target or GPU memory"}${machine.hidden ? ", PAGE HIDDEN: throttled" : ""}`
    )
    // Let the camera drop in and the first recordings settle.
    await sleep(8000)
    return { targetId, sessionId, evaluate, machine: { ...machine, chrome: browser } }
  }

  try {
    await cdp.send("Target.setDiscoverTargets", { discover: true })
    const results = []
    let machine = null
    // What was measured is written even when a scenario fails part way.
    try {
      for (const run of runs) {
        const page = await openGame(run.quality)
        const { sessionId, evaluate } = page
        machine = page.machine
        try {
          // --eval: page-side code to report on before measuring, such as counts of what's drawn.
          const report = option("--eval", "")
          if (report) {
            print(JSON.stringify(await evaluate(report), null, 1))
          }
          for (const scenario of run.scenarios) {
            await evaluate(scenario.setup)
            // --profile: a CPU profile of each scenario's sample, for Chrome's DevTools, and its costliest functions.
            const profiles = option("--profile", "")
            if (profiles) {
              await cdp.send("Profiler.enable", {}, sessionId)
              await cdp.send("Profiler.start", {}, sessionId)
            }
            const result = await evaluate(`__perf.sample(${SECONDS}, ${!scenario.settled})`)
            // Files of a budget's runs are told apart by graphics setting and round.
            const file = [run.quality, WRITE_BUDGET ? `round-${run.round}` : "", scenario.name.replace(/[^\w]+/g, "-")]
              .filter(Boolean)
              .join("-")
            if (profiles) {
              const { profile } = await cdp.send("Profiler.stop", {}, sessionId)
              writeFileSync(join(profiles, `${file}.cpuprofile`), JSON.stringify(profile))
              print(costliest(profile, 15, maps))
            }
            const shots = option("--shots", "")
            if (shots) {
              // What each scenario looked like, to check a faster setting still draws the same picture.
              const { data } = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 80 }, sessionId)
              writeFileSync(join(shots, `${file}.jpg`), Buffer.from(data, "base64"))
            }
            // A budget's tab closes after its one scenario: there's nothing to put back.
            if (scenario.teardown && !budgeting) {
              await evaluate(scenario.teardown)
            }
            results.push({
              scenario: scenario.name,
              quality: machine.quality,
              round: run.round,
              hidden: machine.hidden,
              ...result
            })
            const hot = result.hot
              .slice(0, 4)
              .map(([name, ms]) => `${ms} ${name.replace("babylon: ", "")}`)
              .join(" | ")
            print(
              `${scenario.name.padEnd(28)} ${result.fps.toFixed(1).padStart(5)} fps  ${result.frameMs.toFixed(1).padStart(5)} ms (worst ${result.worstMs.toFixed(0)})  GPU ${result.gpuMs ? `${result.gpuMs.toFixed(1)} ms, 20th pct ${result.gpuP20.toFixed(1)}` : "n/a"}  ${result.snapshot}\n${" ".repeat(30)}${hot}` +
                (result.passes.length > 0
                  ? `\n${" ".repeat(30)}GPU: ${result.passes.map(([name, ms]) => `${ms} ${name}`).join(" | ")}`
                  : "") +
                countsLines(result)
                  .map((line) => `\n${" ".repeat(30)}${line}`)
                  .join("")
            )
          }
        } finally {
          // One game at a time on the GPU.
          await cdp.send("Target.closeTarget", { targetId: page.targetId })
        }
      }
    } finally {
      const out = option("--out", "")
      if (out) {
        writeFileSync(out, JSON.stringify({ machine, build, width: WIDTH, height: HEIGHT, results }, null, 2))
      }
    }
    if (AB) {
      print(abSummary(results))
    }
    if (WRITE_BUDGET) {
      writeBudget(results, machine, build)
    }
    // Over budget fails the run, once Chrome and the server are shut down.
    if (BUDGET && !checkBudget(budget, results, machine, build)) {
      process.exitCode = 1
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
