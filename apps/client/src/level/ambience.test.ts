import { createFlatMap, type Scenery, type Trench } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { ambienceZones } from "./ambience.ts"

const line = (z: number, facing: "north" | "south"): Trench => ({
  kind: "fire",
  points: [
    [0, z],
    [200, z]
  ],
  facing
})
const at = (kind: Scenery["kind"], x: number, z: number): Scenery => ({ kind, x, z, heading: 0, variant: 0, scale: 1 })

/** A 200 m x 300 m field: French line at z = 100, German at z = 200, a wood in the south-west, ruins in the north. */
const map = {
  ...createFlatMap({ name: "field", cellSize: 1, columns: 200, rows: 300 }),
  trenches: [line(100, "north"), line(200, "south")],
  scenery: [
    ...Array.from({ length: 60 }, (_, index) => at("tree", 20 + (index % 8) * 3, 40 + Math.floor(index / 8) * 3)),
    ...Array.from({ length: 12 }, (_, index) => at("ruin", 150 + (index % 4) * 4, 260 + Math.floor(index / 4) * 4))
  ]
}
const zones = ambienceZones(map)

describe("ambienceZones", () => {
  it("is fully no man's land between the lines, fading out behind them", () => {
    expect(zones.noMansLand(100, 150)).toBe(1)
    expect(zones.noMansLand(100, 60)).toBeCloseTo(0.5)
    expect(zones.noMansLand(100, 0)).toBe(0)
    expect(zones.noMansLand(100, 300)).toBe(0)
  })

  it("finds the woods and the ruins where their scenery stands thick", () => {
    expect(zones.wood(30, 50)).toBeGreaterThan(0.9)
    expect(zones.wood(150, 150)).toBe(0)
    expect(zones.ruins(155, 265)).toBe(1)
    expect(zones.ruins(30, 50)).toBe(0)
  })
})
