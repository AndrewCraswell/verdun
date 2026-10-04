import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { SubMesh } from "@babylonjs/core/Meshes/subMesh"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { batchScenery } from "./scenery-batches.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

/** Kit pieces: a crate, a tree with a far copy beyond 110 m, and a two-material ruin. All disabled, as the kit is. */
function kit() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const crate = CreateBox("crate", { size: 1 }, scene)
  const tree = CreateBox("tree", { size: 1 }, scene)
  const treeFar = CreateBox("tree_LOD1", { size: 1 }, scene)
  tree.addLODLevel(110, treeFar)
  const ruin = CreateBox("ruin", { size: 2 }, scene)
  const walls = new MultiMaterial("walls", scene)
  walls.subMaterials.push(new StandardMaterial("brick", scene), new StandardMaterial("plaster", scene))
  ruin.material = walls
  ruin.subMeshes = []
  SubMesh.AddToMesh(0, 0, ruin.getTotalVertices(), 0, 18, ruin)
  SubMesh.AddToMesh(1, 0, ruin.getTotalVertices(), 18, 18, ruin)
  const pieces = new Map<string, Mesh>([crate, tree, treeFar, ruin].map((mesh) => [mesh.name, mesh]))
  for (const mesh of pieces.values()) {
    mesh.setEnabled(false)
  }
  return { scene, pieces }
}

const at = (x: number, z: number, y = 0) => Matrix.Translation(x, y, z)

describe("batchScenery", () => {
  it("draws a piece placed often as thin instances, one batch per 128 m cell, and a rare one in one batch", () => {
    const { scene, pieces } = kit()
    // Sixty crates either side of x = 128, and two ruins far apart.
    const crates = Array.from({ length: 60 }, (_, index) => ({
      piece: "crate",
      world: at(index < 30 ? 10 + index : 140 + index, 20)
    }))
    const ruins = [
      { piece: "ruin", world: at(5, 5) },
      { piece: "ruin", world: at(500, 300) }
    ]
    const scenery = batchScenery(pieces, [...crates, ...ruins, { piece: "missing", world: at(1, 1) }])

    const crateBatches = scenery.batches.filter((batch) => batch.piece === "crate")
    expect(crateBatches.map((batch) => batch.mesh.thinInstanceCount)).toEqual([30, 30])
    // Each batch draws its own instances over the piece's own vertices and indices, which aren't copied.
    const [west, east] = crateBatches
    const crate = pieces.get("crate")
    expect(west?.mesh.getVertexBuffer("world0")).not.toBe(east?.mesh.getVertexBuffer("world0"))
    expect(crate?.getVertexBuffer("world0")).toBeFalsy()
    expect(west?.mesh.getVertexBuffer("position")?.getWrapperBuffer()).toBe(
      crate?.getVertexBuffer("position")?.getWrapperBuffer()
    )
    expect(west?.mesh.geometry?.getIndexBuffer()).toBe(crate?.geometry?.getIndexBuffer())
    const ruinBatches = scenery.batches.filter((batch) => batch.piece === "ruin")
    expect(ruinBatches).toHaveLength(1)
    const [ruinBatch] = ruinBatches
    expect(ruinBatch?.mesh.thinInstanceCount).toBe(2)
    // The ruin's two materials carry over, on the source's own geometry.
    expect(ruinBatch?.mesh.subMeshes).toHaveLength(2)
    expect(ruinBatch?.mesh.material).toBe(pieces.get("ruin")?.material)
    // Its bounds take in both ruins, a box 2 m across round each.
    const { minimumWorld, maximumWorld } = ruinBatch?.mesh.getBoundingInfo().boundingBox ?? {}
    expect(minimumWorld?.x).toBeCloseTo(4)
    expect(maximumWorld?.z).toBeCloseTo(301)
    expect(scene.meshes.filter((mesh) => mesh.name.startsWith("missing"))).toHaveLength(0)
  })

  it("draws the far copy beyond the kit's distance and nothing beyond the draw distance, from the nearest point", () => {
    const { pieces } = kit()
    const scenery = batchScenery(
      pieces,
      [
        { piece: "tree", world: at(0, 0) },
        { piece: "tree", world: at(40, 0) },
        { piece: "crate", world: at(0, 0) }
      ],
      { drawDistances: { crate: 60 } }
    )
    const tree = scenery.batches.find((batch) => batch.piece === "tree")
    const crate = scenery.batches.find((batch) => batch.piece === "crate")

    // 100 m from the nearer tree, though further from the batch's middle: full detail.
    scenery.update(new Vector3(-100, 0, 0))
    expect(tree?.mesh.isEnabled()).toBe(true)
    expect(tree?.far?.isEnabled()).toBe(false)
    expect(tree?.far?.thinInstanceCount).toBe(2)
    expect(crate?.mesh.isEnabled()).toBe(false)

    scenery.update(new Vector3(-150, 0, 0))
    expect(tree?.mesh.isEnabled()).toBe(false)
    expect(tree?.far?.isEnabled()).toBe(true)

    scenery.update(new Vector3(-50, 0, 0))
    expect(tree?.mesh.isEnabled()).toBe(true)
    expect(crate?.mesh.isEnabled()).toBe(true)
  })

  it("switches back only well inside the distance it switched at, so a shaking camera doesn't flick it", () => {
    const { pieces } = kit()
    const scenery = batchScenery(pieces, [{ piece: "tree", world: at(0, 0) }])
    const [tree] = scenery.batches

    // Out past 110 m from the tree's nearest side, 0.5 m from its middle: the far copy.
    scenery.update(new Vector3(-111, 0, 0))
    expect(tree?.far?.isEnabled()).toBe(true)
    // A metre nearer, still the far copy; it takes 8.8 m (8% of 110) to come back.
    scenery.update(new Vector3(-110, 0, 0))
    expect(tree?.far?.isEnabled()).toBe(true)
    scenery.update(new Vector3(-100, 0, 0))
    expect(tree?.mesh.isEnabled()).toBe(true)
  })

  it("finds pieces near a point, stops drawing one taken away and batches one added with its kind", () => {
    const { pieces } = kit()
    const scenery = batchScenery(pieces, [
      { piece: "crate", world: at(10, 10, 3) },
      { piece: "crate", world: at(12, 10, 3) },
      { piece: "crate", world: at(40, 40, 3) }
    ])
    const [batch] = scenery.batches

    const near = scenery.near(10, 10, 3)
    expect(near.map((placed) => placed.position.x).toSorted()).toEqual([10, 12])
    const [first] = near
    if (!first) {
      throw new Error("expected a crate")
    }
    scenery.remove(first)
    // Scaled to nothing where it stood.
    const matrices = batch?.mesh.thinInstanceGetWorldMatrices() ?? []
    const gone = matrices.find((matrix) => matrix.getTranslation().x === first.position.x)
    expect(gone?.m[0]).toBe(0)
    expect(gone?.getTranslation().y).toBeCloseTo(3)
    expect(scenery.near(10, 10, 3)).toHaveLength(1)
    scenery.remove({ piece: "crate", world: Matrix.Identity(), position: Vector3.Zero() })

    const added = scenery.add("crate", at(20, 20))
    expect(added?.position.x).toBe(20)
    // Not debris: the batch is made again with room for it.
    expect(batch?.mesh.thinInstanceCount).toBe(4)
    expect(scenery.near(20, 20, 1)).toHaveLength(1)
    // A piece nothing else in its cell shares gets a batch of its own; one the kit lacks, none.
    const tree = scenery.add("tree", at(300, 300))
    expect(tree).not.toBeNull()
    expect(scenery.near(300, 300, 1)[0]?.piece).toBe("tree")
    expect(scenery.add("missing", at(0, 0))).toBeNull()
  })

  it("keeps spare slots in batches of debris, so pieces thrown down go in without remaking the buffers", () => {
    const { pieces } = kit()
    const scenery = batchScenery(pieces, [{ piece: "crate", world: at(10, 10) }], { debris: new Set(["crate"]) })
    const [batch] = scenery.batches
    const mesh = batch?.mesh
    if (!mesh) {
      throw new Error("expected a batch")
    }
    const set = vi.spyOn(mesh, "thinInstanceSetBuffer")

    // One piece and eight empty slots, scaled to nothing where the piece stands so the bounds don't stretch.
    expect(mesh.thinInstanceCount).toBe(9)
    expect(mesh.getBoundingInfo().boundingBox.minimumWorld.x).toBeCloseTo(9.5)
    for (let index = 0; index < 8; index++) {
      scenery.add("crate", at(12 + index, 10))
    }
    expect(set).not.toHaveBeenCalled()
    expect(mesh.thinInstanceCount).toBe(9)
    expect(scenery.near(16, 10, 0.5)).toHaveLength(1)
    // The ninth needs room: the batch is made again, with a fresh eight spare.
    scenery.add("crate", at(30, 10))
    expect(set).toHaveBeenCalled()
    expect(mesh.thinInstanceCount).toBe(18)
    expect(mesh.getBoundingInfo().boundingBox.maximumWorld.x).toBeCloseTo(30.5)
  })

  it("hides a placed piece where it stands and draws it again", () => {
    const { pieces } = kit()
    const scenery = batchScenery(pieces, [{ piece: "crate", world: at(10, 10, 2) }])
    const [crate] = scenery.near(10, 10, 1)
    const [batch] = scenery.batches
    if (!crate) {
      throw new Error("expected a crate")
    }

    scenery.show(crate, false)
    expect(batch?.mesh.thinInstanceGetWorldMatrices()[0]?.m[0]).toBe(0)
    expect(batch?.mesh.thinInstanceGetWorldMatrices()[0]?.getTranslation().y).toBeCloseTo(2)
    // Still there to find, to draw again.
    expect(scenery.near(10, 10, 1)).toHaveLength(1)
    scenery.show(crate, true)
    expect(batch?.mesh.thinInstanceGetWorldMatrices()[0]?.m[0]).toBe(1)
    scenery.show({ piece: "crate", world: Matrix.Identity(), position: Vector3.Zero() }, false)
  })

  it("grows a batch's bounds for a piece added outside them", () => {
    const { pieces } = kit()
    const scenery = batchScenery(pieces, [{ piece: "tree", world: at(0, 0) }])
    scenery.add("tree", at(100, 0))
    const [tree] = scenery.batches

    scenery.update(new Vector3(200, 0, 0))
    expect(tree?.mesh.isEnabled()).toBe(true)
    expect(tree?.far?.thinInstanceCount).toBe(2)
  })

  it("disposes its batches, leaving the kit's pieces and their geometry", () => {
    const { scene, pieces } = kit()
    const scenery = batchScenery(pieces, [{ piece: "tree", world: at(0, 0) }])

    scenery.dispose()

    expect(scene.meshes.filter((mesh) => mesh.name.startsWith("tree@"))).toHaveLength(0)
    const tree = pieces.get("tree")
    expect(tree?.geometry?.getTotalVertices()).toBeGreaterThan(0)
    expect(tree?.getVertexBuffer("position")?.getWrapperBuffer().isDisposed).toBe(false)
    expect(tree?.geometry?.getIndexBuffer()?.references).toBeGreaterThan(0)
    expect(scenery.near(0, 0, 5)).toHaveLength(0)
  })
})
