import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import type { Scenery } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { placementMatrix } from "./dress-battlefield.ts"
import { createFenceArt } from "./fence-art.ts"
import type { Placement } from "./placement.ts"
import { batchScenery } from "./scenery-batches.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

describe("the fences' art", () => {
  it("draws each fence until the simulation has it flattened, and only that one", () => {
    const engine = new NullEngine()
    engines.push(engine)
    const scene = new Scene(engine)
    const pieces = new Map<string, Mesh>(
      ["Prop_Barricade_01", "Prop_Barricade_03"].map((piece) => [piece, CreateBox(piece, { size: 1 }, scene)])
    )
    // A tree, then two fences: the map's scenery, by index.
    const items: Scenery[] = [
      { kind: "tree", x: 0, z: 0, heading: 0, variant: 0, scale: 1 },
      { kind: "knife-rest", x: 10, z: 20, heading: 0, variant: 0, scale: 1 },
      { kind: "knife-rest", x: 13, z: 20, heading: 0, variant: 2, scale: 1 }
    ]
    const placements: Placement[] = [
      { piece: "Prop_Barricade_03", x: 10, y: 0.15, z: 20, yaw: 0 },
      { piece: "Prop_Barricade_01", x: 13, y: 0.15, z: 20, yaw: 0 }
    ]
    const scenery = batchScenery(
      pieces,
      placements.map((placement) => ({ piece: placement.piece, world: placementMatrix(placement) }))
    )
    const art = createFenceArt(scenery, items)
    const drawn = (piece: string) => {
      const batch = scenery.batches.find((each) => each.piece === piece)
      return (batch?.mesh.thinInstanceGetWorldMatrices() ?? []).some((matrix) => matrix.m[0] !== 0)
    }
    expect(art.fences).toBe(2)

    art.sync([])
    expect(drawn("Prop_Barricade_03")).toBe(true)
    expect(drawn("Prop_Barricade_01")).toBe(true)
    art.sync([2])
    expect(drawn("Prop_Barricade_03")).toBe(true)
    expect(drawn("Prop_Barricade_01")).toBe(false)
    art.sync([2, 1])
    expect(drawn("Prop_Barricade_03")).toBe(false)
  })
})
