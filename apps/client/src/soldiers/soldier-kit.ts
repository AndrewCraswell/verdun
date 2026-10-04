import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup"
import type { AssetContainer } from "@babylonjs/core/assetContainer"
import { BakedVertexAnimationManager } from "@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager"
import { VertexAnimationBaker } from "@babylonjs/core/BakedVertexAnimation/vertexAnimationBaker"
import type { Skeleton } from "@babylonjs/core/Bones/skeleton"
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader"
import type { Material } from "@babylonjs/core/Materials/material"
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import type { Scene } from "@babylonjs/core/scene"
import { Side } from "@verdun/sim"
import { type KitFiles, openKitFiles } from "../level/kit-files.ts"
import { type BakedClip, CLIPS, type ClipName } from "./soldier-animation.ts"

/** The soldier models and their baked animation, as scripts/build-level-kit.py builds them into soldier.glb. */
export interface SoldierKit {
  /** Each side's body with its helmet, animated from the baked texture. */
  readonly bodies: Readonly<Record<Side, Mesh>>
  /** A rifle, skinned to the right hand. */
  readonly rifle: Mesh
  /** A gas mask, skinned to the head. */
  readonly mask: Mesh
  /** Each side's machine gun on its tripod, standing in front of a gunner's feet. Not animated. */
  readonly guns: Readonly<Record<Side, Mesh>>
  /**
   * Per baked row, how far the hips have moved across the ground since the clip began (x then z, in metres, facing +z):
   * deaths carry a body a metre or more, which can put it into a trench wall unless taken back out.
   */
  readonly drift: Float32Array
  /** Where each clip lies in the baked animation texture. Clips the kit lacks are missing. */
  readonly clips: ReadonlyMap<ClipName, BakedClip>
  readonly materials: readonly Material[]
}

/** Frames per second the clips are baked at: the rate they were made at. */
export const BAKE_FPS = 24

/** The bone whose travel across the ground is a clip's root motion. */
const HIPS = "Hips"
const BODIES = { [Side.French]: "Soldier_French", [Side.German]: "Soldier_German" } as const
const GUNS = { [Side.French]: "MachineGun_French", [Side.German]: "MachineGun_German" } as const

function isPbrMaterial(material: Material): material is PBRMaterial {
  return material.getClassName() === "PBRMaterial"
}

/** Matte flat colour from the palette, lit like the level kit. */
function toMatte(scene: Scene, source: Material): Material {
  if (!isPbrMaterial(source)) {
    return source
  }
  const material = new StandardMaterial(source.name, scene)
  material.diffuseTexture = source.albedoTexture
  material.diffuseColor = source.albedoTexture ? Color3.White() : source.albedoColor
  material.specularColor = Color3.Black()
  source.albedoTexture = null
  source.dispose()
  return material
}

/** Poses the skeleton's nodes as a clip has them `seconds` in. */
function poseAt(group: AnimationGroup, seconds: number): void {
  for (const { animation, target } of group.targetedAnimations) {
    if (!(target instanceof TransformNode)) {
      continue
    }
    const value: unknown = animation.evaluate(group.from + seconds * animation.framePerSecond)
    if (animation.targetProperty === "position" && value instanceof Vector3) {
      target.position.copyFrom(value)
    } else if (animation.targetProperty === "rotationQuaternion" && value instanceof Quaternion) {
      target.rotationQuaternion = value
    } else if (animation.targetProperty === "scaling" && value instanceof Vector3) {
      target.scaling.copyFrom(value)
    }
  }
}

/** How long a clip runs, in seconds. */
function clipSeconds(group: AnimationGroup): number {
  const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? BAKE_FPS
  return (group.to - group.from) / fps
}

/**
 * Bakes the clips into rows of bone matrices, one row per frame at `BAKE_FPS`, each matrix carried on into the space of
 * `world`, the skinned meshes' place in the glTF hierarchy, so the meshes themselves can stand at the origin.
 */
export function bakeClips(
  skeleton: Skeleton,
  groups: readonly AnimationGroup[],
  world: Matrix
): { data: Float32Array; drift: Float32Array; clips: Map<ClipName, BakedClip> } {
  const byName = new Map(groups.map((group) => [group.name, group]))
  const clips = new Map<ClipName, BakedClip>()
  const rows: { group: AnimationGroup; frames: number }[] = []
  let start = 0
  for (const name of CLIPS) {
    const group = byName.get(name)
    if (group) {
      const frames = Math.max(1, Math.round(clipSeconds(group) * BAKE_FPS) + 1)
      clips.set(name, { start, frames, fps: BAKE_FPS })
      rows.push({ group, frames })
      start += frames
    }
  }
  const floatsPerFrame = (skeleton.bones.length + 1) * 16
  const data = new Float32Array(floatsPerFrame * start)
  const drift = new Float32Array(2 * start)
  const hips = skeleton.bones.find((candidate) => candidate.name === HIPS)
  const bone = new Matrix()
  const placed = new Matrix()
  const hipsAt = Vector3.Zero()
  const hipsFrom = Vector3.Zero()
  let row = 0
  for (const { group, frames } of rows) {
    for (let frame = 0; frame < frames; frame++) {
      poseAt(group, frame / BAKE_FPS)
      skeleton.prepare(true)
      const matrices = skeleton.getTransformMatrices(null)
      for (let index = 0; index < floatsPerFrame; index += 16) {
        Matrix.FromArrayToRef(matrices, index, bone)
        bone.multiplyToRef(world, placed)
        placed.copyToArray(data, row * floatsPerFrame + index)
      }
      if (hips) {
        hips.getFinalMatrix().multiplyToRef(world, placed)
        placed.getTranslationToRef(hipsAt)
        if (frame === 0) {
          hipsFrom.copyFrom(hipsAt)
        }
        drift[row * 2] = hipsAt.x - hipsFrom.x
        drift[row * 2 + 1] = hipsAt.z - hipsFrom.z
      }
      row++
    }
  }
  return { data, drift, clips }
}

function findMesh(container: AssetContainer, name: string): Mesh {
  const mesh = container.meshes.find((candidate) => candidate.name === name)
  if (!(mesh instanceof Mesh)) {
    throw new Error(`soldier kit: no mesh named ${name}`)
  }
  return mesh
}

/**
 * Readies a loaded soldier kit: matte materials, the clips baked into one animation texture shared by every skinned
 * mesh, each mesh standing at the origin with its transform taken into the bake (or, for the guns, its vertices), and
 * the animation groups, done with, disposed.
 */
export function prepareSoldierKit(scene: Scene, container: AssetContainer): SoldierKit {
  const skeleton = container.skeletons[0]
  if (!skeleton) {
    throw new Error("soldier kit: no skeleton")
  }
  const bodies = {
    [Side.French]: findMesh(container, BODIES[Side.French]),
    [Side.German]: findMesh(container, BODIES[Side.German])
  }
  const rifle = findMesh(container, "Soldier_Rifle")
  const mask = findMesh(container, "Soldier_Mask")
  const guns = {
    [Side.French]: findMesh(container, GUNS[Side.French]),
    [Side.German]: findMesh(container, GUNS[Side.German])
  }
  for (const group of container.animationGroups) {
    group.stop()
  }

  // The glTF root turns right-handed into left-handed and the armature scales centimetres to metres: bake both in.
  const world = bodies[Side.French].computeWorldMatrix(true).clone()
  const { data, drift, clips } = bakeClips(skeleton, container.animationGroups, world)
  if (!clips.has("idle")) {
    throw new Error("soldier kit: no idle clip")
  }
  const manager = new BakedVertexAnimationManager(scene)
  manager.texture = new VertexAnimationBaker(scene, skeleton).textureFromBakedVertexData(data)
  manager.texture.name = "soldier-animation"
  for (const group of container.animationGroups.slice()) {
    group.dispose()
  }

  const skinned = [bodies[Side.French], bodies[Side.German], rifle, mask]
  const statics = [guns[Side.French], guns[Side.German]]
  // Disposing a material detaches it from its meshes, so note who used which first.
  const used = new Map([...skinned, ...statics].map((mesh) => [mesh, mesh.material]))
  const matte = new Map([...container.materials].map((material) => [material, toMatte(scene, material)]))
  const prepare = (mesh: Mesh) => {
    const material = used.get(mesh)
    mesh.material = material ? (matte.get(material) ?? material) : null
    mesh.isPickable = false
  }
  for (const mesh of skinned) {
    prepare(mesh)
    mesh.setParent(null)
    mesh.position.setAll(0)
    mesh.rotationQuaternion = Quaternion.Identity()
    mesh.scaling.setAll(1)
    mesh.bakedVertexAnimationManager = manager
    // The bake mirrors (left-handed from right-handed), so the triangles wind the other way.
    if (world.determinant() < 0) {
      mesh.flipFaces()
    }
  }
  for (const gun of statics) {
    prepare(gun)
    gun.setParent(null)
    gun.bakeCurrentTransformIntoVertices()
  }
  return { bodies, rifle, mask, guns, drift, clips, materials: [...new Set(matte.values())] }
}

/**
 * Loads the soldier kit from the level kit's files, or resolves null when it isn't there: the soldiers then stay
 * capsules. Given `files`, it leaves closing them to the caller; otherwise it opens and closes its own.
 */
export async function loadSoldierKit(scene: Scene, given?: KitFiles | null): Promise<SoldierKit | null> {
  const files = given === undefined ? openKitFiles() : given
  if (!files) {
    return null
  }
  const done = () => {
    if (given === undefined) {
      files.close?.()
    }
  }
  try {
    await import("@babylonjs/loaders/glTF/2.0/glTFLoader")
    const glb = await files.read("soldier.glb")
    done()
    const container = await LoadAssetContainerAsync(new Uint8Array(glb), scene, { pluginExtension: ".glb" })
    container.addAllToScene()
    return prepareSoldierKit(scene, container)
  } catch (error) {
    done()
    console.warn(
      "Soldier kit not available, so soldiers stay capsules. Build it with scripts/build-level-kit.py.",
      error
    )
    return null
  }
}
