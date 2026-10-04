import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it } from "vitest"
import { blastRadius, createBattleDamage } from "./battle-damage.ts"
import { placementMatrix } from "./dress-battlefield.ts"

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
  const place = (piece: string, x: number, z: number): InstancedMesh => {
    const instance = pieces.get(piece)?.createInstance(piece)
    if (!instance) {
      throw new Error(piece)
    }
    instance.freezeWorldMatrix(placementMatrix({ piece, x, y: 5, z, yaw: 0.5 }))
    return instance
  }
  const instances = {
    wire: place("Prop_Wire_Fence_01", 11, 10),
    tree: place("Gen_Env_Tree_Dead_01", 9, 11),
    trench: place("Env_Trench_Deep_Straight_01", 10, 9),
    ruin: place("Bld_City_Destroyed_01", 10, 12),
    farWire: place("Prop_Wire_Fence_01", 60, 60)
  }
  return { scene, damage: createBattleDamage(pieces, Object.values(instances)), instances }
}

const named = (scene: Scene, prefix: string) => scene.meshes.filter((mesh) => mesh.name.startsWith(prefix))

describe("createBattleDamage", () => {
  it("cuts wire, shoots trees down to stumps and blows earth into trenches within the blast", () => {
    const { scene, damage, instances } = field()

    expect(damage.blast(10, 10, 4)).toBe(3)
    expect(instances.wire.isDisposed()).toBe(true)
    expect(instances.tree.isDisposed()).toBe(true)
    expect(named(scene, "Env_Tree_Destroyed").some((mesh) => mesh.name.endsWith("#damage"))).toBe(true)
    // The trench section stands, with a heap of earth and a plank in it, on its floor 1.4 m below the piece.
    expect(instances.trench.isDisposed()).toBe(false)
    const [mound] = named(scene, "Env_Trench_Mound_01#damage")
    expect(mound?.getWorldMatrix().getTranslation().y).toBeCloseTo(5 - 1.4 - 0.1)
    expect(named(scene, "Prop_Trench_Planks_02#damage")).toHaveLength(1)
    expect(instances.ruin.isDisposed()).toBe(false)
    expect(instances.farWire.isDisposed()).toBe(false)
  })

  it("blows a trench section in only once, and leaves debris for later shells to wreck", () => {
    const { scene, damage } = field()
    damage.blast(10, 10, 4)

    // The second shell finds the plank the first threw into the trench.
    expect(damage.blast(10, 10, 4)).toBe(1)
    expect(named(scene, "Env_Trench_Mound_01#damage")).toHaveLength(1)
    expect(named(scene, "Prop_Trench_Planks_02#damage").filter((mesh) => !mesh.isDisposed())).toHaveLength(0)
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
