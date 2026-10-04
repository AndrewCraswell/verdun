import { Animation } from "@babylonjs/core/Animations/animation"
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup"
import { AssetContainer } from "@babylonjs/core/assetContainer"
import { Bone } from "@babylonjs/core/Bones/bone"
import { Skeleton } from "@babylonjs/core/Bones/skeleton"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import { Scene } from "@babylonjs/core/scene"
import { Side } from "@verdun/sim"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BAKE_FPS, bakeClips, loadSoldierKit, prepareSoldierKit } from "./soldier-kit.ts"

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

/** A clip moving the hips up a metre and aside half a metre over a second, or turning them, as glTF clips do. */
function clip(
  target: Scene,
  name: string,
  node: TransformNode,
  property: "position" | "rotationQuaternion"
): AnimationGroup {
  const group = new AnimationGroup(name, target)
  const type = property === "position" ? Animation.ANIMATIONTYPE_VECTOR3 : Animation.ANIMATIONTYPE_QUATERNION
  const animation = new Animation(`${name}-${property}`, property, 60, type)
  animation.setKeys(
    property === "position"
      ? [
          { frame: 0, value: Vector3.Zero() },
          { frame: 60, value: new Vector3(0.5, 1, 0) }
        ]
      : [
          { frame: 0, value: Quaternion.Identity() },
          { frame: 60, value: Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2) }
        ]
  )
  group.addTargetedAnimation(animation, node)
  group.normalize(0, 60)
  return group
}

/** What the glTF loader hands back for soldier.glb, in miniature: a mirrored root, a scaled armature, one bone. */
function loadedContainer(target: Scene, { skip }: { skip?: string } = {}): AssetContainer {
  const container = new AssetContainer(target)
  const root = new Mesh("__root__", target)
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI)
  root.scaling.set(1, 1, -1)
  const armature = new TransformNode("Armature", target)
  armature.parent = root
  armature.scaling.setAll(2)
  const hipsNode = new TransformNode("Hips", target)
  hipsNode.parent = armature
  const skeleton = new Skeleton("skeleton", "skeleton0", target)
  const hips = new Bone("Hips", skeleton, null, Matrix.Identity())
  hips.linkTransformNode(hipsNode)
  const palette = new PBRMaterial("Soldier_French", target)
  palette.albedoTexture = new Texture(null, target)
  const plain = new PBRMaterial("PolygonWarMap_01_A", target)
  const names = ["Soldier_French", "Soldier_German", "Soldier_Rifle", "Soldier_Mask"].filter((name) => name !== skip)
  for (const name of names) {
    const mesh = CreateBox(name, { size: 0.5 }, target)
    mesh.parent = armature
    mesh.skeleton = skeleton
    mesh.material = name === "Soldier_French" ? palette : plain
    container.meshes.push(mesh)
  }
  for (const name of ["MachineGun_French", "MachineGun_German"]) {
    const gun = CreateBox(name, { width: 0.2, height: 0.4, depth: 1 }, target)
    gun.position.z = 1
    gun.parent = root
    gun.material = plain
    container.meshes.push(gun)
  }
  container.meshes.push(root)
  container.transformNodes.push(armature, hipsNode)
  container.materials.push(palette, plain)
  container.skeletons.push(skeleton)
  container.animationGroups.push(
    clip(target, "idle", hipsNode, "position"),
    clip(target, "walk_forward", hipsNode, "rotationQuaternion"),
    clip(target, "bazooka_fire", hipsNode, "position")
  )
  return container
}

describe("bakeClips", () => {
  it("bakes the crowd's clips frame by frame into rows of bone matrices, carried into the meshes' space", () => {
    const target = scene()
    const container = loadedContainer(target)
    const skeleton = container.skeletons[0]
    if (!skeleton) {
      throw new Error("no skeleton")
    }
    const world = Matrix.Scaling(2, 2, -2)
    const { data, drift, clips } = bakeClips(skeleton, container.animationGroups, world)

    // One second at 24 frames a second, both ends included; the bazooka isn't among the crowd's clips.
    expect(clips.get("idle")).toEqual({ start: 0, frames: BAKE_FPS + 1, fps: BAKE_FPS })
    expect(clips.get("walk_forward")).toEqual({ start: BAKE_FPS + 1, frames: BAKE_FPS + 1, fps: BAKE_FPS })
    expect(clips.size).toBe(2)
    // Two matrices a frame: the bone's, and the identity Babylon appends.
    const floatsPerFrame = 2 * 16
    expect(data).toHaveLength(floatsPerFrame * 2 * (BAKE_FPS + 1))
    // Halfway through idle the hips are half a metre up, doubled by the armature's scale.
    const halfway = Matrix.FromArray(data, 12 * floatsPerFrame)
    expect(halfway.getTranslation().y).toBeCloseTo(1, 4)
    // The hips drift a quarter metre aside by then, doubled too: that much root motion to take back out.
    expect(drift[12 * 2]).toBeCloseTo(0.5, 4)
    expect(drift[12 * 2 + 1]).toBeCloseTo(0, 4)
    expect(drift[0]).toBe(0)
    // The appended identity picks up the world transform: the mirror reaches every matrix.
    expect(Matrix.FromArray(data, 16).determinant()).toBeLessThan(0)
  })
})

describe("prepareSoldierKit", () => {
  it("stands the meshes at the origin on the shared animation, with matte materials", () => {
    const target = scene()
    const kit = prepareSoldierKit(target, loadedContainer(target))
    const body = kit.bodies[Side.French]

    expect(body.parent).toBeNull()
    expect(body.computeWorldMatrix(true).isIdentity()).toBe(true)
    expect(body.bakedVertexAnimationManager?.texture?.name).toBe("soldier-animation")
    expect(kit.rifle.bakedVertexAnimationManager).toBe(body.bakedVertexAnimationManager)
    expect(body.material).toBeInstanceOf(StandardMaterial)
    expect(body.material?.name).toBe("Soldier_French")
    expect(kit.mask.material).toBe(kit.rifle.material)
    expect(kit.materials.every((material) => material instanceof StandardMaterial)).toBe(true)
    expect([...kit.clips.keys()]).toEqual(["idle", "walk_forward"])
    expect(target.animationGroups).toHaveLength(0)
  })

  it("bakes the guns' place into their vertices", () => {
    const target = scene()
    const gun = prepareSoldierKit(target, loadedContainer(target)).guns[Side.German]

    expect(gun.parent).toBeNull()
    gun.refreshBoundingInfo()
    // A metre out along z: the root's mirror and half turn cancel along z.
    expect(gun.getBoundingInfo().boundingBox.center.z).toBeCloseTo(1)
  })

  it("refuses a kit missing a mesh, its skeleton or an idle", () => {
    const target = scene()
    expect(() => prepareSoldierKit(target, loadedContainer(target, { skip: "Soldier_Mask" }))).toThrow(/Soldier_Mask/)

    const boneless = loadedContainer(target)
    boneless.skeletons.length = 0
    expect(() => prepareSoldierKit(target, boneless)).toThrow(/skeleton/)

    const restless = loadedContainer(target)
    restless.animationGroups.splice(0, 1)
    expect(() => prepareSoldierKit(target, restless)).toThrow(/idle/)
  })
})

describe("loadSoldierKit", () => {
  it("resolves null, leaving the capsules, when the kit can't be loaded", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const close = vi.fn<() => void>()
    const files = { read: () => Promise.reject(new Error("no soldier")), close }

    await expect(loadSoldierKit(scene(), files)).resolves.toBeNull()
    // The caller gave the files, so closing them is left to it.
    expect(close).not.toHaveBeenCalled()
    await expect(loadSoldierKit(scene(), null)).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("capsules"), expect.anything())
  })
})
