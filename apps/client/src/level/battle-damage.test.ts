import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it } from "vitest"
import { blastRadius, createBattleDamage } from "./battle-damage.ts"
import { placementMatrix } from "./dress-battlefield.ts"
import { batchScenery } from "./scenery-batches.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

const PIECES = [
  "Prop_Wire_Fence_01",
  "Gen_Env_Tree_Dead_01",
  "Env_Tree_Destroyed_01",
  "Env_Tree_Destroyed_02",
  "Env_Tree_Destroyed_03",
  "Env_Tree_Destroyed_04",
  "Env_Trench_Deep_Straight_01",
  "Env_Trench_Mound_01",
  "Prop_Trench_Planks_02",
  "Bld_City_Destroyed_01"
]

/** A field with one of each kind of piece near (10, 10), and a wire fence far away. */
function field() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const pieces = new Map<string, Mesh>(PIECES.map((piece) => [piece, CreateBox(piece, { size: 1 }, scene)]))
  const place = (piece: string, x: number, z: number) => ({
    piece,
    world: placementMatrix({ piece, x, y: 5, z, yaw: 0.5 })
  })
  const scenery = batchScenery(pieces, [
    place("Prop_Wire_Fence_01", 11, 10),
    place("Gen_Env_Tree_Dead_01", 9, 11),
    place("Env_Trench_Deep_Straight_01", 10, 9),
    place("Bld_City_Destroyed_01", 10, 12),
    place("Prop_Wire_Fence_01", 60, 60)
  ])
  return { scenery, damage: createBattleDamage(scenery) }
}

describe("createBattleDamage", () => {
  it("cuts wire, shoots trees down to stumps and blows earth into trenches within the blast", () => {
    const { scenery, damage } = field()

    expect(damage.blast(10, 10, 4)).toBe(3)
    const standing = scenery.near(10, 10, 4).map((placed) => placed.piece)
    expect(standing).not.toContain("Prop_Wire_Fence_01")
    expect(standing).not.toContain("Gen_Env_Tree_Dead_01")
    expect(standing.some((piece) => piece.startsWith("Env_Tree_Destroyed"))).toBe(true)
    // The trench section stands, with a heap of earth and a plank in it, on its floor 1.4 m below the piece.
    expect(standing).toContain("Env_Trench_Deep_Straight_01")
    const mound = scenery.near(10, 10, 4).find((placed) => placed.piece === "Env_Trench_Mound_01")
    expect(mound?.position.y).toBeCloseTo(5 - 1.4 - 0.1)
    expect(standing.filter((piece) => piece === "Prop_Trench_Planks_02")).toHaveLength(1)
    expect(standing).toContain("Bld_City_Destroyed_01")
    expect(scenery.near(60, 60, 1).map((placed) => placed.piece)).toEqual(["Prop_Wire_Fence_01"])
  })

  it("blows a trench section in only once, and leaves debris for later shells to wreck", () => {
    const { scenery, damage } = field()
    damage.blast(10, 10, 4)

    // The second shell finds the plank the first threw into the trench.
    expect(damage.blast(10, 10, 4)).toBe(1)
    const pieces = scenery.near(10, 10, 4).map((placed) => placed.piece)
    expect(pieces.filter((piece) => piece === "Env_Trench_Mound_01")).toHaveLength(1)
    expect(pieces).not.toContain("Prop_Trench_Planks_02")
  })

  it("leaves alone the pieces something else keeps in step with the battle", () => {
    const { scenery } = field()
    const damage = createBattleDamage(scenery, (piece) => piece.startsWith("Prop_Wire_Fence"))

    damage.blast(10, 10, 4)

    expect(scenery.near(10, 10, 4).map((placed) => placed.piece)).toContain("Prop_Wire_Fence_01")
  })

  it("does nothing where nothing stands", () => {
    expect(field().damage.blast(200, 200, 5)).toBe(0)
  })
})

describe("blastRadius", () => {
  it("reaches a little beyond the crater's bowl", () => {
    // A 3 m crater's lip reaches 4.5 m.
    expect(blastRadius({ minX: 5.5, maxX: 14.5, minZ: 5.5, maxZ: 14.5 })).toBeCloseTo(3.75)
  })
})
