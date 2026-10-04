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

  it("is blocked by what stands high enough: a ruin hides a man, rubble only a man lying down", async () => {
    const map = {
      ...createFlatMap({ name: "village", cellSize: 0.5, columns: 200, rows: 200 }),
      scenery: [
        // A house's standing shell.
        { kind: "ruin" as const, x: 50, z: 30, heading: 0, variant: 1, scale: 1 },
        { kind: "rubble" as const, x: 50, z: 70, heading: 0, variant: 0, scale: 1 },
        { kind: "bridge" as const, x: 50, z: 50, heading: 0, variant: 0, scale: 1 }
      ]
    }
    const lineOfSight = await open(map)
    const across = (z: number, height: number) => lineOfSight.isClear(eyeAt(map, 20, z), { x: 80, y: height, z })

    expect(across(30, EYE_HEIGHT)).toBe(false)
    expect(across(70, EYE_HEIGHT)).toBe(true)
    expect(lineOfSight.isClear({ x: 20, y: 0.4, z: 70 }, { x: 80, y: 0.4, z: 70 })).toBe(false)
    // A bridge hides nothing.
    expect(across(50, EYE_HEIGHT)).toBe(true)

    // Shellfire brings the ruin down to its footings, then clears it.
    lineOfSight.setSightHeight(0, 1)
    expect(across(30, EYE_HEIGHT)).toBe(true)
    lineOfSight.setSightHeight(0, 0)
    expect(lineOfSight.isClear({ x: 20, y: 0.4, z: 30 }, { x: 80, y: 0.4, z: 30 })).toBe(true)
  })

  it("hides behind a house's whole shell, not a round pillar at its middle", async () => {
    const map = {
      ...createFlatMap({ name: "village", cellSize: 0.5, columns: 200, rows: 200 }),
      // 14.3 m across (east-west, at heading 0) and 11.1 m along (north-south).
      scenery: [{ kind: "ruin" as const, x: 50, z: 50, heading: 0, variant: 1, scale: 1 }]
    }
    const lineOfSight = await open(map)
    const eastWest = (z: number) => lineOfSight.isClear(eyeAt(map, 20, z), eyeAt(map, 80, z))
    const northSouth = (x: number) => lineOfSight.isClear(eyeAt(map, x, 20), eyeAt(map, x, 80))

    expect(eastWest(54.5)).toBe(false)
    expect(eastWest(56.5)).toBe(true)
    expect(northSouth(56.5)).toBe(false)
    expect(northSouth(58)).toBe(true)
  })

  it("turns a wall's length with its heading, and hides only men low behind it", async () => {
    const wall = (heading: number) => ({
      ...createFlatMap({ name: "wall", cellSize: 0.5, columns: 200, rows: 200 }),
      scenery: [{ kind: "wall" as const, x: 50, z: 50, heading, variant: 0, scale: 1 }]
    })
    const low = (lineOfSight: LineOfSight, from: [number, number], to: [number, number]) =>
      lineOfSight.isClear({ x: from[0], y: 0.6, z: from[1] }, { x: to[0], y: 0.6, z: to[1] })

    // At heading 0 the wall runs east-west: it hides a man crawling up from the south a metre off its middle...
    const facingNorth = await open(wall(0))
    expect(low(facingNorth, [51, 30], [51, 70])).toBe(false)
    expect(lineOfSight(facingNorth, [51, 30], [51, 70])).toBe(true)
    // ...but a man passing along its line a metre from it is in the open.
    expect(low(facingNorth, [30, 51], [70, 51])).toBe(true)

    // Turned a quarter, it runs north-south.
    const facingEast = await open(wall(Math.PI / 2))
    expect(low(facingEast, [51, 30], [51, 70])).toBe(true)
    expect(low(facingEast, [30, 51], [70, 51])).toBe(false)
  })

  it("lets a man see over a razed house's rubble, but not through its chimney", async () => {
    const map = {
      ...createFlatMap({ name: "razed", cellSize: 0.5, columns: 200, rows: 200 }),
      scenery: [{ kind: "ruin" as const, x: 50, z: 50, heading: 0, variant: 0, scale: 1 }]
    }
    const lineOfSight = await open(map)

    expect(lineOfSight.isClear(eyeAt(map, 20, 50), eyeAt(map, 80, 50))).toBe(true)
    expect(lineOfSight.isClear({ x: 20, y: 0.6, z: 50 }, { x: 80, y: 0.6, z: 50 })).toBe(false)
    // The chimney stands 3 m to the right and 3.5 m back: right is east and back is south at heading 0.
    expect(lineOfSight.isClear(eyeAt(map, 53, 20), eyeAt(map, 53, 80))).toBe(false)
  })
})

/** Whether a standing man at one ground point can see a standing man at another. */
function lineOfSight(sight: LineOfSight, from: [number, number], to: [number, number]): boolean {
  return sight.isClear({ x: from[0], y: EYE_HEIGHT, z: from[1] }, { x: to[0], y: EYE_HEIGHT, z: to[1] })
}
