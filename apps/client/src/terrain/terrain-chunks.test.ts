import { VertexBuffer } from "@babylonjs/core/Buffers/buffer"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, sampleIndex, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { surfaceColors } from "../palette.ts"
import { CHUNK_SIZE_METERS, createTerrainChunks, WETNESS_ATTRIBUTE } from "./terrain-chunks.ts"

const engines: NullEngine[] = []
/** A point well off the map, to flush from without bringing any chunk into detail. */
const FAR = 10_000

/** The highest point of a chunk's ground. */
function highest(mesh: Mesh | undefined): number {
  return Math.max(...Array.from(mesh?.getVerticesData(VertexBuffer.PositionKind) ?? []).filter((_, i) => i % 3 === 1))
}

function setup(widthMeters: number, depthMeters: number, renderStep?: number, trenches: readonly Trench[] = []) {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const flat = createFlatMap({ name: "test", cellSize: 0.5, columns: widthMeters * 2, rows: depthMeters * 2 })
  const map = { ...flat, trenches }
  const material = new StandardMaterial("ground", scene)
  return { map, terrain: createTerrainChunks(scene, map, { material, surfaceColors, renderStep }) }
}

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

describe("createTerrainChunks", () => {
  it("covers the map with 64 m chunks, the last ones partial", () => {
    // The prototype sector: 600 m x 400 m is 10 x 7 chunks.
    const { terrain } = setup(600, 400)

    expect(CHUNK_SIZE_METERS).toBe(64)
    expect(terrain.meshes).toHaveLength(70)
    // A full chunk at 1 m vertices is 65 x 65, plus a skirt along each of its four edges; the last column of chunks is
    // 600 - 576 = 24 m wide.
    expect(terrain.meshes[0]?.getTotalVertices()).toBe(65 * 65 + 4 * 65)
    expect(terrain.meshes[9]?.getTotalVertices()).toBe(25 * 65 + 2 * 25 + 2 * 65)
    // Every vertex carries its surface colour.
    expect(terrain.meshes[0]?.getVerticesData("color")).toHaveLength((65 * 65 + 4 * 65) * 4)
  })

  it("renders chunks with trenches at full 0.5 m detail, so trench steps keep their shape", () => {
    const trench: Trench = {
      kind: "fire",
      points: [
        [10, 20],
        [50, 20]
      ],
      facing: "north"
    }
    const { terrain } = setup(128, 128, 2, [trench])

    // The trench chunk at every sample: 129 x 129. Its neighbour to the north at 1 m: 65 x 65. Both skirted.
    expect(terrain.meshes[0]?.getTotalVertices()).toBe(129 * 129 + 4 * 129)
    expect(terrain.meshes[2]?.getTotalVertices()).toBe(65 * 65 + 4 * 65)
  })

  it("rebuilds a changed chunk when flushed, once however many changes it had", () => {
    const { map, terrain } = setup(256, 256)
    map.heights[sampleIndex(map, 64, 64)] = 5

    // Two small changes in the middle of the first chunk, further from its neighbours than any of their vertices read.
    terrain.markChanged({ minX: 30, minZ: 30, maxX: 34, maxZ: 34 })
    terrain.markChanged({ minX: 31, minZ: 31, maxX: 33, maxZ: 33 })
    expect(highest(terrain.meshes[0])).toBe(0)
    expect(terrain.flush(FAR, FAR, 16)).toBe(1)
    expect(highest(terrain.meshes[0])).toBe(5)
    expect(terrain.flush(FAR, FAR, 16)).toBe(0)

    // A change on the corner where four chunks meet.
    terrain.markChanged({ minX: 63, minZ: 63, maxX: 65, maxZ: 65 })
    expect(terrain.flush(FAR, FAR, 16)).toBe(4)
  })

  it("rebuilds the chunks round each crater, not every chunk between craters landing together", () => {
    const { terrain } = setup(256, 256)

    terrain.markChanged({ minX: 30, minZ: 30, maxX: 34, maxZ: 34 })
    terrain.markChanged({ minX: 222, minZ: 222, maxX: 226, maxZ: 226 })

    // One box round both would take in all sixteen.
    expect(terrain.flush(FAR, FAR, 16)).toBe(2)
  })

  it("rebuilds the chunk beside a change as far away as its wetness reads the ground, and no further", () => {
    // Two chunks side by side, flat mud, meeting at x = 64 m.
    const { map, terrain } = setup(128, 64)
    // The vertex on the seam at z = 32 m, the second chunk's first in its 33rd row.
    const seamWetness = () => terrain.meshes[1]?.getVerticesData(WETNESS_ATTRIBUTE)?.[32 * 65] ?? 0

    // A mound 10 m west of the seam: the seam now lies below the ground round it, and holds a little water.
    map.heights[sampleIndex(map, 108, 64)] = 4
    terrain.markChanged({ minX: 54, minZ: 32, maxX: 54, maxZ: 32 })
    expect(terrain.flush(FAR, FAR, 16)).toBe(2)
    expect(seamWetness()).toBeGreaterThan(0)

    // 11 m west, it's out of every vertex's reach in the second chunk.
    terrain.markChanged({ minX: 53, minZ: 32, maxX: 53, maxZ: 32 })
    expect(terrain.flush(FAR, FAR, 16)).toBe(1)
  })

  it("builds due chunks nearest the point first, a budget a call, a changed chunk coming into detail once", () => {
    // 384 m x 64 m: six chunks in a row, their middles at x = 32, 96, ... 352.
    const { map, terrain } = setup(384, 64)
    const vertices = () => terrain.meshes.map((mesh) => mesh.getTotalVertices())
    const coarse = vertices()
    const raised = () => terrain.meshes.map((mesh) => highest(mesh) > 0)
    // Mounds in the middle of the first, third and last chunks.
    for (const x of [32, 160, 352]) {
      map.heights[sampleIndex(map, x * 2, 64)] = 1
      terrain.markChanged({ minX: x, minZ: 32, maxX: x, maxZ: 32 })
    }

    // Looking at the last chunk: it changed and comes into detail, both in one build.
    expect(terrain.flush(352, 32, 1)).toBe(1)
    expect(raised()).toEqual([false, false, false, false, false, true])
    expect(vertices()[5]).toBeGreaterThan(coarse[5] ?? 0)
    // Its neighbour, 64 m away, comes into detail; then the changed chunks further off, nearest first.
    expect(terrain.flush(352, 32, 1)).toBe(1)
    expect(vertices()[4]).toBeGreaterThan(coarse[4] ?? 0)
    expect(terrain.flush(352, 32, 1)).toBe(1)
    expect(raised()).toEqual([false, false, true, false, false, true])
    expect(terrain.flush(352, 32, 1)).toBe(1)
    expect(raised()).toEqual([true, false, true, false, false, true])
    expect(terrain.flush(352, 32, 1)).toBe(0)
  })

  it("rebuilds a chunk keeping its vertices in the buffers it has, its bounds following the ground", () => {
    const { map, terrain } = setup(64, 64)
    const [chunk] = terrain.meshes
    const positions = chunk?.getVertexBuffer(VertexBuffer.PositionKind)
    const indexBuffer = chunk?.geometry?.getIndexBuffer()
    const triangles = Array.from(chunk?.getIndices() ?? [])

    // A shell hole 3 m deep in the middle.
    map.heights[sampleIndex(map, 64, 64)] = -3
    terrain.markChanged({ minX: 32, minZ: 32, maxX: 32, maxZ: 32 })
    terrain.flush(FAR, FAR)

    expect(chunk?.getVertexBuffer(VertexBuffer.PositionKind)).toBe(positions)
    expect(chunk?.geometry?.getIndexBuffer()).toBe(indexBuffer)
    expect(chunk?.getBoundingInfo().minimum.y).toBeCloseTo(-3)
    // The quads round the hole split along their other diagonal now, and picking sees it.
    expect(Array.from(chunk?.getIndices() ?? [])).not.toEqual(triangles)
    // Coming into detail needs new buffers, four times the size.
    terrain.flush(32, 32)
    expect(chunk?.getVertexBuffer(VertexBuffer.PositionKind)).not.toBe(positions)
  })

  it("drops the vertex colours once the level's textures cover the ground, and builds none after", () => {
    const { map, terrain } = setup(128, 64)
    const coloured = () =>
      terrain.meshes.map((mesh) => mesh.useVertexColors || mesh.isVerticesDataPresent(VertexBuffer.ColorKind))
    expect(coloured()).toEqual([true, true])

    terrain.shapeForTrenchKit()
    expect(coloured()).toEqual([false, false])

    // Rebuilt in their buffers after a crater, or anew coming into detail: still none, and the crater shows.
    map.heights[sampleIndex(map, 64, 64)] = -3
    terrain.markChanged({ minX: 32, minZ: 32, maxX: 32, maxZ: 32 })
    expect(terrain.flush(FAR, FAR, 2)).toBe(1)
    expect(terrain.flush(32, 32, 2)).toBe(2)
    expect(coloured()).toEqual([false, false])
    expect(terrain.meshes[0]?.getBoundingInfo().minimum.y).toBeCloseTo(-3)
  })

  it("reshapes the ground around trenches for the trench kit on request", () => {
    const trench: Trench = {
      kind: "fire",
      points: [
        [10, 20],
        [50, 20]
      ],
      facing: "north"
    }
    const { terrain } = setup(64, 64, 2, [trench])
    // The ground itself: the first 129 x 129 vertices, before the skirts.
    const lowest = () =>
      Math.min(
        ...Array.from(terrain.meshes[0]?.getVerticesData("position") ?? [])
          .slice(0, 129 * 129 * 3)
          .filter((_, i) => i % 3 === 1)
      )
    const before = lowest()

    terrain.shapeForTrenchKit()

    expect(lowest()).toBeLessThan(before)
  })

  it("draws the chunks near a point at every sample, a few a call, and lets them go again further away", () => {
    // 384 m x 64 m: six chunks in a row, their middles at x = 32, 96, ... 352.
    const { terrain } = setup(384, 64)
    const vertices = () => terrain.meshes.map((mesh) => mesh.getTotalVertices())
    const coarse = vertices()

    expect(terrain.flush(32, 32, 1)).toBe(1)
    expect(vertices()[0]).toBeGreaterThan(coarse[0] ?? 0)
    // The second chunk, 64 m away, is within the 90 m detail radius; the third, 128 m away, isn't.
    expect(terrain.flush(32, 32)).toBe(1)
    expect(terrain.flush(32, 32)).toBe(0)
    expect(vertices().slice(2)).toEqual(coarse.slice(2))

    // Moving on a little keeps the first chunk detailed; moving well away lets it go.
    terrain.flush(130, 32, 10)
    expect(vertices()[0]).toBeGreaterThan(coarse[0] ?? 0)
    terrain.flush(300, 32, 10)
    expect(vertices().slice(0, 3)).toEqual(coarse.slice(0, 3))
  })

  it("keeps trench chunks drawn without the kit at every sample however far away", () => {
    const trench: Trench = {
      kind: "fire",
      points: [
        [10, 20],
        [50, 20]
      ],
      facing: "north"
    }
    const { terrain } = setup(256, 64, 2, [trench])
    const detailed = terrain.meshes[0]?.getTotalVertices()

    terrain.flush(250, 32, 10)

    expect(terrain.meshes[0]?.getTotalVertices()).toBe(detailed)
  })

  it("tells of each chunk it rebuilds, whatever the reason", () => {
    const { terrain } = setup(384, 64)
    const rebuilt: string[] = []
    terrain.onRebuilt.add((mesh) => rebuilt.push(mesh.name))

    // A crater in the first chunk, and the detail around the far end's middle: the chunk there and its neighbour.
    terrain.markChanged({ minX: 30, minZ: 30, maxX: 34, maxZ: 34 })
    terrain.flush(352, 32, 10)
    expect([...rebuilt].sort()).toEqual(["terrain-0-0", "terrain-4-0", "terrain-5-0"])
    terrain.shapeForTrenchKit()
    expect(rebuilt).toHaveLength(3 + terrain.meshes.length)
  })

  it("rejects render steps that don't divide a chunk", () => {
    expect(() => setup(64, 64, 3)).toThrow(RangeError)
  })

  it("disposes every chunk mesh", () => {
    const { terrain } = setup(128, 64)
    terrain.dispose()

    expect(terrain.meshes.every((mesh) => mesh.isDisposed())).toBe(true)
  })
})
