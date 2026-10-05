import { DatabaseSync, type SQLOutputValue } from "node:sqlite"
import type { WarSchedule } from "@verdun/sim"

/** One save of a sector's battle, as kept: the simulation's snapshot and the reshaped ground, each compressed. */
export interface SavedBattle {
  /** The real moment of the save, in milliseconds since 1970 UTC. */
  readonly savedAt: number
  /** The snapshot's format: `SIM_STATE_VERSION` when it was saved. */
  readonly version: number
  readonly tick: number
  readonly snapshot: Uint8Array
  readonly heights: Uint8Array
  readonly surfaces: Uint8Array
}

/**
 * Where sectors keep their battles between runs of the server. SQLite for now; Postgres goes behind the same calls when
 * the war map needs one database for every sector.
 */
export interface SectorStore {
  /** The war's schedule the sector keeps, chosen when it first opened; null for a sector never opened. */
  schedule(sector: string): WarSchedule | null
  /** Records a sector opening for the first time, and the war's schedule it keeps from then on. */
  addSector(sector: string, schedule: WarSchedule, now: number): void
  /** The sector's latest save, or null when it has none. */
  latest(sector: string): SavedBattle | null
  /** Keeps a save, forgetting all but the sector's last `KEPT_SAVES`. */
  save(sector: string, battle: SavedBattle): void
  close(): void
}

/** Saves kept for each sector: the latest, and some to go back to if a build spoils a battle. */
export const KEPT_SAVES = 20

/** The schema, one step per version of the database (`user_version`); a database is brought up to date when opened. */
const MIGRATIONS: readonly string[] = [
  `CREATE TABLE sectors (
    name TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    schedule TEXT NOT NULL
  );
  CREATE TABLE saves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sector TEXT NOT NULL REFERENCES sectors (name),
    saved_at INTEGER NOT NULL,
    version INTEGER NOT NULL,
    tick INTEGER NOT NULL,
    snapshot BLOB NOT NULL,
    heights BLOB NOT NULL,
    surfaces BLOB NOT NULL
  );
  CREATE INDEX saves_by_sector ON saves (sector, id);`
]

type Row = Record<string, SQLOutputValue>

function numberIn(row: Row, column: string): number {
  const value = row[column]
  if (typeof value === "number") {
    return value
  }
  throw new TypeError(`Column ${column} holds ${typeof value}, not a number`)
}

function bytesIn(row: Row, column: string): Uint8Array {
  const value = row[column]
  if (value instanceof Uint8Array) {
    return value
  }
  throw new TypeError(`Column ${column} holds ${typeof value}, not bytes`)
}

function isSchedule(value: unknown): value is WarSchedule {
  return (
    typeof value === "object" &&
    value !== null &&
    "begins" in value &&
    "breakDays" in value &&
    "standToMinutes" in value &&
    Number.isFinite(value.begins) &&
    Number.isFinite(value.breakDays) &&
    Number.isFinite(value.standToMinutes)
  )
}

/** Does `work` whole or not at all. */
function inTransaction(db: DatabaseSync, work: () => void): void {
  db.exec("BEGIN")
  try {
    work()
    db.exec("COMMIT")
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

function migrate(db: DatabaseSync): void {
  const from = numberIn(db.prepare("PRAGMA user_version").get() ?? {}, "user_version")
  MIGRATIONS.slice(from).forEach((step, index) => {
    inTransaction(db, () => {
      db.exec(step)
      db.exec(`PRAGMA user_version = ${from + index + 1}`)
    })
  })
}

/** Opens, or creates, the SQLite database at `path` (":memory:" for one that lasts as long as the process). */
export function openSqliteStore(path: string): SectorStore {
  const db = new DatabaseSync(path)
  // Saves go on while nothing else waits on the file; write-ahead logging keeps a crash mid-save from spoiling it.
  db.exec("PRAGMA journal_mode = WAL")
  db.exec("PRAGMA foreign_keys = ON")
  migrate(db)

  const selectSchedule = db.prepare("SELECT schedule FROM sectors WHERE name = ?")
  const insertSector = db.prepare("INSERT INTO sectors (name, created_at, schedule) VALUES (?, ?, ?)")
  const selectLatest = db.prepare(
    "SELECT saved_at, version, tick, snapshot, heights, surfaces FROM saves WHERE sector = ? ORDER BY id DESC LIMIT 1"
  )
  const insertSave = db.prepare(
    "INSERT INTO saves (sector, saved_at, version, tick, snapshot, heights, surfaces) VALUES (?, ?, ?, ?, ?, ?, ?)"
  )
  const pruneSaves = db.prepare(
    "DELETE FROM saves WHERE sector = ? AND id NOT IN (SELECT id FROM saves WHERE sector = ? ORDER BY id DESC LIMIT ?)"
  )

  return {
    schedule(sector) {
      const row = selectSchedule.get(sector)
      if (!row) {
        return null
      }
      const schedule: unknown = JSON.parse(String(row["schedule"]))
      if (!isSchedule(schedule)) {
        throw new TypeError(`The war's schedule kept for ${sector} is unreadable`)
      }
      return schedule
    },
    addSector(sector, schedule, now) {
      insertSector.run(sector, now, JSON.stringify(schedule))
    },
    latest(sector) {
      const row = selectLatest.get(sector)
      if (!row) {
        return null
      }
      return {
        savedAt: numberIn(row, "saved_at"),
        version: numberIn(row, "version"),
        tick: numberIn(row, "tick"),
        snapshot: bytesIn(row, "snapshot"),
        heights: bytesIn(row, "heights"),
        surfaces: bytesIn(row, "surfaces")
      }
    },
    save(sector, battle) {
      inTransaction(db, () => {
        const { savedAt, version, tick, snapshot, heights, surfaces } = battle
        insertSave.run(sector, savedAt, version, tick, snapshot, heights, surfaces)
        pruneSaves.run(sector, sector, KEPT_SAVES)
      })
    },
    close() {
      db.close()
    }
  }
}
