import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { scheduleForWeek } from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
import { KEPT_SAVES, openSqliteStore, type SavedBattle } from "./store.ts"

const NOW = Date.UTC(2027, 5, 10, 18)
const schedule = scheduleForWeek(Date.UTC(1916, 5, 20), NOW)

const battle = (tick: number): SavedBattle => ({
  savedAt: NOW + tick,
  version: 23,
  tick,
  snapshot: Uint8Array.of(1, 2, tick % 256),
  heights: Uint8Array.of(3),
  surfaces: Uint8Array.of(4)
})

describe("the sector store", () => {
  const folders: string[] = []
  afterEach(() => {
    for (const folder of folders.splice(0)) {
      rmSync(folder, { recursive: true, force: true })
    }
  })

  it("knows nothing of a sector never opened", () => {
    const store = openSqliteStore(":memory:")

    expect(store.schedule("fleury")).toBeNull()
    expect(store.latest("fleury")).toBeNull()
  })

  it("keeps a sector's war schedule and hands back its latest save", () => {
    const store = openSqliteStore(":memory:")
    store.addSector("fleury", schedule, NOW)
    store.save("fleury", battle(100))
    store.save("fleury", battle(200))

    expect(store.schedule("fleury")).toEqual(schedule)
    expect(store.latest("fleury")).toEqual(battle(200))
    expect(store.latest("douaumont")).toBeNull()
  })

  it("forgets all but the last saves", () => {
    const store = openSqliteStore(":memory:")
    store.addSector("fleury", schedule, NOW)
    store.addSector("vaux", schedule, NOW)
    store.save("vaux", battle(1))
    for (let tick = 0; tick < KEPT_SAVES + 5; tick++) {
      store.save("fleury", battle(tick))
    }

    expect(store.latest("fleury")?.tick).toBe(KEPT_SAVES + 4)
    // Another sector's saves are its own.
    expect(store.latest("vaux")?.tick).toBe(1)
  })

  it("refuses saves for a sector never opened, keeping nothing of them", () => {
    const store = openSqliteStore(":memory:")

    expect(() => store.save("fleury", battle(1))).toThrow("FOREIGN KEY constraint failed")
    store.addSector("fleury", schedule, NOW)
    expect(store.latest("fleury")).toBeNull()
  })

  const databaseFile = () => {
    const folder = mkdtempSync(join(tmpdir(), "verdun-store-"))
    folders.push(folder)
    return join(folder, "verdun.db")
  }

  it("takes up a database file where the last run left it", () => {
    const path = databaseFile()
    const first = openSqliteStore(path)
    first.addSector("fleury", schedule, NOW)
    first.save("fleury", battle(300))
    first.close()

    const second = openSqliteStore(path)
    expect(second.schedule("fleury")).toEqual(schedule)
    expect(second.latest("fleury")).toEqual(battle(300))
    second.close()
  })

  it("says so, rather than starting the war afresh, when what it kept is unreadable", () => {
    const path = databaseFile()
    openSqliteStore(path).close()
    const db = new DatabaseSync(path)
    db.exec(`INSERT INTO sectors VALUES ('fleury', 0, '{}'), ('vaux', 0, '${JSON.stringify(schedule)}')`)
    db.exec(
      "INSERT INTO saves (sector, saved_at, version, tick, snapshot, heights, surfaces) VALUES ('vaux', 0, 23, 'soon', x'00', x'00', x'00')"
    )
    db.exec(
      "INSERT INTO saves (sector, saved_at, version, tick, snapshot, heights, surfaces) VALUES ('fleury', 0, 23, 1, 'text', x'00', x'00')"
    )
    db.close()

    const store = openSqliteStore(path)
    expect(() => store.schedule("fleury")).toThrow("The war's schedule kept for fleury is unreadable")
    expect(() => store.latest("vaux")).toThrow("Column tick holds string, not a number")
    expect(() => store.latest("fleury")).toThrow("Column snapshot holds string, not bytes")
    store.close()
  })
})
