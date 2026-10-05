import { TICK_RATE } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createReckoner, DRIFT, nothingShown, reckonShown } from "./reckoning.ts"

/** Positions in centimetres, as the codec sends them on a small map. */
const UNIT = 0.01
const nobody = { has: () => false, arrays: {} }

/** One man at (`x`, `z`) metres, facing `facing`, as the reckoner takes him. */
function man(x: number, z: number, facing = { x: 0, z: 1 }) {
  return {
    "position.x": Uint16Array.of(Math.round(x / UNIT)),
    "position.z": Uint16Array.of(Math.round(z / UNIT)),
    "facing.x": Float32Array.of(facing.x),
    "facing.z": Float32Array.of(facing.z)
  }
}

describe("dead reckoning", () => {
  it("sends a man walking a straight line once, and the page carries him along", () => {
    const reckoner = createReckoner(UNIT)
    const sent: number[] = []
    let shown = nothingShown()
    // 1.5 m/s east, a message every two steps.
    for (let tick = 0; tick <= 100; tick += 2) {
      const x = 10 + (1.5 * tick) / TICK_RATE
      const arrays = reckoner.reckon(man(x, 20), tick, 1)
      sent.push(arrays["anchor.tick"][0] ?? -1)
      shown = reckonShown(shown, arrays, UNIT, tick, 1, () => false, nobody)
      expect(Math.abs((shown.x[0] ?? 0) - x)).toBeLessThan(DRIFT + UNIT)
      expect(shown.z[0]).toBeCloseTo(20)
    }
    // Anchored when he appeared, again once he was seen moving, then not again.
    expect(new Set(sent).size).toBe(2)
  })

  it("sends a man anew when he stops or turns, and renews a moving man's anchor before its step wraps", () => {
    const reckoner = createReckoner(UNIT)
    reckoner.reckon(man(10, 20), 0, 1)
    reckoner.reckon(man(10.15, 20), 2, 1)
    // He stops: the page would carry him on, so he's sent where he stopped, at no pace.
    const stopped = reckoner.reckon(man(10.15, 20), 4, 1)
    reckoner.reckon(man(10.15, 20), 6, 1)
    const still = reckoner.reckon(man(10.15, 20), 8, 1)
    expect(still["pace.x"][0]).toBe(0)
    expect(stopped["anchor.tick"][0]).not.toBe(2)

    // Walking a straight line for twelve seconds, he is anchored afresh at least once more in that time.
    const anchors = new Set<number>()
    for (let tick = 10; tick <= 10 + 12 * TICK_RATE; tick += 2) {
      anchors.add(reckoner.reckon(man(10.15 + (tick - 10) / TICK_RATE, 20), tick, 1)["anchor.tick"][0] ?? -1)
    }
    expect(anchors.size).toBeGreaterThan(2)
  })

  it("sends which way a man faces as a byte of a turn", () => {
    const reckoner = createReckoner(UNIT)
    const east = reckoner.reckon(man(10, 20, { x: 1, z: 0 }), 0, 1)
    expect(east["facing.angle"][0]).toBe(64)
    const shown = reckonShown(nothingShown(), east, UNIT, 0, 1, () => false, nobody)
    expect(shown.facingX[0]).toBeCloseTo(1)
    expect(shown.facingZ[0]).toBeCloseTo(0)
  })

  it("leaves men held where they were, and shows the player's own men as they are", () => {
    const reckoner = createReckoner(UNIT)
    const two = {
      "position.x": Uint16Array.of(1000, 2000),
      "position.z": Uint16Array.of(1000, 2000),
      "facing.x": Float32Array.of(0, 0),
      "facing.z": Float32Array.of(1, 1)
    }
    const arrays = reckoner.reckon(two, 0, 2)
    const exact = {
      has: (soldier: number) => soldier === 1,
      arrays: { ...two, "position.x": Uint16Array.of(0, 2003), "facing.x": Float32Array.of(0, 0.6) }
    }
    const before = reckonShown(nothingShown(), arrays, UNIT, 0, 2, () => false, nobody)
    before.x[0] = 4
    const shown = reckonShown(before, arrays, UNIT, 0, 2, (soldier) => soldier === 0, exact)

    expect(shown.x[0]).toBe(4)
    expect(shown.x[1]).toBeCloseTo(20.03)
    expect(shown.facingX[1]).toBeCloseTo(0.6)
  })
})
