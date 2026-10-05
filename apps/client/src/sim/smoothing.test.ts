import { createFlatMap } from "@verdun/map"
import { createSimulation, Side, spawnSoldier } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createSmoothing } from "./smoothing.ts"

/** A mirror with three men at x = 10, 20 and 30, as the server last had them. */
function mirror() {
  const sim = createSimulation({ map: createFlatMap({ name: "field", cellSize: 1, columns: 100, rows: 100 }), seed: 1 })
  const men = [10, 20, 30].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 50 }))
  return { sim, men }
}

describe("easing soldiers between the server's word", () => {
  it("walks a man to where the server has him, at the pace that gets him there as the next word is due", () => {
    const { sim, men } = mirror()
    const [walker = -1] = men
    const smoothing = createSmoothing(sim)
    smoothing.synced(0, -1)
    // The server's word, 500 ms on: he has walked 1 m east.
    sim.soldiers.position.x[walker] = 11
    smoothing.synced(500, -1)

    expect(sim.soldiers.position.x[walker]).toBe(10)
    smoothing.advance(750, -1)
    expect(sim.soldiers.position.x[walker]).toBeCloseTo(10.5)
    smoothing.advance(1000, -1)
    expect(sim.soldiers.position.x[walker]).toBeCloseTo(11)
    // Never past where the server has him.
    smoothing.advance(1500, -1)
    expect(sim.soldiers.position.x[walker]).toBeCloseTo(11)
  })

  it("puts a man moved a long way where he is, and leaves the player's own soldier to prediction", () => {
    const { sim, men } = mirror()
    const [moved = -1, own = -1] = men
    const smoothing = createSmoothing(sim)
    smoothing.synced(0, own)
    sim.soldiers.position.x[moved] = 60
    sim.soldiers.position.x[own] = 25
    smoothing.synced(100, own)

    expect(sim.soldiers.position.x[moved]).toBe(60)
    expect(sim.soldiers.position.x[own]).toBe(25)
    sim.soldiers.position.x[own] = 26
    smoothing.advance(200, own)
    expect(sim.soldiers.position.x[own]).toBe(26)
  })

  it("takes in men who join the battle where the server has them", () => {
    const { sim } = mirror()
    const smoothing = createSmoothing(sim)
    smoothing.synced(0, -1)
    const newcomer = spawnSoldier(sim, { side: Side.German, x: 70, z: 80 })
    smoothing.synced(100, -1)
    smoothing.advance(200, -1)

    expect(sim.soldiers.position.x[newcomer]).toBe(70)
    expect(sim.soldiers.position.z[newcomer]).toBe(80)
  })
})
