import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, heightAt, railwayCourse, Surface } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { placementMatrix } from "./dress-battlefield.ts"
import type { Placement } from "./placement.ts"
import {
  createRailwayPieces,
  distanceToTracks,
  layOutRailways,
  RAILWAY_LOADS,
  RAILWAY_PIECES,
  railwayTracks
} from "./railway.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function pieces(): Mesh[] {
  const engine = new NullEngine()
  engines.push(engine)
  return createRailwayPieces(new Scene(engine))
}

/**
 * A sector 200 m by 60 m rising 3 m in 100 m to the east, with a line in from its west edge that bends north to end
 * short of its east edge, and a dump beside it.
 */
function railhead() {
  const flat = createFlatMap({ name: "railhead", cellSize: 0.5, columns: 400, rows: 120 }, 0)
  const heights = flat.heights.map((_, index) => 2 + (index % 401) * 0.5 * 0.03)
  return {
    ...flat,
    heights,
    railways: [
      {
        points: [
          [0, 20],
          [150, 20],
          [180, 30]
        ] as const
      }
    ],
    scenery: [{ kind: "stores" as const, x: 100, z: 26, heading: 0, variant: 0, scale: 1 }]
  }
}

const RAIL_TOP = 0.105

/** Where a point in the world lies in a placed piece's own frame. */
function inFrame(piece: Placement, point: Placement): Vector3 {
  return Vector3.TransformCoordinates(new Vector3(point.x, point.y, point.z), Matrix.Invert(placementMatrix(piece)))
}

describe("createRailwayPieces", () => {
  it("makes the track, plain and worn, the wagon and the buffer stop, disabled like the kit's pieces", () => {
    const made = pieces()
    expect(made.map((mesh) => mesh.name)).toEqual(Object.values(RAILWAY_PIECES))
    for (const mesh of made) {
      expect(mesh.isEnabled()).toBe(false)
      expect(mesh.getVerticesData("color")?.length).toBe(mesh.getTotalVertices() * 4)
    }
    // A panel of track: sleepers a metre long, its length along z, the rails' tops just over the bed.
    const track = made[0]?.getBoundingInfo().boundingBox
    expect(track?.maximum.y).toBeCloseTo(RAIL_TOP)
    expect(track?.maximum.z).toBeCloseTo(1.25)
    expect(track?.maximum.x).toBeGreaterThan(0.5)
  })

  it("winds every face to show on the outside", () => {
    /** The volume a mesh's faces enclose, wound as Babylon shows them, and how many of them face straight down. */
    const winding = (mesh: Mesh | undefined) => {
      const positions = mesh?.getVerticesData("position") ?? []
      const indices = mesh?.getIndices() ?? []
      const at = (index: number) => Vector3.FromArray(positions, (indices[index] ?? 0) * 3)
      let volume = 0
      let down = 0
      for (let index = 0; index < indices.length; index += 3) {
        const [a, b, c] = [at(index), at(index + 1), at(index + 2)]
        // Babylon draws a triangle's front where (a - b) x (c - b) points.
        const front = Vector3.Cross(a.subtract(b), c.subtract(b)).normalize()
        volume -= Vector3.Dot(a, Vector3.Cross(b, c)) / 6
        down += front.y < -0.9 ? 1 : 0
      }
      return { volume, down }
    }
    const [track, worn, wagon, stop] = pieces()

    // The track's undersides lie in the bed and are left out: every flat face is a top.
    expect([winding(track).down, winding(worn).down]).toEqual([0, 0])
    // Closed solids wound to show outside enclose their volume.
    expect(winding(wagon).volume).toBeGreaterThan(0.1)
    expect(winding(stop).volume).toBeGreaterThan(0.1)
  })
})

describe("layOutRailways", () => {
  it("lays panels of track end to end along the line's course, on its bed, some of them worn", () => {
    const map = railhead()
    const panels = layOutRailways(map).filter((placement) => placement.piece.startsWith("Railway_Track"))
    const [course = []] = railwayTracks(map, false)

    expect(panels.length).toBe(Math.round(183.5 / 2.5))
    expect(panels.filter((panel) => panel.piece === RAILWAY_PIECES.worn).length).toBeGreaterThan(3)
    for (const panel of panels) {
      expect(distanceToTracks([course], panel.x, panel.z)).toBeLessThan(0.05)
      expect(panel.y).toBeCloseTo(heightAt(map, panel.x, panel.z), 1)
    }
    const apart = panels
      .slice(1)
      .map((next, index) => Math.hypot(next.x - (panels[index]?.x ?? 0), next.z - (panels[index]?.z ?? 0)))
    expect(apart.every((distance) => Math.abs(distance - 2.5) < 0.05)).toBe(true)
    // Up the slope, each panel tilts with it.
    expect(panels[0]?.up?.[0]).toBeLessThan(-0.02)
  })

  it("runs the track on over the ground beyond the sector where the line leaves it, and only there", () => {
    const map = railhead()
    const panels = (beyond?: (x: number, z: number) => number) =>
      layOutRailways(map, beyond).filter((placement) => placement.piece.startsWith("Railway_Track"))

    expect(panels().every((panel) => panel.x >= 0)).toBe(true)
    const runOn = panels(() => -1).filter((panel) => panel.x < 0)
    expect(Math.min(...runOn.map((panel) => panel.x))).toBeLessThan(-290)
    expect(runOn.filter((panel) => panel.x < -2).every((panel) => panel.y === -1)).toBe(true)
    // The other end stops short of the sector's edge, where it ends in a buffer stop.
    expect(Math.max(...panels(() => -1).map((panel) => panel.x))).toBeLessThan(181)
  })

  it("stands a rake of wagons on the rails by a dump, loaded on their decks", () => {
    const map = railhead()
    const placements = layOutRailways(map)
    const wagons = placements.filter(
      (placement) => placement.piece === RAILWAY_PIECES.wagon && Math.abs(placement.x - 100) < 10
    )
    const loads = placements.filter((placement) => placement.piece in RAILWAY_LOADS && Math.abs(placement.x - 100) < 10)

    expect(wagons.length).toBeGreaterThanOrEqual(2)
    for (const wagon of wagons) {
      expect(wagon.y - heightAt(map, wagon.x, wagon.z)).toBeCloseTo(RAIL_TOP, 2)
      expect(Math.abs(wagon.yaw - Math.PI / 2)).toBeLessThan(0.01)
    }
    expect(loads.length).toBeGreaterThan(0)
    for (const load of loads) {
      const wagon = wagons.find((candidate) => Math.hypot(candidate.x - load.x, candidate.z - load.z) < 1)
      if (!wagon) {
        throw new Error(`a load at ${load.x}, ${load.z} has no wagon under it`)
      }
      const onDeck = inFrame(wagon, load)
      expect(onDeck.y).toBeCloseTo(0.42, 2)
      expect(Math.abs(onDeck.x)).toBeLessThan(0.01)
      expect(Math.abs(onDeck.z)).toBeCloseTo(0.6, 2)
    }
  })

  it("ends the line short of the sector's edge in a buffer stop facing back up it", () => {
    const map = railhead()
    const stops = layOutRailways(map).filter((placement) => placement.piece === RAILWAY_PIECES.stop)

    expect(stops).toHaveLength(1)
    expect(stops[0]?.x).toBeCloseTo(180)
    expect(stops[0]?.z).toBeCloseTo(30)
    // Its front, +z, toward the way the line came: back down its last leg.
    expect(Math.sin(stops[0]?.yaw ?? 0)).toBeCloseTo(-30 / Math.hypot(30, 10), 2)
    expect(Math.cos(stops[0]?.yaw ?? 0)).toBeCloseTo(-10 / Math.hypot(30, 10), 2)
  })

  it("lays a wagon off the rails beside a long line, over on its side on the ground, its load spilled", () => {
    const map = railhead()
    const placements = layOutRailways(map)
    const wagonMesh = pieces().find((mesh) => mesh.name === RAILWAY_PIECES.wagon)
    const derailed = placements.find(
      (placement) => placement.piece === RAILWAY_PIECES.wagon && (placement.up?.[1] ?? 1) < 0.5
    )
    if (!derailed || !wagonMesh) {
      throw new Error("a long line should have a wagon off its rails")
    }
    const [course = []] = railwayTracks(map, false)

    expect(distanceToTracks([course], derailed.x, derailed.z)).toBeGreaterThan(1)
    // Its lowest corner just in the ground.
    const { minimum, maximum } = wagonMesh.getBoundingInfo().boundingBox
    const world = placementMatrix(derailed)
    const lowest = Math.min(
      ...Array.from({ length: 8 }, (_, corner) => {
        const local = new Vector3(
          corner & 1 ? maximum.x : minimum.x,
          corner & 2 ? maximum.y : minimum.y,
          corner & 4 ? maximum.z : minimum.z
        )
        const point = Vector3.TransformCoordinates(local, world)
        return point.y - heightAt(map, point.x, point.z)
      })
    )
    expect(lowest).toBeLessThan(0)
    expect(lowest).toBeGreaterThan(-0.15)
    const spilled = placements.filter(
      (placement) =>
        placement.piece in RAILWAY_LOADS && Math.hypot(placement.x - derailed.x, placement.z - derailed.z) < 4
    )
    expect(spilled.length).toBe(2)
    for (const load of spilled) {
      expect(load.y).toBeCloseTo(heightAt(map, load.x, load.z) - 0.03)
    }
  })

  it("keeps the wagon off the rails off the chalk of a road", () => {
    const map = railhead()
    // A road across the line where the wagon would otherwise lie.
    const surfaces = map.surfaces.map((surface, index) => {
      const x = (index % 401) * 0.5
      return x > 70 && x < 85 ? Surface.Chalk : surface
    })
    const derailed = layOutRailways({ ...map, surfaces }).find(
      (placement) => placement.piece === RAILWAY_PIECES.wagon && (placement.up?.[1] ?? 1) < 0.5
    )

    expect(derailed?.x).toBeLessThan(68)
  })

  it("keeps a short line to its track and stop alone", () => {
    const map = {
      ...railhead(),
      railways: [
        {
          points: [
            [20, 20],
            [60, 20]
          ] as const
        }
      ],
      scenery: []
    }
    const placements = layOutRailways(map)
    expect(placements.filter((placement) => placement.piece === RAILWAY_PIECES.stop)).toHaveLength(2)
    expect(placements.some((placement) => placement.piece === RAILWAY_PIECES.wagon)).toBe(false)
  })
})

describe("railwayTracks", () => {
  it("follows each line's course, and runs it on beyond the sector's edge where it leaves it", () => {
    const map = railhead()
    const [course = []] = railwayTracks(map, false)
    const [runOn = []] = railwayTracks(map, true)

    expect(course).toEqual(railwayCourse(map.railways[0] ?? { points: [] }))
    expect(runOn.slice(1)).toEqual(course)
    expect(runOn[0]?.[0]).toBeCloseTo(-300)
    expect(runOn[0]?.[1]).toBeCloseTo(20)
    expect(distanceToTracks([runOn], -150, 22)).toBeCloseTo(2)
    expect(distanceToTracks([], 0, 0)).toBe(Infinity)
  })
})
