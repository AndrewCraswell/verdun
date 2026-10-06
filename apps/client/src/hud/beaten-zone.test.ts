import { describe, expect, it } from "vitest"
import { grownZone, inZone, shiftedZone, zoneEdge, zoneSpan } from "./beaten-zone.ts"

describe("a beaten zone on the HUD", () => {
  const circle = { kind: "circle", x: 100, z: 50, radius: 10 } as const
  const box = { kind: "box", fromX: 0, toX: 20, nearZ: 0, farZ: 10 } as const

  it("grows by a margin and moves with the wind, keeping its shape", () => {
    expect(grownZone(circle, 5)).toEqual({ ...circle, radius: 15 })
    expect(grownZone(box, 2)).toEqual({ kind: "box", fromX: -2, toX: 22, nearZ: -2, farZ: 12 })
    expect(shiftedZone(circle, 3, -4)).toEqual({ ...circle, x: 103, z: 46 })
    expect(shiftedZone(box, 1, 1)).toEqual({ kind: "box", fromX: 1, toX: 21, nearZ: 1, farZ: 11 })
  })

  it("says what lies in it, and how far it reaches", () => {
    expect(inZone(circle, 107, 57)).toBe(true)
    expect(inZone(circle, 108, 58)).toBe(false)
    expect(inZone(box, 20, 10)).toBe(true)
    expect(inZone(box, 21, 5)).toBe(false)
    expect(zoneSpan(circle)).toEqual({ fromX: 90, toX: 110, nearZ: 40, farZ: 60, x: 100, z: 50 })
    expect(zoneSpan(box)).toMatchObject({ x: 10, z: 5 })
  })

  it("traces a closed edge round it, a circle round and a box square", () => {
    const ring = zoneEdge(circle, 2)
    expect(ring[0]).toEqual(ring[ring.length - 1])
    expect(ring.every(([x, z]) => Math.abs(Math.hypot(x - 100, z - 50) - 10) < 1e-9)).toBe(true)
    const square = zoneEdge(box, 5)
    expect(square[0]).toEqual(square[square.length - 1])
    expect(square).toHaveLength(13)
    expect(square.every(([x, z]) => x === 0 || x === 20 || z === 0 || z === 10)).toBe(true)
  })
})
