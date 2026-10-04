import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, sampleIndex, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { surfaceColors } from "../palette.ts"
import { CHUNK_SIZE_METERS, createTerrainChunks } from "./terrain-chunks.ts"

const engines: NullEngine[] = []

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

  it("rebuilds only the chunks a change touches", () => {
    const { map, terrain } = setup(256, 256)
    const index = sampleIndex(map, 64, 64)
    map.heights[index] = 5

    // A small change in the middle of the first chunk.
    expect(terrain.rebuildRegion(30, 30, 34, 34)).toBe(1)
    // A change on the corner where four chunks meet.
    expect(terrain.rebuildRegion(63, 63, 65, 65)).toBe(4)
    const rebuilt = terrain.meshes[0]?.getVerticesData("position") ?? []
    expect(Math.max(...Array.from(rebuilt).filter((_, i) => i % 3 === 1))).toBe(5)
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

    expect(terrain.refine(32, 32, 1)).toBe(1)
    expect(vertices()[0]).toBeGreaterThan(coarse[0] ?? 0)
    // The second chunk, 64 m away, is within the 90 m detail radius; the third, 128 m away, isn't.
    expect(terrain.refine(32, 32)).toBe(1)
    expect(terrain.refine(32, 32)).toBe(0)
    expect(vertices().slice(2)).toEqual(coarse.slice(2))

    // Moving on a little keeps the first chunk detailed; moving well away lets it go.
    terrain.refine(130, 32, 10)
    expect(vertices()[0]).toBeGreaterThan(coarse[0] ?? 0)
    terrain.refine(300, 32, 10)
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

    terrain.refine(250, 32, 10)

    expect(terrain.meshes[0]?.getTotalVertices()).toBe(detailed)
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
