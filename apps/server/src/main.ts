/**
 * The sector server: runs the Fleury sector's battle on the real clock, whoever is playing, and keeps it in SQLite so a
 * restart or a deploy takes it up where it left off. `pnpm server` runs it; VERDUN_DB names the database file (on
 * Railway, a path on the service's volume), data/verdun.db beside the server unless given.
 */
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { STEP_SECONDS, TICK_RATE } from "@verdun/sim"
import { loadSectorMap } from "./battle.ts"
import { openSector } from "./sector.ts"
import { openSqliteStore } from "./store.ts"

const SECTOR = "fleury"
/** How often the battle is saved: a crash loses at most this much of it. */
const SAVE_EVERY = 60_000
/** Half a step, so the battle never runs more than half a step behind the clock. */
const LOOP_MS = (STEP_SECONDS * 1000) / 2

/** The server's log: a line to standard output for each thing worth knowing, as Railway shows it. */
const log = (line: string) => process.stdout.write(`${line}\n`)

const path = process.env["VERDUN_DB"] ?? fileURLToPath(new URL("../data/verdun.db", import.meta.url))
mkdirSync(dirname(path), { recursive: true })
const store = openSqliteStore(path)
const sector = await openSector({
  store,
  name: SECTOR,
  map: await loadSectorMap(),
  now: Date.now(),
  log
})

let lastSave = Date.now()
function save(): void {
  lastSave = Date.now()
  store.save(sector.name, sector.save(lastSave))
}

const loop = setInterval(() => {
  const now = Date.now()
  sector.advance(now)
  if (now - lastSave >= SAVE_EVERY) {
    save()
    const minutes = Math.floor(sector.sim.tick / TICK_RATE / 60)
    log(`Saved ${SECTOR} at step ${sector.sim.tick}, ${minutes} min into the battle`)
  }
}, LOOP_MS)

/** Railway stops the service with SIGTERM before each deploy; Ctrl+C sends SIGINT. Either way the battle is kept. */
function stop(signal: string): void {
  clearInterval(loop)
  save()
  store.close()
  log(`Saved ${SECTOR} at step ${sector.sim.tick} and stopped on ${signal}`)
  process.exit(0)
}
process.once("SIGINT", stop)
process.once("SIGTERM", stop)
log(`Running ${SECTOR} at ${TICK_RATE} steps a second, saving every ${SAVE_EVERY / 1000} s to ${path}`)
