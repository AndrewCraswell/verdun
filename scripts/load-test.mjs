// The stage 2 load test (docs/roadmap.md): starts a sector server with a big battle of its own, joins it with bot players
// who each lead a squad and fight for the objective, and reports how the server keeps up and what each player is sent.
// What it finds sets the sync rate, the quantization and the sector's size, and whether players need relevance filtering.
//
// Usage: node scripts/load-test.mjs [--players 100] [--soldiers 500] [--minutes 3] [--latency 0] [--decoders 3]
//                                   [--port 2577]
// --soldiers mans each side's front line (500 a side makes about 1,100 men and 126 squads to lead); --latency adds a
// round trip of that many milliseconds to every player (Colyseus's COLYSEUS_LATENCY); --decoders is how many bots read
// every message into a mirror of the battle as a player's page does, to time it: the rest only count the bytes.

import { spawn } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { loadSectorMap } from "../apps/server/src/battle.ts"
import { decodeJoined, MESSAGE, SECTOR_ROOM } from "../packages/net/src/index.ts"
import { applySync, createSimulation, Side, STEP_SECONDS } from "../packages/sim/src/index.ts"

/** Writes a line of the report. */
const print = (line) => process.stdout.write(`${line}\n`)

const argument = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`)
  return at >= 0 && process.argv[at + 1] !== undefined ? Number(process.argv[at + 1]) : fallback
}
const PLAYERS = argument("players", 100)
const SOLDIERS = argument("soldiers", 500)
const MINUTES = argument("minutes", 3)
const LATENCY = argument("latency", 0)
const DECODERS = argument("decoders", 3)
const PORT = argument("port", 2577)
/** Bots join this far apart, as players drift in. */
const JOIN_GAP_MS = 100
/** The bots' own clock: they think ten times a second. */
const THINK_MS = 100

const root = fileURLToPath(new URL("..", import.meta.url))
const fromClient = createRequire(join(root, "apps/client/package.json"))
const { Client } = await import(pathToFileURL(fromClient.resolve("@colyseus/sdk")).href)
const fromNet = createRequire(join(root, "packages/net/package.json"))
const { Packr } = fromNet("msgpackr")
const { deflateSync, inflateSync } = fromNet("fflate")
const packr = new Packr({ moreTypes: true, useRecords: false })

/** What each part of the messages comes to, compressed as it's sent, as the first bot reads them: by part, bytes. */
const parts = new Map()
const count = (part, value) => {
  parts.set(part, (parts.get(part) ?? 0) + deflateSync(packr.pack(value), { level: 1 }).byteLength)
}

/** Sorts a message's parts into the soldiers' arrays, the clouds, the rest of the state, events and craters. */
function breakDown(bytes) {
  const message = packr.unpack(inflateSync(bytes))
  count("events (each step's shots, bursts, voices)", message.s)
  count("craters", message.g)
  for (const [key, value] of Object.entries(message.v?.o ?? {})) {
    if (key === "arrays" || key === "state") {
      for (const [inner, patch] of Object.entries(value.o ?? { all: value })) {
        count(`${key === "arrays" ? "soldiers" : "state"}: ${inner}`, patch)
      }
    } else {
      count(key, value)
    }
  }
}

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0
}
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)

/** Starts the server on a database of its own, and resolves once it's taking players. */
function startServer(folder) {
  const server = spawn(process.execPath, ["apps/server/src/main.ts", `--soldiers=${SOLDIERS}`, "--stats"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(PORT),
      VERDUN_DB: join(folder, "load-test.db"),
      ...(LATENCY > 0 ? { COLYSEUS_LATENCY: String(LATENCY) } : {})
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  const stats = []
  const lines = []
  const running = new Promise((resolve, reject) => {
    let buffer = ""
    server.stdout.on("data", (chunk) => {
      buffer += chunk.toString()
      const parts = buffer.split("\n")
      buffer = parts.pop() ?? ""
      for (const line of parts) {
        lines.push(line)
        if (line.startsWith("stats:")) {
          stats.push({ at: performance.now(), line })
          print(`  server ${line}`)
        }
        if (line.startsWith("Running ")) {
          resolve()
        }
      }
    })
    server.stderr.on("data", (chunk) => process.stderr.write(chunk))
    server.on("exit", (code) => reject(new Error(`The server stopped (${code}): ${lines.slice(-5).join(" / ")}`)))
  })
  return { server, stats, running }
}

/** A bot player: joins for a side, leads the squad it's given, and counts what it's sent. */
async function bot(index, map, objective) {
  const side = index % 2 === 0 ? Side.French : Side.German
  const decodes = index < DECODERS
  const joining = performance.now()
  const room = await new Client(`ws://localhost:${PORT}`).join(SECTOR_ROOM, { side })
  const record = { bytes: 0, messages: 0, decodeMs: [], welcomeKB: 0, joinMs: 0, acknowledged: 0 }
  let leader = -1
  let squad = -1
  let decoder = null
  const mirror = decodes ? createSimulation({ map, seed: 1916 }) : null
  const joined = new Promise((resolve) => {
    room.onMessage(MESSAGE.joined, (bytes) => {
      const welcome = decodeJoined(bytes, map)
      record.welcomeKB = bytes.byteLength / 1024
      record.joinMs = performance.now() - joining
      squad = welcome.playerSquad
      const squads = welcome.sync.state["squads"]
      leader = Array.isArray(squads) ? (squads[squad]?.leader ?? -1) : -1
      if (mirror) {
        applySync(mirror, welcome.sync)
        decoder = welcome.decoder
      }
      resolve()
    })
  })
  room.onMessage(MESSAGE.sync, (bytes) => {
    record.bytes += bytes.byteLength
    record.messages++
    if (index === 0) {
      breakDown(bytes)
    }
    if (mirror && decoder) {
      const started = performance.now()
      applySync(mirror, decoder.decode(bytes))
      record.decodeMs.push(performance.now() - started)
      leader = mirror.squads[squad]?.leader ?? leader
    }
  })
  room.onMessage(MESSAGE.ack, () => {
    record.acknowledged++
  })
  room.send(MESSAGE.ready)
  await joined

  // The bot's play: walk and run about, aim and fire, and now and then send the squad at the objective.
  let step = 0
  let steering = { x: 0, z: 0, run: false }
  const random = (seed) => {
    let state = seed * 7919 + 1
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648
      return state / 2147483648
    }
  }
  const roll = random(index + 1)
  const think = setInterval(() => {
    step += THINK_MS / (STEP_SECONDS * 1000)
    const commands = []
    if (step % 20 === 0) {
      const angle = roll() * Math.PI * 2
      steering = { x: Math.cos(angle), z: Math.sin(angle), run: roll() < 0.3 }
      commands.push({ type: "steer", soldier: leader, ...steering })
    }
    if (step % 10 === 0) {
      const angle = roll() * Math.PI * 2
      commands.push({ type: "face", soldier: leader, x: Math.cos(angle), z: Math.sin(angle) })
    }
    if (step % 30 === 0) {
      commands.push({ type: "fire", soldier: leader })
    }
    if ((step / 2) % 200 === (index * 7) % 200) {
      commands.push({
        type: "squad-order",
        squad,
        order:
          roll() < 0.7
            ? { kind: "advance", x: objective.x + (roll() - 0.5) * 40, z: objective.z + (roll() - 0.5) * 40 }
            : { kind: "follow" }
      })
    }
    if (commands.length > 0) {
      room.send(MESSAGE.commands, { step, commands })
    }
  }, THINK_MS)
  return { record, stop: () => clearInterval(think), leave: () => room.leave() }
}

const folder = mkdtempSync(join(tmpdir(), "verdun-load-test-"))
const { server, stats, running } = startServer(folder)
try {
  print(`Load test: ${PLAYERS} players, ${SOLDIERS} men a side, ${MINUTES} min, ${LATENCY} ms round trip`)
  await running
  const map = await loadSectorMap()
  const objective = map.objectives[0] ?? { x: map.columns * map.cellSize * 0.5, z: map.rows * map.cellSize * 0.5 }
  const bots = []
  for (let index = 0; index < PLAYERS; index++) {
    bots.push(await bot(index, map, objective))
    await new Promise((resolve) => setTimeout(resolve, JOIN_GAP_MS))
  }
  print(`All ${bots.length} players in the battle; playing ${MINUTES} min`)
  // Counted from here: the joining is over.
  const counting = performance.now()
  for (const { record } of bots) {
    record.bytes = 0
    record.messages = 0
    record.decodeMs = []
  }
  parts.clear()
  await new Promise((resolve) => setTimeout(resolve, MINUTES * 60_000))
  const seconds = (performance.now() - counting) / 1000
  for (const each of bots) {
    each.stop()
  }

  const records = bots.map(({ record }) => record)
  const rates = records.map((record) => record.bytes / seconds / 1024)
  const decodeMs = records.flatMap((record) => record.decodeMs)
  const steady = stats.filter((entry) => entry.at >= counting).map((entry) => entry.line)
  const numbers = (pattern) =>
    steady.map((line) => Number(pattern.exec(line)?.[1])).filter((value) => Number.isFinite(value))
  print("")
  print("Results")
  print(
    `  steps a second: ${mean(numbers(/([\d.]+) steps\/s/)).toFixed(1)} mean, ${Math.min(...numbers(/([\d.]+) steps\/s/)).toFixed(1)} lowest (20 is the clock)`
  )
  print(
    `  step: ${mean(numbers(/step ([\d.]+) ms mean/)).toFixed(1)} ms mean, ${Math.max(...numbers(/([\d.]+) p95/)).toFixed(1)} ms worst p95, ${Math.max(...numbers(/([\d.]+) max/)).toFixed(0)} ms longest (budget 50)`
  )
  print(`  encoding a message: ${mean(numbers(/encode ([\d.]+) ms/)).toFixed(1)} ms mean, once for every player`)
  print(`  server heap: ${Math.max(...numbers(/heap ([\d.]+) MB/)).toFixed(0)} MB at most`)
  print(
    `  each player is sent: ${mean(rates).toFixed(1)} KB/s mean, ${percentile(rates, 1).toFixed(1)} KB/s most, ${(mean(records.map((record) => record.messages)) / seconds).toFixed(1)} messages a second`
  )
  print(`  the server sends: ${((mean(rates) * records.length) / 1024).toFixed(2)} MB/s in all`)
  print(
    `  joining: welcome ${mean(records.map((record) => record.welcomeKB)).toFixed(0)} KB, ${percentile(
      records.map((record) => record.joinMs),
      0.95
    ).toFixed(0)} ms p95 to the battle`
  )
  if (decodeMs.length > 0) {
    print(
      `  a player's page reads a message in ${mean(decodeMs).toFixed(1)} ms mean, ${percentile(decodeMs, 0.95).toFixed(1)} ms p95`
    )
  }
  const total = [...parts.values()].reduce((sum, bytes) => sum + bytes, 0)
  const soldiers = [...parts]
    .filter(([part]) => part.startsWith("soldiers:"))
    .reduce((sum, [, bytes]) => sum + bytes, 0)
  print(`  what a message holds (parts compressed alone, so they add up to a little more than the messages):`)
  print(`    all the soldiers' arrays: ${((soldiers / total) * 100).toFixed(0)}%`)
  for (const [part, bytes] of [...parts].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    print(`    ${part}: ${((bytes / total) * 100).toFixed(0)}%, ${(bytes / seconds / 1024).toFixed(1)} KB/s`)
  }
  // Leaving waits for the server's word, which a stopped server never gives.
  await Promise.race([
    Promise.all(bots.map((each) => each.leave())),
    new Promise((resolve) => setTimeout(resolve, 3000))
  ])
} finally {
  // The database is the server's until it has gone.
  if (server.exitCode === null) {
    await new Promise((resolve) => {
      server.once("exit", resolve)
      server.kill()
    })
  }
  rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
process.exit(0)
