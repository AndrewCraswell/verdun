// Measures the game's frame rate and where the time goes, with nobody at the keyboard: builds the client, serves it,
// and runs it in headless Chrome on this machine's GPU, which unlike a background window or an embedded pane isn't
// throttled. Each scenario plays the battle for a few seconds and reports frames per second, frame time, the GPU's time
// where Chrome allows timestamp queries, and the hot spots from the game's own tracer (debug/trace.ts).
//
// Usage: node scripts/perf.mjs [--headed] [--ref HEAD] [--url http://localhost:5173] [--no-build] [--width 1920]
//                              [--height 1080] [--seconds 6] [--only "day;night"] [--out perf.json] [--shots dir]
//                              [--eval "page-side expression"] [--query "inline"] [--operation]
//                              [--chrome path/to/chrome.exe]
// --headed runs a real Chrome window off-screen: headless Chrome here aborts some module fetches. --shots saves what
// each scenario looked like, to check a faster setting still draws the picture. --eval prints a page-side expression
// once the game is up, such as counts of what's drawn. The battle is played free (?free), in the close view the
// scenarios were written for, so runs compare across builds; --operation plays the playtest's operation instead, which
// opens on its briefing in the overview.
// Without --url it builds the client as committed at --ref (HEAD by default, in a worktree of its own, so others'
// half-made changes stay out) and serves the build itself. Close other copies of the game first.

import { execFileSync, spawn, spawnSync } from "node:child_process"
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

const option = (name, fallback) =>
  process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback
const flag = (name) => process.argv.includes(name)

const WIDTH = Number(option("--width", 1920))
const HEIGHT = Number(option("--height", 1080))
const SECONDS = Number(option("--seconds", 6))
const PREVIEW_PORT = 4199
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
    const seconds_ = []
    for (let second = 0; second < seconds; second++) {
      await wait(1000)
      const f = verdun.trace.frames
      seconds_.push({ fps: f.perSecond, ms: f.averageMs, worst: f.worstMs, gpu: gpu ? gpu.lastSecAverage / 1e6 : 0 })
    }
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
      passes: passes.filter(([, ms]) => ms > 0.05).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, ms]) => [name, +ms.toFixed(2)]),
      snapshot: verdun.snapshots ? (verdun.snapshots.playing ? "replaying" : "live: " + verdun.snapshots.lastReason) : "off",
      hot: verdun.trace.hotSpots(20).map((s) => [s.name, +s.selfMsPerFrame.toFixed(2)])
    }
  },
  moveCamera(on) {
    clearInterval(window.__perfMove)
    if (on) {
      const camera = verdun.engine.scenes[0].activeCamera
      const base = camera.radius
      let t = 0
      window.__perfMove = setInterval(() => { t += 0.05; camera.radius = base + 25 * Math.sin(t) }, 16)
    }
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
  {
    name: "day, no sun shadows",
    setup:
      "{ const sun = verdun.engine.scenes[0].lights.find((l) => l.name === 'sun'); if (sun) sun.shadowEnabled = false }",
    teardown:
      "{ const sun = verdun.engine.scenes[0].lights.find((l) => l.name === 'sun'); if (sun) sun.shadowEnabled = true }"
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
  // Last: switching snapshot rendering off is for good.
  { name: "day, no snapshot rendering", setup: "verdun.snapshots?.dispose()" }
]

/**
 * Builds the client as committed at a ref, in a worktree of its own: several sessions edit the shared working tree at
 * once, and a build of it can catch someone's change half made. The encrypted asset pack isn't committed, so it's
 * copied in from this checkout's cache.
 */
async function buildCommit(ref, outDir) {
  const tree = join(tmpdir(), "verdun-perf-tree")
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

async function main() {
  let preview = null
  let url = option("--url", "")
  if (!url) {
    // Its own build folder: other sessions build into apps/client/dist, and would swap files out under a running game.
    const outDir = join(tmpdir(), "verdun-perf-dist")
    if (!flag("--no-build")) {
      await buildCommit(option("--ref", "HEAD"), outDir)
    }
    url = `http://localhost:${PREVIEW_PORT}`
    // Something already answering there would be served instead of this build: an earlier run's server, say.
    const taken = await fetch(url).then(
      () => true,
      () => false
    )
    if (taken) {
      throw new Error(`port ${PREVIEW_PORT} is already in use: stop whatever is serving there first`)
    }
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
        String(PREVIEW_PORT),
        "--strictPort"
      ],
      { stdio: "ignore", shell: process.platform === "win32" }
    )
    url = `http://localhost:${PREVIEW_PORT}`
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
      const { result, exceptionDetails } = await cdp.send(
        "Runtime.evaluate",
        { expression, awaitPromise: true, returnByValue: true },
        sessionId
      )
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
    for (const scenario of SCENARIOS) {
      if (ONLY.length > 0 && !ONLY.includes(scenario.name)) {
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
        `${scenario.name.padEnd(28)} ${result.fps.toFixed(1).padStart(5)} fps  ${result.frameMs.toFixed(1).padStart(5)} ms (worst ${result.worstMs.toFixed(0)})  GPU ${result.gpuMs ? result.gpuMs.toFixed(1) + " ms" : "n/a"}  ${result.snapshot}\n${" ".repeat(30)}${hot}` +
          (result.passes.length > 0
            ? `\n${" ".repeat(30)}GPU: ${result.passes.map(([name, ms]) => `${ms} ${name}`).join(" | ")}`
            : "")
      )
    }
    const out = option("--out", "")
    if (out) {
      writeFileSync(out, JSON.stringify({ machine, width: WIDTH, height: HEIGHT, results }, null, 2))
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
