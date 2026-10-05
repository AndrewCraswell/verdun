import { gzipSync } from "node:zlib"
import { SIM_STATE_VERSION, STEP_SECONDS, stepSimulation, takeSnapshot } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { loadSectorMap } from "./battle.ts"
import { openSector } from "./sector.ts"
import { openSqliteStore } from "./store.ts"

/** An evening in the war's turn, long after the morning's stand-to. */
const NOW = Date.UTC(2027, 5, 10, 18)
const STEP_MS = STEP_SECONDS * 1000

async function open(store = openSqliteStore(":memory:"), now = NOW) {
  const lines: string[] = []
  const sector = await openSector({
    store,
    name: "fleury",
    map: await loadSectorMap(),
    now,
    log: (line) => lines.push(line)
  })
  return { store, sector, lines }
}

describe("a sector", () => {
  it("begins a new battle with every squad fighting by its own orders", async () => {
    const { store, sector, lines } = await open()
    sector.advance(NOW + STEP_MS)

    expect(lines).toEqual(["Began a new battle in fleury"])
    expect(sector.sim.squads.length).toBeGreaterThan(40)
    expect(sector.sim.squads.every((squad) => squad.controller === "ai")).toBe(true)
    expect(store.schedule("fleury")).toEqual(sector.war.schedule)
  })

  it("keeps step with the real clock, and waits through the stand-to", async () => {
    const { sector } = await open()
    let stepped = 0
    sector.onStep(() => stepped++)

    expect(sector.advance(NOW + 1000)).toBe(20)
    expect(stepped).toBe(20)
    expect(sector.advance(NOW + 1000 + 2.5 * STEP_MS)).toBe(2)
    // A long stall catches up a second, and lets the rest go.
    expect(sector.advance(NOW + 60_000)).toBe(20)
    expect(sector.advance(NOW + 60_000 + STEP_MS)).toBe(1)

    // The next morning's cutoff: the war moves on a week, and the battle stands to.
    const cutoff = Date.UTC(2027, 5, 11, 5)
    const tick = sector.sim.tick
    sector.advance(cutoff + 60_000)
    expect(sector.war.paused).toBe(true)
    expect(sector.advance(cutoff + 61_000)).toBe(0)
    expect(sector.sim.tick).toBe(tick)
    expect(sector.advance(cutoff + 11 * 60_000)).toBeGreaterThan(0)
  })

  it("takes up its saved battle where it left off, craters and all, and fights on as if never stopped", async () => {
    const { store, sector } = await open()
    for (let second = 1; second <= 30; second++) {
      sector.advance(NOW + second * 1000)
    }
    // A shell's crater, so there's ground to put back.
    const crater = sector.sim.map.heights.length >> 1
    sector.sim.map.heights[crater] = (sector.sim.map.heights[crater] ?? 0) - 1.5
    expect(sector.reshapedGround()?.moved.length).toBeGreaterThan(0)
    store.save("fleury", sector.save(NOW + 30_000))

    const later = NOW + 90_000
    const resumed = await open(store, later)
    expect(resumed.lines).toEqual([`Took up fleury at step ${sector.sim.tick}, saved 60 s ago`])
    expect(resumed.sector.war.schedule).toEqual(sector.war.schedule)
    expect(resumed.sector.sim.map.heights[crater]).toBeCloseTo(sector.sim.map.heights[crater] ?? 0, 5)
    expect(takeSnapshot(resumed.sector.sim)).toEqual(takeSnapshot(sector.sim))

    for (let step = 0; step < 200; step++) {
      stepSimulation(sector.sim)
      stepSimulation(resumed.sector.sim)
    }
    expect(takeSnapshot(resumed.sector.sim)).toEqual(takeSnapshot(sector.sim))
  })

  it("begins a new battle on the same calendar when its save is in a format this build can't read", async () => {
    const { store, sector } = await open()
    sector.advance(NOW + 1000)
    store.save("fleury", { ...sector.save(NOW + 1000), version: SIM_STATE_VERSION - 1 })

    const reopened = await open(store, NOW + 2000)
    expect(reopened.lines).toEqual([
      `The last save is in format ${SIM_STATE_VERSION - 1}, and this build reads ${SIM_STATE_VERSION}: a new battle begins`,
      "Began a new battle in fleury"
    ])
    expect(reopened.sector.sim.tick).toBe(0)
    expect(reopened.sector.war.schedule).toEqual(sector.war.schedule)
  })

  it("goes on over unshelled ground when the saved ground doesn't fit the map", async () => {
    const { store, sector } = await open()
    sector.advance(NOW + 1000)
    store.save("fleury", { ...sector.save(NOW + 1000), heights: gzipSync(new Uint8Array(8)) })

    const reopened = await open(store, NOW + 2000)
    expect(reopened.lines[0]).toBe(
      "The saved ground is of a map of another size: the battle goes on over unshelled ground"
    )
    expect(reopened.sector.sim.tick).toBe(sector.sim.tick)
  })
})
