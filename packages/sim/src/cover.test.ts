import { createFlatMap, stampCrater, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { coverNear } from "./cover.ts"
import { hollowDepth } from "./hollows.ts"
import { createSimulation } from "./simulation.ts"

function field(withCrater: boolean) {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass)
  if (withCrater) {
    stampCrater(map, { x: 52, z: 50, radius: 2, depth: 1 })
  }
  return { ...map, wire: [{ points: [[10, 70] as [number, number], [90, 70] as [number, number]] }] }
}

describe("cover", () => {
  it("finds a shell hole's bottom well below the ground around it, and nothing on the flat", () => {
    const sim = createSimulation({ map: field(true), seed: 1 })

    expect(hollowDepth(sim, 52, 50)).toBeGreaterThan(0.5)
    expect(hollowDepth(sim, 30, 30)).toBeCloseTo(0)
  })

  it("sends a man to the shell hole beside where he was sent, and leaves him there on the flat", () => {
    const sim = createSimulation({ map: field(true), seed: 1 })

    expect(coverNear(sim, 50, 50)).toEqual({ x: 52, z: 50 })
    expect(coverNear(sim, 30, 30)).toEqual({ x: 30, z: 30 })
  })

  it("never puts him in the wire", () => {
    const sim = createSimulation({ map: field(false), seed: 1 })
    const spot = coverNear(sim, 40, 70)

    expect(Math.abs(spot.z - 70)).toBeGreaterThan(1.5)
    expect(Math.abs(spot.x - 40)).toBeLessThanOrEqual(3)
  })
})
