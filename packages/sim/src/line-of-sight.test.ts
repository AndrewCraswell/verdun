import { carveTrenches, createFlatMap, sampleIndex, TRENCH_PROFILE, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { createLineOfSight, EYE_HEIGHT, eyeAt, type LineOfSight } from "./line-of-sight.ts"

const opened: LineOfSight[] = []
async function open(map: Parameters<typeof createLineOfSight>[0]) {
  const lineOfSight = await createLineOfSight(map)
  opened.push(lineOfSight)
  return lineOfSight
}

afterEach(() => {
  for (const lineOfSight of opened.splice(0)) {
    lineOfSight.dispose()
  }
})

/** Flat ground 100 m square with a 3 m high, 4 m thick wall running north-south at x = 50. */
function walledMap() {
  const map = createFlatMap({ name: "wall", cellSize: 0.5, columns: 200, rows: 200 })
  for (let row = 0; row <= 200; row++) {
    for (let column = 96; column <= 104; column++) {
      map.heights[sampleIndex(map, column, row)] = 3
    }
  }
  return map
}

describe("createLineOfSight", () => {
  it("sees across open ground", async () => {
    const map = createFlatMap({ name: "flat", cellSize: 0.5, columns: 200, rows: 200 })
    const lineOfSight = await open(map)

    expect(lineOfSight.isClear(eyeAt(map, 10, 10), { x: 90, y: 1, z: 90 })).toBe(true)
  })

  it("is blocked by rising ground between the points, in either direction", async () => {
    const map = walledMap()
    const lineOfSight = await open(map)
    const west = eyeAt(map, 20, 50)
    const east = { x: 80, y: EYE_HEIGHT, z: 50 }

    expect(lineOfSight.isClear(west, east)).toBe(false)
    expect(lineOfSight.isClear(east, west)).toBe(false)
    // Looking over the wall from high enough is fine.
    expect(lineOfSight.isClear({ x: 20, y: 20, z: 50 }, { x: 80, y: 20, z: 50 })).toBe(true)
  })

  it("sees things lying on the ground without the ground itself getting in the way", async () => {
    const map = createFlatMap({ name: "flat", cellSize: 0.5, columns: 200, rows: 200 })
    const lineOfSight = await open(map)

    expect(lineOfSight.isClear(eyeAt(map, 10, 10), { x: 40, y: 0, z: 10 })).toBe(true)
    expect(lineOfSight.isClear(eyeAt(map, 10, 10), eyeAt(map, 10, 10))).toBe(true)
  })

  it("hides a soldier in a trench from the open, but not one on the fire step looking out", async () => {
    const map = createFlatMap({ name: "trench", cellSize: 0.5, columns: 200, rows: 200 })
    const trench: Trench = {
      kind: "fire",
      points: [
        [10, 50],
        [90, 50]
      ],
      facing: "north"
    }
    carveTrenches(map, [trench])
    const lineOfSight = await open(map)
    const inTheTrench = eyeAt(map, 50, 50)
    const onTheFireStep = eyeAt(map, 50, 50 + (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2)
    const outInFront = eyeAt(map, 50, 120)

    expect(lineOfSight.isClear(outInFront, inTheTrench)).toBe(false)
    expect(lineOfSight.isClear(onTheFireStep, outInFront)).toBe(true)
  })

  it("blocks shallow sight lines from beyond the map edge", async () => {
    // Regression: with per-chunk heightfields, rays entering a chunk through its side missed the ground.
    const map = createFlatMap({ name: "flat", cellSize: 0.5, columns: 200, rows: 200 })
    const lineOfSight = await open(map)

    for (const fromZ of [99, 100, 101, 120, 160]) {
      expect(lineOfSight.isClear({ x: 50, y: 1.65, z: fromZ }, { x: 50, y: -0.35, z: 50 })).toBe(false)
    }
  })

  it("updates after the ground changes", async () => {
    const map = walledMap()
    const lineOfSight = await open(map)
    const west = eyeAt(map, 20, 50)
    const east = eyeAt(map, 80, 50)
    for (let row = 0; row <= 200; row++) {
      for (let column = 96; column <= 104; column++) {
        map.heights[sampleIndex(map, column, row)] = 0
      }
    }

    expect(lineOfSight.isClear(west, east)).toBe(false)
    expect(lineOfSight.rebuildRegion(48, 0, 52, 100)).toBe(1)
    expect(lineOfSight.isClear(west, east)).toBe(true)
    expect(lineOfSight.rebuildRegion(500, 500, 600, 600)).toBe(0)
  })
})
