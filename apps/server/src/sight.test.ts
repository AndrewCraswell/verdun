import { createFlatMap } from "@verdun/map"
import {
  createSimulation,
  createSquad,
  type LineOfSight,
  Side,
  Stance,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "@verdun/sim"
import { describe, expect, it, vi } from "vitest"
import { createInlineSight, createSightCore, SIGHT_RANGE, sightFrame } from "./sight.ts"

/** Sight lines clear everywhere but across a wall along z = 50. */
const walled: LineOfSight = {
  isClear: (from, to) => (from.z - 50) * (to.z - 50) > 0,
  rebuildRegion: () => 0,
  setSightHeight: () => undefined,
  dispose: () => undefined
}

const field = () => createFlatMap({ name: "field", cellSize: 1, columns: 500, rows: 500 })

/** A French squad at z = 20, and Germans: one in the open near them, one beyond the wall, one out of range. */
function battle() {
  const sim = createSimulation({ map: field(), seed: 1 })
  sim.lineOfSight = walled
  const french = [spawnSoldier(sim, { side: Side.French, x: 100, z: 20 })]
  createSquad(sim, Side.French, french)
  const open = spawnSoldier(sim, { side: Side.German, x: 110, z: 40 })
  const walledOff = spawnSoldier(sim, { side: Side.German, x: 100, z: 60 })
  const far = spawnSoldier(sim, { side: Side.German, x: 100 + SIGHT_RANGE + 10, z: 20 })
  createSquad(sim, Side.German, [open, walledOff, far])
  return { sim, french, open, walledOff, far }
}

describe("each side's sight of the enemy", () => {
  it("sees the enemy in range with a clear line, a share of the battle at a time", () => {
    const { sim, french, open } = battle()
    const sight = createInlineSight(sim, 2)

    // Every man is looked at once in two looks.
    sight.look([])
    const seen = sight.look([])
    expect([...(seen.get(Side.French) ?? [])]).toEqual([open])
    expect([...(seen.get(Side.German) ?? [])]).toEqual(french)
  })

  it("keeps a man seen a little while after he's last made out, then forgets him", () => {
    const { sim, open } = battle()
    const sight = createInlineSight(sim, 1)
    sight.look([])
    sim.soldiers.position.z[open] = 80
    for (let step = 0; step < TICK_RATE; step++) {
      stepSimulation(sim)
    }
    expect(sight.look([]).get(Side.French)?.has(open)).toBe(true)
    for (let step = 0; step < 2 * TICK_RATE; step++) {
      stepSimulation(sim)
    }
    expect(sight.look([]).get(Side.French)?.has(open)).toBe(false)
  })

  it("casts a line between two men again only once one of them has moved", () => {
    const { sim, open } = battle()
    const casts = vi.spyOn(walled, "isClear")
    const core = createSightCore(field(), walled, 1)
    core.look(sightFrame(sim, []))
    const first = casts.mock.calls.length
    core.look(sightFrame(sim, []))
    expect(casts.mock.calls.length).toBe(first)
    sim.soldiers.position.x[open] = 120
    core.look(sightFrame(sim, []))
    expect(casts.mock.calls.length).toBeGreaterThan(first)
    casts.mockRestore()
  })

  it("takes in the craters, and a parapet near either man hides him without a cast", () => {
    const { sim, french, open } = battle()
    const map = field()
    const rebuilt = vi.spyOn(walled, "rebuildRegion")
    const core = createSightCore(map, walled, 1)
    const [frenchman = -1] = french
    // A bank 2 m high just in front of the Frenchman, between him and the German in the open.
    const bank = { minColumn: 90, maxColumn: 115, minRow: 22, maxRow: 23 }
    const heights = new Float32Array(26 * 2).fill(2)
    const seen = core.look(sightFrame(sim, [{ ...bank, heights, surfaces: new Uint8Array(heights.length) }]))

    expect(rebuilt).toHaveBeenCalledWith(90, 22, 115, 23)
    expect(map.heights[22 * 501 + 100]).toBe(2)
    expect(seen.get(Side.French)?.has(open)).toBe(false)
    expect(seen.get(Side.German)?.has(frenchman)).toBe(false)
    rebuilt.mockRestore()
  })

  it("sees no one without sight lines, nor men down a dugout", () => {
    const { sim, open } = battle()
    sim.soldiers.stance.value[open] = Stance.Sheltering
    expect(createInlineSight(sim, 1).look([]).get(Side.French)?.size).toBe(0)
    sim.lineOfSight = null
    expect(createInlineSight(sim, 1).look([]).get(Side.German)?.size).toBe(0)
  })
})
