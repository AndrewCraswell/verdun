import {
  carveTrenches,
  createFlatMap,
  heightAt,
  sampleIndex,
  type Scenery,
  stampCrater,
  Surface,
  type Trench
} from "@verdun/map"
import { describe, expect, it } from "vitest"
import {
  BODY_RADIUS,
  canBeShoved,
  clearOfScenery,
  climbedAhead,
  climbedShapes,
  climbedUnder,
  Climbing,
  insideScenery,
  Obstacle,
  wayAhead
} from "./body.ts"

/** Firm ground 5 m up, with a north-facing fire trench along z = 50. */
function trenchField() {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass)
  const trench: Trench = {
    kind: "fire",
    points: [
      [10, 50],
      [90, 50]
    ],
    facing: "north"
  }
  carveTrenches(map, [trench])
  return { ...map, trenches: [trench] }
}

/** Walks a man from a point along a heading for some seconds at 1.26 m/s, as `wayAhead` lets him. */
function walk(
  map: ReturnType<typeof trenchField>,
  from: { x: number; z: number },
  degrees: number,
  seconds: number,
  climbing: Climbing = Climbing.Steered
) {
  const angle = (degrees * Math.PI) / 180
  const dx = Math.cos(angle)
  const dz = Math.sin(angle)
  const stride = 1.26 / 20
  let { x, z } = from
  for (let step = 0; step < seconds * 20; step++) {
    const way = wayAhead(map, x, z, dx, dz, stride, climbing)
    x += way.x * stride
    z += way.z * stride
  }
  return { x, z, height: heightAt(map, x, z) - 5 }
}

describe("walking into a trench's walls", () => {
  it("keeps a man on the floor and going along the trench when he steers into either wall", () => {
    const map = trenchField()
    for (const degrees of [10, 20, 45, -10, -20, -45]) {
      const end = walk(map, { x: 30, z: 49.6 }, degrees, 4)
      expect(end.height).toBeCloseTo(-1.9, 1)
      // At least the share of his pace that runs along the trench.
      expect(end.x - 30).toBeGreaterThan(5 * Math.cos((degrees * Math.PI) / 180) * 0.9)
    }
  })

  it("stops a steered man at a wall he walks straight into, and lets one on an order climb it", () => {
    const map = trenchField()
    // Due south from the floor: the back wall, 1.9 m and its spoil.
    const steered = walk(map, { x: 30, z: 49.6 }, -90, 3)
    expect(steered.height).toBeCloseTo(-1.9, 1)
    expect(wayAhead(map, 30, 49.2, 0, -1, 0.06, Climbing.Steered)).toMatchObject({ x: 0, z: 0, met: Obstacle.Wall })

    const ordered = wayAhead(map, 30, 49.2, 0, -1, 0.06, Climbing.Ordered)
    expect(ordered).toMatchObject({ climbing: true, met: Obstacle.Wall })
  })

  it("climbs onto the fire step and over the parapet when he heads straight at them", () => {
    const map = trenchField()
    const onTheStep = walk(map, { x: 30, z: 49.6 }, 90, 3)
    expect(onTheStep.height).toBeGreaterThan(-0.9)
    const out = walk(map, { x: 30, z: 49.6 }, 90, 12)
    expect(out.z).toBeGreaterThan(51.1)
    expect(out.height).toBeGreaterThan(-0.2)
  })

  it("walks along a zigzag of bays holding one direction, round every traverse, never leaving the floor", () => {
    const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 300, rows: 300 }, 5, Surface.Grass)
    const zigzag: Trench = {
      kind: "communication",
      points: [
        [20, 20],
        [30, 30],
        [40, 30],
        [50, 40],
        [60, 40],
        [70, 50],
        [80, 50]
      ],
      facing: null
    }
    carveTrenches(map, [zigzag])
    let lowest = 0
    let highest = -Infinity
    let { x, z } = { x: 20.5, z: 20.5 }
    for (let step = 0; step < 60 * 20; step++) {
      const way = wayAhead(map, x, z, Math.SQRT1_2, Math.SQRT1_2, 0.063, Climbing.Steered)
      x += way.x * 0.063
      z += way.z * 0.063
      lowest = Math.min(lowest, heightAt(map, x, z) - 5)
      highest = Math.max(highest, heightAt(map, x, z) - 5)
    }
    expect(x).toBeGreaterThan(70)
    expect(highest).toBeLessThan(-1.5)
    expect(lowest).toBeCloseTo(-1.9, 1)
  })
})

describe("a corner", () => {
  it("stops a man pressed into the point of a V between two walls he won't climb", () => {
    // A cliff 3 m high with a V cut into it, its point at (50, 50), each side 25 degrees off due north.
    const map = createFlatMap({ name: "notch", cellSize: 0.5, columns: 200, rows: 200 }, 0, Surface.Grass)
    for (let row = 0; row <= map.rows; row++) {
      for (let column = 0; column <= map.columns; column++) {
        const x = column * map.cellSize
        const z = row * map.cellSize
        if (z >= 30 && !(z < 50 && Math.abs(x - 50) < (50 - z) * Math.tan((25 * Math.PI) / 180))) {
          map.heights[sampleIndex(map, column, row)] = 3
        }
      }
    }
    // Wide of the point, a wall turns him along it; at the point, every turn runs into the other wall.
    const wide = wayAhead(map, 50.8, 46, 0, 1, 0.07, Climbing.Steered)
    expect(Math.sqrt(wide.x ** 2 + wide.z ** 2)).toBeGreaterThan(0.25)
    expect(wayAhead(map, 50, 49.3, 0, 1, 0.07, Climbing.Steered)).toMatchObject({ x: 0, z: 0, climbing: false })
  })
})

describe("scenery", () => {
  const ruin: Scenery = { kind: "ruin", x: 50, z: 60, heading: 0, variant: 0, scale: 1 }
  const rubble: Scenery = { kind: "rubble", x: 20, z: 20, heading: 0, variant: 0, scale: 1 }
  const map = {
    ...createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass),
    scenery: [ruin, rubble]
  }

  it("keeps men out of impassable footprints, and lets them walk through slow ones", () => {
    expect(insideScenery(map, 50, 58)).toBe(true)
    expect(insideScenery(map, 50, 55)).toBe(false)
    expect(insideScenery(map, 20, 20)).toBe(false)
  })

  it("pushes a man out to the footprint's edge, keeping his way round it", () => {
    const out = clearOfScenery(map, 50.5, 57)
    expect(Math.sqrt((out.x - 50) ** 2 + (out.z - 60) ** 2)).toBeCloseTo(4 + BODY_RADIUS, 5)
    expect(out.x).toBeGreaterThan(50)

    // Walking north into the ruin a little east of its middle slides him round its east side.
    let x = 51
    let z = 50
    for (let step = 0; step < 20 * 20; step++) {
      const next = clearOfScenery(map, x, z + 0.07)
      x = next.x
      z = next.z
      expect(insideScenery(map, x, z)).toBe(false)
    }
    expect(z).toBeGreaterThan(64)
  })

  it("pushes a man standing dead in a footprint's middle out the same way every time", () => {
    const out = clearOfScenery(map, 50, 60)
    expect(out.x).toBeCloseTo(50 + 4 + BODY_RADIUS, 4)
    expect(out.z).toBe(60)
  })

  it("won't shove a man up a wall or into a ruin", () => {
    const trench = trenchField()
    expect(canBeShoved(trench, 30, 49.6, 30.2, 49.6)).toBe(true)
    expect(canBeShoved(trench, 30, 49.6, 30, 48.6)).toBe(false)
    expect(canBeShoved(map, 50, 55, 50, 57)).toBe(false)
  })
})

describe("climbing out of a shell hole", () => {
  it("lets a steered man scramble up a crater's side he heads straight at, where a trench's wall stops him", () => {
    const map = trenchField()
    stampCrater(map, { x: 50, z: 80, radius: 3, depth: 2.2 })
    expect(heightAt(map, 50, 84) - heightAt(map, 50, 80)).toBeGreaterThan(1.3)

    const out = walk(map, { x: 50, z: 80 }, 90, 15)
    expect(out.z).toBeGreaterThan(84)
    expect(out.height).toBeGreaterThan(-0.5)

describe("fences and low walls", () => {
  // A wooden fence at (50, 50) whose rails run east-west, and a low wall at (50, 80) turned a quarter, running north-south.
  const fence: Scenery = { kind: "knife-rest", x: 50, z: 50, heading: 0, variant: 0, scale: 1 }
  const wall: Scenery = { kind: "wall", x: 50, z: 80, heading: Math.PI / 2, variant: 0, scale: 1 }
  const map = {
    ...createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass),
    scenery: [fence, wall]
  }

  it("stand in a man's way along their length, as boxes, not discs", () => {
    expect(climbedShapes(fence)).toEqual([{ x: 50, z: 50, lineX: 1, lineZ: -0, halfLength: 1.82, halfDepth: 0.1 }])
    // Along the fence's rails, out to their ends, and no further.
    expect(insideScenery(map, 51.7, 50.3)).toBe(true)
    expect(insideScenery(map, 50, 50.45)).toBe(false)
    expect(insideScenery(map, 52.2, 50)).toBe(false)
    // The wall runs north-south, 4.3 m long and 0.6 m thick.
    expect(insideScenery(map, 50, 81.9)).toBe(true)
    expect(insideScenery(map, 50.7, 80)).toBe(false)
    // Its lowest stretches are stepped over.
    expect(climbedShapes({ ...wall, variant: 3 })).toEqual([])
  })

  it("stop a man walking straight at one, slide him along it at a slant, and let him round its end", () => {
    const walkInto = (x: number, dx: number) => {
      let px = x
      let pz = 47
      for (let step = 0; step < 20 * 8; step++) {
        const next = clearOfScenery(map, px + dx * 0.07, pz + 0.07)
        px = next.x
        pz = next.z
        expect(insideScenery(map, px, pz)).toBe(false)
      }
      return { x: px, z: pz }
    }
    expect(walkInto(50, 0).z).toBeCloseTo(50 - 0.1 - BODY_RADIUS, 4)
    expect(walkInto(50, 0).x).toBeCloseTo(50, 4)
    // Heading north-east, he slides east along the rails, off their end and on north.
    const slanting = walkInto(50, 1)
    expect(slanting.x).toBeGreaterThan(52.1)
    expect(slanting.z).toBeGreaterThan(51)
  })

  it("push a man inside one out by the nearer face", () => {
    expect(clearOfScenery(map, 50, 50.05)).toEqual({ x: 50, z: expect.closeTo(50.4, 5) })
    expect(clearOfScenery(map, 50, 49.95).z).toBeCloseTo(49.6, 5)
    // Near its end, out past the end.
    expect(clearOfScenery(map, 51.8, 50).x).toBeCloseTo(52.12, 5)
  })

  it("are found under a man astride one, and ahead of a man heading across one within reach", () => {
    expect(climbedUnder(map, 50, 50.5, 0.6)).not.toBeNull()
    expect(climbedUnder(map, 50, 51, 0.6)).toBeNull()
    expect(climbedUnder(map, 10, 10, 0.6)).toBeNull()

    expect(climbedAhead(map, 50, 49, 0, 1, 1)).toMatchObject({
      entry: expect.closeTo(0.6, 5),
      exit: expect.closeTo(1.4, 5)
    })
    expect(climbedAhead(map, 50, 51, 0, -1, 1)?.entry).toBeCloseTo(0.6, 5)
    // Too far off, along it, or past its end.
    expect(climbedAhead(map, 50, 47, 0, 1, 1)).toBeNull()
    expect(climbedAhead(map, 47, 49.5, 1, 0, 1)).toBeNull()
    expect(climbedAhead(map, 52.5, 49.5, 0, 1, 1)).toBeNull()
    expect(climbedAhead(map, 50, 52, 0, 1, 1)).toBeNull()
  })

  it("take a man over two that overlap in one climb, but not two a stride apart", () => {
    const overlapping = {
      ...map,
      scenery: [fence, { ...fence, x: 51.5, z: 50.45 }]
    }
    // He'd come down on the second: over both, out past its far face.
    expect(climbedAhead(overlapping, 51, 49, 0, 1, 1)?.exit).toBeCloseTo(1.85, 5)
    const apart = { ...map, scenery: [fence, { ...fence, z: 52 }] }
    expect(climbedAhead(apart, 50, 49, 0, 1, 1)?.exit).toBeCloseTo(1.4, 5)
  })
})
