import { createFlatMap, sampleIndex, type Scenery, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { CENTRED_PIECES, layOutGroundCover, layOutScenery } from "./scenery-dressing.ts"

const flat = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5)
const item = (kind: Scenery["kind"], overrides: Partial<Scenery> = {}): Scenery => ({
  kind,
  x: 50,
  z: 50,
  heading: 0,
  variant: 0,
  scale: 1,
  ...overrides
})

describe("layOutScenery", () => {
  it("places one piece for simple kinds, standing on the ground", () => {
    const [tree, ...rest] = layOutScenery({ ...flat, scenery: [item("tree", { scale: 1.2 })] })

    expect(rest).toHaveLength(0)
    expect(tree?.x).toBe(50)
    expect(tree?.y).toBeCloseTo(5 - 0.2 * 1.2)
    expect(tree?.scale).toEqual([1.2, 1.2, 1.2])
    expect(tree?.up).toBeUndefined()
  })

  it("builds composite emplacements, turning their parts with the item's heading", () => {
    const north = layOutScenery({ ...flat, scenery: [item("gun")] })
    const east = layOutScenery({ ...flat, scenery: [item("gun", { heading: Math.PI / 2 })] })

    expect(north.map((part) => part.piece)).toContain("Veh_Artillery_01")
    expect(north.length).toBeGreaterThan(3)
    // The sandbag wall 3.6 m in front of the gun: north of it facing north, east of it facing east.
    const frontNorth = north.find((part) => part.piece.includes("Sandbag") && part.z > 52)
    const frontEast = east.find((part) => part.piece.includes("Sandbag") && part.x > 52)
    expect(frontNorth?.z).toBeCloseTo(53.6)
    expect(frontEast?.x).toBeCloseTo(53.6)
    expect(frontEast?.z).toBeCloseTo(50)
  })

  it("picks the art variant by the item's variant", () => {
    const [french] = layOutScenery({ ...flat, scenery: [item("machine-gun", { variant: 0 })] })
    const [german] = layOutScenery({ ...flat, scenery: [item("machine-gun", { variant: 1 })] })

    expect(french?.piece).toContain("British")
    expect(german?.piece).toContain("German")
  })

  it("fills shell holes with water to its radius", () => {
    const [pool] = layOutScenery({ ...flat, scenery: [item("pool", { scale: 2.7 })] })

    expect(pool?.piece).toBe("Env_Crater_Water_01")
    expect(pool?.y).toBeCloseTo(5.4)
    expect(pool?.scale?.[0]).toBeCloseTo(2.7 / 5.41)
  })

  it("lays bridges at the level of the ground either side of the trench below", () => {
    const [bridge] = layOutScenery({ ...flat, scenery: [item("bridge", { heading: 0 })] })

    expect(bridge?.y).toBeGreaterThan(5 + 1.9)
    expect(bridge?.yaw).toBeCloseTo(Math.PI / 2)
  })

  it("stakes wire along each belt, fence pieces lengthwise with coils thrown either side", () => {
    const placements = layOutScenery({
      ...flat,
      wire: [
        {
          points: [
            [10, 30],
            [60, 30]
          ]
        }
      ]
    })
    const fences = placements.filter((placement) => placement.piece.startsWith("Prop_Wire_Fence_0"))

    expect(fences).toHaveLength(5)
    // Fence pieces run along their x axis: turned a quarter less than the belt's direction.
    expect(fences.every((fence) => Math.abs(fence.yaw) < 1e-9)).toBe(true)
    expect(fences.every((fence) => Math.abs((fence.scale?.[0] ?? 0) - 1) < 0.01)).toBe(true)
    expect(placements.length).toBeGreaterThan(fences.length)
  })

  it("lists the pieces modelled off their middle", () => {
    expect(CENTRED_PIECES.has("Bld_City_Destroyed_01")).toBe(true)
    expect(CENTRED_PIECES.has("Env_Trench_Deep_Straight_01")).toBe(false)
  })
})

describe("layOutGroundCover", () => {
  it("grows tufts of grass on grass, thickest where it's unbroken, and none on mud", () => {
    const meadow = createFlatMap({ name: "meadow", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass)
    // Shell the eastern half to mud.
    for (let row = 0; row <= meadow.rows; row++) {
      for (let column = 100; column <= meadow.columns; column++) {
        meadow.surfaces[sampleIndex(meadow, column, row)] = Surface.Mud
      }
    }
    const tufts = layOutGroundCover(meadow)

    expect(tufts.length).toBeGreaterThan(200)
    expect(tufts.every((tuft) => tuft.x < 50.5)).toBe(true)
    expect(tufts.every((tuft) => Math.abs(tuft.y - 4.95) < 0.01)).toBe(true)
    expect(tufts.some((tuft) => tuft.piece.startsWith("Gen_Env_Grass_Tall"))).toBe(true)
    expect(layOutGroundCover(flat)).toHaveLength(0)
  })
})
