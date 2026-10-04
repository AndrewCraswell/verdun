import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import type { WireField } from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
import { placementMatrix } from "./dress-battlefield.ts"
import type { Placement } from "./placement.ts"
import { batchScenery } from "./scenery-batches.ts"
import { createWireArt } from "./wire-art.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

/** A belt along z = 20 from x = 0 to 30: three fence pieces end to end, a tangle in front of the middle one. */
function belt() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const pieces = new Map<string, Mesh>(
    ["Prop_Wire_Fence_01", "Prop_Wire_Fence_Tangled_01"].map((piece) => [piece, CreateBox(piece, { size: 1 }, scene)])
  )
  // Fences run along their x axis: a yaw of zero lays them east to west.
  const placements: Placement[] = [
    ...[5, 15, 25].map((x) => ({ piece: "Prop_Wire_Fence_01", x, y: 0, z: 20, yaw: 0, scale: [0.994, 1, 1] as const })),
    { piece: "Prop_Wire_Fence_Tangled_01", x: 15, y: 0, z: 22, yaw: 0 }
  ]
  const scenery = batchScenery(
    pieces,
    placements.map((placement) => ({ piece: placement.piece, world: placementMatrix(placement) }))
  )
  // The simulation's wire: every metre of the belt intact, 1 m cells over a 40 m square.
  const field: WireField = {
    columns: 40,
    rows: 40,
    density: new Float32Array(1600),
    staked: new Float32Array(1600),
    cuts: 0
  }
  for (let column = 0; column < 30; column++) {
    for (const row of [18, 19, 20, 21, 22]) {
      field.density[row * 40 + column] = 1
      field.staked[row * 40 + column] = 1
    }
  }
  const art = createWireArt(scenery, placements)
  const drawn = (x: number, z: number) =>
    scenery.near(x, z, 0.01).every((placed) => {
      const batch = scenery.batches.find((each) => each.piece === placed.piece)
      const matrices = batch?.mesh.thinInstanceGetWorldMatrices() ?? []
      return matrices.some((matrix) => matrix.getTranslation().x === x && matrix.m[0] !== 0)
    })
  return { field, art, drawn }
}

/** Cuts the belt through between two x positions, as a shell does. */
function cut(field: WireField, from: number, to: number): void {
  for (let column = from; column < to; column++) {
    for (let row = 0; row < 40; row++) {
      field.density[row * 40 + column] = 0
    }
  }
  field.cuts++
}

describe("createWireArt", () => {
  it("follows every fence piece and tangle on the belt", () => {
    expect(belt().art.strands).toBe(4)
  })

  it("tears away a fence piece cut through along most of its length, and the tangle with it", () => {
    const { field, art, drawn } = belt()

    // A shell cuts 12 m out of the middle: the middle piece and its tangle go; the ends, barely touched, stay.
    cut(field, 9, 21)
    art.sync(field)

    expect(drawn(15, 20)).toBe(false)
    expect(drawn(15, 22)).toBe(false)
    expect(drawn(5, 20)).toBe(true)
    expect(drawn(25, 20)).toBe(true)
  })

  it("stakes the wire again where a wiring party mended it", () => {
    const { field, art, drawn } = belt()
    cut(field, 10, 20)
    art.sync(field)

    field.density.set(field.staked)
    field.cuts++
    art.sync(field)

    expect(drawn(15, 20)).toBe(true)
  })
})
