import { createFlatMap, sampleIndex, type Scenery, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { CENTRED_PIECES, layOutDeadwood, layOutGroundCover, layOutLitter, layOutScenery } from "./scenery-dressing.ts"

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
    const [wall, ...rest] = layOutScenery({ ...flat, scenery: [item("wall", { scale: 1.2 })] })

    expect(rest).toHaveLength(0)
    expect(wall?.x).toBe(50)
    expect(wall?.y).toBeCloseTo(5 - 0.1)
    expect(wall?.up).toBeUndefined()
  })

  it("strips the trees near the lines to poles, leaves the ones far behind crowned, and leans them", () => {
    // A fire trench along z = 20, a row of trees 6 m behind it and another 300 m behind it.
    const trench = {
      kind: "fire" as const,
      points: [
        [0, 20],
        [100, 20]
      ] as [number, number][],
      facing: "north" as const
    }
    const row = (z: number) => Array.from({ length: 40 }, (_, index) => item("tree", { x: 5 + index * 2.3, z }))
    const field = {
      ...createFlatMap({ name: "wood", cellSize: 0.5, columns: 200, rows: 700 }, 5),
      trenches: [trench],
      scenery: [...row(14), ...row(320)]
    }
    const trees = layOutScenery(field).filter((placement) => placement.piece.includes("Tree_Dead"))
    const stripped = (placements: typeof trees) =>
      placements.filter((placement) => /^Env_Tree_Dead_0[123]$/.test(placement.piece)).length

    const near = trees.filter((tree) => tree.z < 100)
    const far = trees.filter((tree) => tree.z > 100)
    expect(near).toHaveLength(40)
    expect(stripped(near)).toBeGreaterThan(28)
    expect(stripped(far)).toBeLessThan(12)
    // Leaning, some more than others, none past 0.28 rad off upright.
    const tilts = trees.map((tree) => Math.acos(tree.up?.[1] ?? 1))
    expect(Math.max(...tilts)).toBeLessThanOrEqual(0.28 + 1e-9)
    expect(tilts.filter((tilt) => tilt > 0.05).length).toBeGreaterThan(10)
  })

  it("lays a felled trunk along the log's heading, centred on it", () => {
    const [trunk] = layOutScenery({ ...flat, scenery: [item("log", { variant: 1, heading: Math.PI / 2 })] })

    expect(trunk?.piece).toMatch(/^Env_Tree_Destroyed_0[12]$/)
    // Its foot 1.5 m back along the heading (east), its length lying east along the flat ground.
    expect(trunk?.x).toBeCloseTo(48.5)
    expect(trunk?.z).toBeCloseTo(50)
    expect(trunk?.up?.[0]).toBeCloseTo(1)
    expect(trunk?.up?.[1]).toBeCloseTo(0)
    expect(trunk?.y).toBeCloseTo(5.22)
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

  it("leaves most houses razed to a chimney stack over mounds of rubble, and the rest gutted, torn open or a lone front", () => {
    const kinds = Array.from({ length: 8 }, (_, variant) =>
      layOutScenery({ ...flat, scenery: [item("ruin", { variant })] }).map((placement) => placement.piece)
    )
    const razed = kinds.filter((pieces) => pieces.includes("Prop_Chimney_01"))

    expect(razed).toHaveLength(3)
    expect(razed.every((pieces) => pieces.some((piece) => piece.startsWith("Env_Rubble_Pile")))).toBe(true)
    expect(kinds.filter((pieces) => pieces.some((piece) => piece.startsWith("Bld_TownHouse")))).toHaveLength(2)
    expect(kinds.filter((pieces) => pieces.some((piece) => piece.startsWith("Bld_City_Destroyed")))).toHaveLength(3)
    // The chimney stands at 0.6 of the piece's height.
    const chimney = layOutScenery({ ...flat, scenery: [item("ruin", { variant: 0 })] }).find(
      (placement) => placement.piece === "Prop_Chimney_01"
    )
    expect(chimney?.scale).toEqual([0.6, 0.6, 0.6])
  })

  it("strews no man's land with the litter of battle, thickest near the trenches and never in one", () => {
    const trench = {
      kind: "fire" as const,
      points: [
        [10, 20],
        [90, 20]
      ] as [number, number][],
      facing: "north" as const
    }
    const field = {
      ...createFlatMap({ name: "nml", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Churned),
      trenches: [trench]
    }
    const litter = layOutLitter(field)
    const near = litter.filter((placement) => placement.z > 24 && placement.z < 50)
    const far = litter.filter((placement) => placement.z > 70)

    expect(litter.length).toBeGreaterThan(30)
    expect(near.length).toBeGreaterThan(far.length)
    expect(litter.every((placement) => Math.abs(placement.z - 20) > 4 || placement.x < 6 || placement.x > 94)).toBe(
      true
    )
    expect(new Set(litter.map((placement) => placement.piece)).size).toBeGreaterThan(5)
    // Nothing on ground the shells didn't churn.
    expect(layOutLitter(flat)).toHaveLength(0)
  })

  it("strews deadwood round the woods, more of it near the lines, and none in a trench", () => {
    const trench = {
      kind: "fire" as const,
      points: [
        [0, 20],
        [100, 20]
      ] as [number, number][],
      facing: "north" as const
    }
    const grove = (z: number) =>
      Array.from({ length: 60 }, (_, index) =>
        item(index % 3 === 0 ? "stump" : "tree", { x: 5 + (index % 20) * 4.5, z: z + Math.floor(index / 20) * 4 })
      )
    const field = {
      ...createFlatMap({ name: "wood", cellSize: 0.5, columns: 200, rows: 700 }, 5),
      trenches: [trench],
      scenery: [...grove(26), ...grove(300), item("wall", { x: 50, z: 200 })]
    }
    const deadwood = layOutDeadwood(field)
    const near = deadwood.filter((placement) => placement.z < 100)
    const far = deadwood.filter((placement) => placement.z > 100)

    expect(near.length).toBeGreaterThan(far.length)
    expect(far.length).toBeGreaterThan(5)
    expect(deadwood.every((placement) => Math.abs(placement.z - 20) >= 4)).toBe(true)
    // Nothing round the wall: deadwood comes off trees.
    expect(deadwood.some((placement) => Math.hypot(placement.x - 50, placement.z - 200) < 5)).toBe(false)
    expect(new Set(deadwood.map((placement) => placement.piece)).size).toBeGreaterThan(5)
  })

  it("draws each wall variant with its own piece", () => {
    const pieces = [0, 1, 2, 3].map(
      (variant) => layOutScenery({ ...flat, scenery: [item("wall", { variant })] })[0]?.piece
    )

    expect(new Set(pieces).size).toBe(4)
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
