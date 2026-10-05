/**
 * The sector server: runs the Fleury sector's battle on the real clock whoever is playing, takes players into it over
 * WebSockets (Colyseus), and keeps it in SQLite so a restart or a deploy takes it up where it left off.
 *
 * `pnpm server` runs it locally with the dev keys allowed. PORT sets the port (2567 unless given; Railway sets it);
 * VERDUN_DB names the database file (on Railway, a path on the service's volume), data/verdun.db beside the server unless
 * given; --dev lets players' dev keys through (killing a man, moving the clock, the wind). For the load test
 * (scripts/load-test.mjs): --soldiers=N mans each side's front line with N men if a new battle begins, and --stats logs
 * how the room keeps up every 10 s. COLYSEUS_LATENCY adds a round trip of that many milliseconds to every player.
 */
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { matchMaker, Server } from "@colyseus/core"
import { WebSocketTransport } from "@colyseus/ws-transport"
import { SECTOR_ROOM } from "@verdun/net"
import { TICK_RATE } from "@verdun/sim"
import { loadSectorMap } from "./battle.ts"
import { sectorRoom } from "./room.ts"
import { openSector } from "./sector.ts"
import { openSqliteStore } from "./store.ts"

const SECTOR = "fleury"
/** How often the battle is saved: a crash loses at most this much of it. */
const SAVE_EVERY = 60_000

/** The server's log: a line to standard output for each thing worth knowing, as Railway shows it. */
const log = (line: string) => process.stdout.write(`${line}\n`)

const port = Number(process.env["PORT"] ?? 2567)
const dev = process.argv.includes("--dev")
const flag = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split("=")[1]
const soldiers = Number(flag("soldiers") ?? 200)
const statsEvery = process.argv.includes("--stats") ? 10_000 : undefined
const path = process.env["VERDUN_DB"] ?? fileURLToPath(new URL("../data/verdun.db", import.meta.url))
mkdirSync(dirname(path), { recursive: true })
const store = openSqliteStore(path)
const sector = await openSector({
  store,
  name: SECTOR,
  map: await loadSectorMap(),
  now: Date.now(),
  log,
  soldiersPerSide: soldiers
})

function save(): void {
  store.save(sector.name, sector.save(Date.now()))
}

// The battle's saves are ours to make on the way down, so Colyseus doesn't stop the process itself.
const server = new Server({ transport: new WebSocketTransport(), gracefullyShutdown: false })
server.define(SECTOR_ROOM, sectorRoom({ sector, dev, log, ...(statsEvery ? { statsEvery } : {}) }))
await server.listen(port)
// The sector's room runs from the start, players or none.
await matchMaker.createRoom(SECTOR_ROOM, {})

const saving = setInterval(() => {
  save()
  const minutes = Math.floor(sector.sim.tick / TICK_RATE / 60)
  log(`Saved ${SECTOR} at step ${sector.sim.tick}, ${minutes} min into the battle`)
}, SAVE_EVERY)

/** Railway stops the service with SIGTERM before each deploy; Ctrl+C sends SIGINT. Either way the battle is kept. */
function stop(signal: string): void {
  clearInterval(saving)
  save()
  store.close()
  log(`Saved ${SECTOR} at step ${sector.sim.tick} and stopped on ${signal}`)
  process.exit(0)
}
process.once("SIGINT", stop)
process.once("SIGTERM", stop)
log(
  `Running ${SECTOR} on port ${port}${dev ? " with the dev keys" : ""}, saving every ${SAVE_EVERY / 1000} s to ${path}`
)
