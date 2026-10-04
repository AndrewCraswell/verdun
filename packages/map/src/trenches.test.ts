import { describe, expect, it } from "vitest"
import { createFlatMap, mapDepth, sampleIndex, Surface } from "./format.ts"
import { generatePrototypeSector } from "./generate.ts"
import { heightAt } from "./sampling.ts"
import { carveTrenches, layOutFront, pointsAlong, type Trench, TRENCH_PROFILE } from "./trenches.ts"

/** A straight north-facing fire trench across a flat 40 m x 40 m map at z = 20. */
function straightFireTrench() {
  const map = createFlatMap({ name: "test", cellSize: 0.5, columns: 80, rows: 80 }, 10, Surface.Grass)
  const trench: Trench = {
    kind: "fire",
    points: [
      [5, 20],
      [35, 20]
    ],
    facing: "north"
  }
  const bounds = carveTrenches(map, [trench])
  return { map, bounds }
}

describe("carveTrenches", () => {
  it("digs the floor, a fire step toward the enemy, and a parapet in front", () => {
    const { map } = straightFireTrench()

    expect(heightAt(map, 20, 20)).toBeCloseTo(10 - TRENCH_PROFILE.floorDepth)
    // Fire step on the north (enemy) side.
    expect(heightAt(map, 20, 21)).toBeCloseTo(10 - TRENCH_PROFILE.fireStepDepth)
    // Parapet of spoil beyond it, tapering to nothing.
    expect(heightAt(map, 20, 21.5)).toBeGreaterThan(10)
    expect(heightAt(map, 20, 23)).toBeCloseTo(10)
    // No fire step behind: the floor runs back to the rear wall, then a low parados.
    expect(heightAt(map, 20, 19)).toBeCloseTo(10 - TRENCH_PROFILE.floorDepth)
    expect(heightAt(map, 20, 18.5)).toBeGreaterThan(10)
    expect(heightAt(map, 20, 18.5)).toBeLessThan(10 + TRENCH_PROFILE.paradosHeight)
  })

  it("marks the trench as mud and leaves the ground beyond untouched", () => {
    const { map } = straightFireTrench()

    expect(map.surfaces[sampleIndex(map, 40, 40)]).toBe(Surface.Mud)
    expect(map.surfaces[sampleIndex(map, 40, 50)]).toBe(Surface.Grass)
    expect(heightAt(map, 20, 30)).toBe(10)
  })

  it("reports the area it changed, for rebuilding terrain and colliders", () => {
    const { bounds } = straightFireTrench()

    expect(bounds?.minX).toBeLessThanOrEqual(5 - TRENCH_PROFILE.parapetOuter)
    expect(bounds?.maxZ).toBeGreaterThanOrEqual(20 + TRENCH_PROFILE.parapetOuter)
    expect(carveTrenches(createFlatMap({ name: "x", cellSize: 1, columns: 4, rows: 4 }), [])).toBeNull()
  })

  it("digs communication trenches wall to wall with no fire step, and heaps spoil either side", () => {
    const map = createFlatMap({ name: "test", cellSize: 0.5, columns: 40, rows: 40 }, 5)
    carveTrenches(map, [
      {
        kind: "communication",
        points: [
          [10, 2],
          [10, 18]
        ],
        facing: null
      }
    ])

    expect(heightAt(map, 10, 10)).toBeCloseTo(5 - TRENCH_PROFILE.communicationDepth)
    expect(heightAt(map, 11, 10)).toBeCloseTo(5 - TRENCH_PROFILE.communicationDepth)
    expect(heightAt(map, 8.5, 10)).toBeGreaterThan(5)
    expect(heightAt(map, 11.5, 10)).toBeGreaterThan(5)
    expect(heightAt(map, 13.5, 10)).toBe(5)
  })

  it("faces south-facing trenches the other way", () => {
    const map = createFlatMap({ name: "test", cellSize: 0.5, columns: 80, rows: 80 }, 10)
    carveTrenches(map, [
      {
        kind: "fire",
        points: [
          [5, 20],
          [35, 20]
        ],
        facing: "south"
      }
    ])

    expect(heightAt(map, 20, 19)).toBeCloseTo(10 - TRENCH_PROFILE.fireStepDepth)
    expect(heightAt(map, 20, 21)).toBeLessThan(10 + TRENCH_PROFILE.parapetHeight)
  })
})

describe("layOutFront", () => {
  it("gives each side a fire trench, a support trench and communication trenches between", () => {
    const map = createFlatMap({ name: "sector", cellSize: 0.5, columns: 1200, rows: 800 })
    const trenches = layOutFront(map)
    const fire = trenches.filter((trench) => trench.kind === "fire")

    expect(fire.filter((trench) => trench.facing === "north")).toHaveLength(2)
    expect(fire.filter((trench) => trench.facing === "south")).toHaveLength(2)
    expect(trenches.filter((trench) => trench.kind === "communication").length).toBeGreaterThanOrEqual(4)
    // French lines in the south quarter, German in the north, no man's land clear between them.
    for (const trench of trenches) {
      for (const [, z] of trench.points) {
        expect(z < mapDepth(map) * 0.3 || z > mapDepth(map) * 0.7).toBe(true)
      }
    }
  })

  it("traces fire trenches as bays and traverses, not a straight line", () => {
    const map = createFlatMap({ name: "sector", cellSize: 0.5, columns: 1200, rows: 800 })
    const [frenchFire] = layOutFront(map)
    const depths = new Set(frenchFire?.points.map(([, z]) => z))

    expect(depths.size).toBe(2)
  })
})

describe("generatePrototypeSector", () => {
  it("carves the laid-out trenches into the generated terrain", () => {
    const map = generatePrototypeSector({
      name: "sector",
      widthMeters: 300,
      depthMeters: 200,
      cellSize: 0.5,
      seed: 1916,
      amplitude: 10
    })
    const [frenchFire] = map.trenches
    const [x, z] = frenchFire?.points[0] ?? [0, 0]

    expect(map.trenches.length).toBeGreaterThan(4)
    expect(map.surfaces[sampleIndex(map, x / 0.5, z / 0.5)]).toBe(Surface.Mud)
  })
})

describe("pointsAlong", () => {
  it("spaces points evenly along the whole line, across corners", () => {
    const trench: Trench = {
      kind: "communication",
      points: [
        [0, 0],
        [10, 0],
        [10, 10]
      ],
      facing: null
    }

    expect(pointsAlong(trench, 5)).toEqual([
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 5],
      [10, 10]
    ])
  })
})
