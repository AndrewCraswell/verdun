import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, sampleIndex } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { surfaceColors } from "../palette.ts"
import { CHUNK_SIZE_METERS, createTerrainChunks } from "./terrain-chunks.ts"

const engines: NullEngine[] = []

function setup(widthMeters: number, depthMeters: number, renderStep?: number) {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const map = createFlatMap({ name: "test", cellSize: 0.5, columns: widthMeters * 2, rows: depthMeters * 2 })
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
    // A full chunk at 1 m vertices is 65 x 65; the last column of chunks is 600 - 576 = 24 m wide.
    expect(terrain.meshes[0]?.getTotalVertices()).toBe(65 * 65)
    expect(terrain.meshes[9]?.getTotalVertices()).toBe(25 * 65)
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

  it("rejects render steps that don't divide a chunk", () => {
    expect(() => setup(64, 64, 3)).toThrow(RangeError)
  })

  it("disposes every chunk mesh", () => {
    const { terrain } = setup(128, 64)
    terrain.dispose()

    expect(terrain.meshes.every((mesh) => mesh.isDisposed())).toBe(true)
  })
})
