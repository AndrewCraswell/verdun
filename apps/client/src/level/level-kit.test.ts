import { AssetContainer } from "@babylonjs/core/assetContainer"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it, vi } from "vitest"
import { loadLevelKit, prepareKitPieces } from "./level-kit.ts"

const engines: NullEngine[] = []

afterEach(() => {
  vi.restoreAllMocks()
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function scene(): Scene {
  const engine = new NullEngine()
  engines.push(engine)
  return new Scene(engine)
}

/** What the glTF loader hands back: a mirrored root node, one mesh per primitive, PBR materials. */
function loadedContainer(target: Scene): AssetContainer {
  const container = new AssetContainer(target)
  const root = new Mesh("__root__", target)
  root.scaling.set(1, 1, -1)
  const palette = new PBRMaterial("PolygonWarMap_01_A", target)
  palette.albedoTexture = new Texture(null, target)
  const water = new PBRMaterial("Crater_Water_01", target)
  const straight = CreateBox("Straight", { width: 2, height: 1, depth: 3 }, target)
  straight.position.z = 1
  const ruinWalls = CreateBox("Ruin_primitive0", { size: 1 }, target)
  const ruinRoof = CreateBox("Ruin_primitive1", { size: 1 }, target)
  const pool = CreateBox("Water", { size: 1 }, target)
  const far = CreateBox("Straight_LOD1", { size: 1 }, target)
  const node = new TransformNode("node", target)
  for (const mesh of [straight, ruinWalls, ruinRoof, pool, far]) {
    mesh.parent = root
  }
  straight.material = palette
  far.material = palette
  ruinWalls.material = palette
  ruinRoof.material = water
  pool.material = water
  container.meshes.push(root, straight, ruinWalls, ruinRoof, pool, far)
  container.materials.push(palette, water)
  container.transformNodes.push(node)
  return container
}

describe("prepareKitPieces", () => {
  it("makes one disabled source mesh per piece, with matte materials and its transform baked in", () => {
    const target = scene()
    const { pieces, materials } = prepareKitPieces(target, loadedContainer(target))
    const straight = pieces.get("Straight")

    expect([...pieces.keys()].sort()).toEqual(["Ruin", "Straight", "Water"])
    expect(materials.every((material) => material instanceof StandardMaterial)).toBe(true)
    expect(straight?.isEnabled()).toBe(false)
    expect(straight?.parent).toBeNull()
    // The root's mirror and the node's offset are now in the vertices.
    straight?.refreshBoundingInfo()
    const { minimum, maximum } = straight?.getBoundingInfo().boundingBox ?? { minimum: null, maximum: null }
    expect(minimum?.z).toBeCloseTo(-2.5)
    expect(maximum?.z).toBeCloseTo(0.5)
    expect(target.getMeshByName("__root__")).toBeNull()
    expect(target.getTransformNodeByName("node")).toBeNull()
  })

  it("draws a piece's decimated far copy as its distant level of detail", () => {
    const target = scene()
    const straight = prepareKitPieces(target, loadedContainer(target)).pieces.get("Straight")

    expect(straight?.getLODLevels()).toHaveLength(1)
    expect(straight?.getLODLevels()[0]?.mesh?.name).toBe("Straight_LOD1")
  })

  it("merges a piece's primitives back together and keeps each one's material", () => {
    const target = scene()
    const ruin = prepareKitPieces(target, loadedContainer(target)).pieces.get("Ruin")

    expect(ruin?.subMeshes).toHaveLength(2)
    expect(ruin?.material?.getClassName()).toBe("MultiMaterial")
  })

  it("muddies the water in shell holes", () => {
    const target = scene()
    const water = prepareKitPieces(target, loadedContainer(target)).pieces.get("Water")?.material

    expect(water).toBeInstanceOf(StandardMaterial)
    expect(water?.alpha).toBeCloseTo(0.9)
    expect(water instanceof StandardMaterial && water.diffuseColor.r).toBeLessThan(0.3)
  })
})

describe("loadLevelKit", () => {
  it("resolves null, leaving the greybox, when the kit can't be loaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)

    const close = vi.fn<() => void>()
    const files = { read: () => Promise.reject(new Error("no kit")), close }

    await expect(loadLevelKit(scene(), files)).resolves.toBeNull()
    // The caller gave the files, so closing them is left to it.
    expect(close).not.toHaveBeenCalled()
    await expect(loadLevelKit(scene(), null)).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("greybox"), expect.anything())
  })
})
