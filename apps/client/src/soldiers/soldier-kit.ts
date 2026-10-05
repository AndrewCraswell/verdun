import type { AnimationGroup } from "@babylonjs/core/Animations/animationGroup"
import type { AssetContainer } from "@babylonjs/core/assetContainer"
import { BakedVertexAnimationManager } from "@babylonjs/core/BakedVertexAnimation/bakedVertexAnimationManager"
import type { Bone } from "@babylonjs/core/Bones/bone"
import type { Skeleton } from "@babylonjs/core/Bones/skeleton"
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer"
import { Constants } from "@babylonjs/core/Engines/constants"
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader"
import type { Material } from "@babylonjs/core/Materials/material"
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import type { Scene } from "@babylonjs/core/scene"
import { Side } from "@verdun/sim"
import { type KitFiles, openKitFiles } from "../level/kit-files.ts"
import { marksSoldier } from "../render/marker-stencil.ts"
import { AIMING, type BakedClip, CLIPS, type ClipName, CROUCH_LAYER, CROUCH_WALKS, WALKS } from "./soldier-animation.ts"

/** The soldier models and their baked animation, as scripts/build-level-kit.py builds them into soldier.glb. */
export interface SoldierKit {
  /** Each side's body with its helmet, animated from the baked texture. */
  readonly bodies: Readonly<Record<Side, Mesh>>
  /**
   * A rifle, animated from its own column of the baked texture: in the right palm and pointing through the left in
   * every frame, since the clips hold their guns in many ways and no one bone carries it right through all of them.
   */
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
/** The hands that hold the rifle: the right at its grip, the left under the barrel. */
const HANDS = { grip: "Hand_R", forend: "Hand_L" } as const
/** Clips where the left hand leaves the rifle, falling or priming a grenade: it stays in the right hand as it began. */
const ONE_HANDED = /^death_|^stengun_reload$/
/**
 * The palms hold a rifle between them only this far apart, in metres: 0.25 to 0.5 in every clip that grips one. Closer
 * or further (a hand flung out when hit, hands meeting in front of the chest), the line between them is no rifle's,
 * and the rifle stays in the right hand as it was last held.
 */
const GRIP_SPAN = { min: 0.2, max: 0.55 } as const
/**
 * The bones the crouch leaves alone: the crouch is laid over the walks from a stand and a crouch made for another
 * weapon, and its arms closed the hands together in front of the chest.
 */
const ARMS = /Clavicle|Shoulder|Elbow|Hand|Finger|Thumb/
/** Clips a man dies in. He lets the rifle go: from `from` of the way through, it falls to lie `height` up, clear of bumps. */
const DEATH = /^death_/
const DROP = { from: 0.5, height: 0.1 } as const
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

/** For each node a clip moves, how to turn and shift it from one pose to another. */
type Layer = Map<TransformNode, { readonly turn: Quaternion; readonly shift: Vector3 }>

/** Where a clip's first frame puts each node it moves. */
function firstFrame(group: AnimationGroup): Map<TransformNode, { rotation: Quaternion; position: Vector3 }> {
  poseAt(group, 0)
  const pose = new Map<TransformNode, { rotation: Quaternion; position: Vector3 }>()
  for (const { target } of group.targetedAnimations) {
    if (target instanceof TransformNode) {
      pose.set(target, {
        rotation: (target.rotationQuaternion ?? Quaternion.Identity()).clone(),
        position: target.position.clone()
      })
    }
  }
  return pose
}

/** What takes each node from where one clip's first frame has it to where another's does. */
function layerBetween(from: AnimationGroup, to: AnimationGroup): Layer {
  const start = firstFrame(from)
  const end = firstFrame(to)
  const layer: Layer = new Map()
  for (const [node, before] of start) {
    const after = end.get(node)
    if (after) {
      layer.set(node, {
        turn: Quaternion.Inverse(before.rotation).multiply(after.rotation),
        shift: after.position.subtract(before.position)
      })
    }
  }
  return layer
}

/**
 * The part of a layer a clip can carry: the turns of the nodes it turns and the shifts of those it moves. The others
 * keep whatever pose they were last given, and a layer laid over them frame after frame would pile up.
 */
function layerOver(group: AnimationGroup, layer: Layer): Layer {
  const turned = new Set<unknown>()
  const moved = new Set<unknown>()
  for (const { animation, target } of group.targetedAnimations) {
    if (animation.targetProperty === "rotationQuaternion") {
      turned.add(target)
    } else if (animation.targetProperty === "position") {
      moved.add(target)
    }
  }
  const over: Layer = new Map()
  for (const [node, { turn, shift }] of layer) {
    if (turned.has(node) || moved.has(node)) {
      over.set(node, {
        turn: turned.has(node) ? turn : Quaternion.Identity(),
        shift: moved.has(node) ? shift : Vector3.Zero()
      })
    }
  }
  return over
}

/** Lays a layer over whatever pose the nodes are in: each turned on in its own frame, and shifted. */
function applyLayer(layer: Layer): void {
  for (const [node, { turn, shift }] of layer) {
    node.rotationQuaternion = (node.rotationQuaternion ?? Quaternion.Identity()).multiply(turn)
    node.position.addInPlace(shift)
  }
}

/** How long a clip runs, in seconds. */
function clipSeconds(group: AnimationGroup): number {
  const fps = group.targetedAnimations[0]?.animation.framePerSecond ?? BAKE_FPS
  return (group.to - group.from) / fps
}

/** A hand's wrist and the base of its index finger: the palm is between them. */
interface Hand {
  readonly wrist: Bone
  readonly finger: Bone
}

function handOf(skeleton: Skeleton, name: string): Hand | null {
  const wrist = skeleton.bones.find((bone) => bone.name === name)
  const finger = wrist?.getChildren().find((child) => child.name.startsWith("IndexFinger_01"))
  return wrist && finger ? { wrist, finger } : null
}

/** Where a bone is, as last prepared, in the space of `world`. */
function jointAt(bone: Bone, world: Matrix, scratch: Matrix, result: Vector3): Vector3 {
  bone.getFinalMatrix().multiplyToRef(world, scratch)
  return scratch.getTranslationToRef(result)
}

/**
 * The rifle in the right palm (`grip`) pointing through the left (`forend`), sights up: the transform from the rifle
 * model's own frame (grip at the origin, muzzle along +z, sights along +y) to where the hands hold it.
 */
export function rifleBetween(grip: Vector3, forend: Vector3, result: Matrix): Matrix {
  const forward = forend.subtract(grip)
  if (forward.lengthSquared() < 1e-8) {
    forward.set(0, 0, 1)
  }
  forward.normalize()
  // Sights up: the world's up, less its share along the barrel. Pointing straight up or down, toward the body's front.
  const reference = Math.abs(forward.y) > 0.99 ? Vector3.Forward() : Vector3.Up()
  const up = reference.subtract(forward.scale(Vector3.Dot(reference, forward))).normalize()
  const right = Vector3.Cross(up, forward)
  Matrix.FromValuesToRef(
    right.x,
    right.y,
    right.z,
    0,
    up.x,
    up.y,
    up.z,
    0,
    forward.x,
    forward.y,
    forward.z,
    0,
    grip.x,
    grip.y,
    grip.z,
    1,
    result
  )
  return result
}

/** A rifle let go of: on its side on the ground below where it was held, lying the way it pointed. */
export function restingRifle(held: Matrix, result: Matrix): Matrix {
  const forward = Vector3.TransformNormal(Vector3.Forward(), held)
  forward.y = 0
  if (forward.lengthSquared() < 1e-6) {
    // Held straight up or down: it falls the way its sights faced.
    forward.copyFrom(Vector3.TransformNormal(Vector3.Up(), held))
    forward.y = 0
  }
  forward.normalize()
  const grip = held.getTranslation()
  const right = Vector3.Up()
  const up = Vector3.Cross(forward, right)
  Matrix.FromValuesToRef(
    right.x,
    right.y,
    right.z,
    0,
    up.x,
    up.y,
    up.z,
    0,
    forward.x,
    forward.y,
    forward.z,
    0,
    grip.x,
    DROP.height,
    grip.z,
    1,
    result
  )
  return result
}

/** Eases a dying man's rifle out of his hand over the second half of the clip, down to `restingRifle`. */
function dropRifle(data: Float32Array, rows: { first: number; count: number }, stride: number, offset: number): void {
  const held = Matrix.FromArray(data, (rows.first + rows.count - 1) * stride + offset)
  const resting = restingRifle(held, new Matrix())
  const from = Math.floor((rows.count - 1) * DROP.from)
  const blended = new Matrix()
  for (let frame = from + 1; frame < rows.count; frame++) {
    const at = (rows.first + frame) * stride + offset
    Matrix.FromArrayToRef(data, at, held)
    const t = (frame - from) / (rows.count - 1 - from)
    Matrix.DecomposeLerpToRef(held, resting, t * t * (3 - 2 * t), blended)
    blended.copyToArray(data, at)
  }
}

/**
 * Bakes the clips into rows of bone matrices, one row per frame at `BAKE_FPS`, each matrix carried on into the space of
 * `world`, the skinned meshes' place in the glTF hierarchy, so the meshes themselves can stand at the origin. After the
 * bones and the identity Babylon appends to them comes one more matrix: the rifle's, from `rifleBetween` the palms,
 * or carried in the right hand alone and, in a death, let fall.
 */
export function bakeClips(
  skeleton: Skeleton,
  groups: readonly AnimationGroup[],
  world: Matrix
): { data: Float32Array; drift: Float32Array; clips: Map<ClipName, BakedClip>; width: number } {
  const byName = new Map(groups.map((group) => [group.name, group]))
  const clips = new Map<ClipName, BakedClip>()
  const rows: { name: ClipName; group: AnimationGroup; frames: number; layer?: Layer }[] = []
  let start = 0
  const add = (name: ClipName, group: AnimationGroup | undefined, layer?: Layer) => {
    if (group) {
      const frames = Math.max(1, Math.round(clipSeconds(group) * BAKE_FPS) + 1)
      clips.set(name, { start, frames, fps: BAKE_FPS, turn: 0 })
      rows.push({ name, group, frames, layer })
      start += frames
    }
  }
  for (const name of CLIPS) {
    add(name, byName.get(name))
  }
  // The crouched walks: each walk with the crouch laid over it.
  const stand = byName.get(CROUCH_LAYER.from)
  const crouch = byName.get(CROUCH_LAYER.to)
  const crouchLayer = stand && crouch ? layerBetween(stand, crouch) : undefined
  for (const node of crouchLayer?.keys() ?? []) {
    if (ARMS.test(node.name)) {
      crouchLayer?.delete(node)
    }
  }
  for (const [index, name] of CROUCH_WALKS.entries()) {
    const walk = byName.get(WALKS[index] ?? "")
    if (crouchLayer && walk) {
      add(name, walk, layerOver(walk, crouchLayer))
    }
  }
  const boneFloats = (skeleton.bones.length + 1) * 16
  const floatsPerFrame = boneFloats + 16
  const data = new Float32Array(floatsPerFrame * start)
  const drift = new Float32Array(2 * start)
  const hips = skeleton.bones.find((candidate) => candidate.name === HIPS)
  const gripHand = handOf(skeleton, HANDS.grip)
  const forendHand = handOf(skeleton, HANDS.forend)
  const bone = new Matrix()
  const placed = new Matrix()
  const rifle = new Matrix()
  const heldBy = new Matrix()
  const hipsAt = Vector3.Zero()
  const hipsFrom = Vector3.Zero()
  const joint = Vector3.Zero()
  const grip = Vector3.Zero()
  const forend = Vector3.Zero()
  const palm = (hand: Hand, result: Vector3) =>
    result
      .copyFrom(jointAt(hand.wrist, world, placed, joint))
      .addInPlace(jointAt(hand.finger, world, placed, joint))
      .scaleInPlace(0.5)
  // The rifle in the right hand as last held between the palms, for frames where the hands let go of it.
  let held = false
  let row = 0
  for (const { name, group, frames, layer } of rows) {
    const oneHanded = ONE_HANDED.test(name)
    // Where an aiming clip points the rifle, summed over its frames: the soldier is turned to put that ahead.
    let aimX = 0
    let aimZ = 0
    for (let frame = 0; frame < frames; frame++) {
      poseAt(group, frame / BAKE_FPS)
      if (layer) {
        applyLayer(layer)
      }
      skeleton.prepare(true)
      const matrices = skeleton.getTransformMatrices(null)
      for (let index = 0; index < boneFloats; index += 16) {
        Matrix.FromArrayToRef(matrices, index, bone)
        bone.multiplyToRef(world, placed)
        placed.copyToArray(data, row * floatsPerFrame + index)
      }
      if (hips) {
        jointAt(hips, world, placed, hipsAt)
        if (frame === 0) {
          hipsFrom.copyFrom(hipsAt)
        }
        drift[row * 2] = hipsAt.x - hipsFrom.x
        drift[row * 2 + 1] = hipsAt.z - hipsFrom.z
      }
      if (gripHand && forendHand) {
        palm(gripHand, grip)
        palm(forendHand, forend)
        const span = Vector3.Distance(grip, forend)
        const gripped = span >= GRIP_SPAN.min && span <= GRIP_SPAN.max
        // The right hand in the world: the rifle is carried by it whenever the left isn't on it.
        gripHand.wrist.getFinalMatrix().multiplyToRef(world, placed)
        if (gripped && (!oneHanded || frame === 0)) {
          rifleBetween(grip, forend, rifle)
          placed.invertToRef(bone)
          rifle.multiplyToRef(bone, heldBy)
          held = true
        } else if (held) {
          // Rifle to hand, then hand to the world.
          heldBy.multiplyToRef(placed, rifle)
        } else {
          rifleBetween(grip, forend, rifle)
        }
      } else {
        rifle.copyFrom(Matrix.IdentityReadOnly)
      }
      rifle.copyToArray(data, row * floatsPerFrame + boneFloats)
      Vector3.TransformNormalToRef(Vector3.Forward(), rifle, joint)
      aimX += joint.x
      aimZ += joint.z
      row++
    }
    const clip = clips.get(name)
    if (clip && AIMING.has(name) && aimX * aimX + aimZ * aimZ > 1e-12) {
      clips.set(name, { ...clip, turn: -Math.atan2(aimX, aimZ) })
    }
    if (DEATH.test(name) && gripHand && forendHand && frames > 1) {
      dropRifle(data, { first: row - frames, count: frames }, floatsPerFrame, boneFloats)
    }
  }
  return { data, drift, clips, width: floatsPerFrame / 4 }
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
 * mesh, each mesh standing at the origin with its transform taken into the bake (or, for the rifle and the guns, its
 * vertices), the rifle skinned to its own column of the bake, and the animation groups, done with, disposed.
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

  if (rifle.skeleton) {
    throw new Error(
      "soldier kit: the rifle is rigged, so the kit predates the rifle held between the hands; rebuild it"
    )
  }

  // The glTF root turns right-handed into left-handed and the armature scales centimetres to metres: bake both in.
  const world = bodies[Side.French].computeWorldMatrix(true).clone()
  const { data, drift, clips, width } = bakeClips(skeleton, container.animationGroups, world)
  if (!clips.has("idle")) {
    throw new Error("soldier kit: no idle clip")
  }
  const manager = new BakedVertexAnimationManager(scene)
  manager.texture = RawTexture.CreateRGBATexture(
    data,
    width,
    data.length / (width * 4),
    scene,
    false,
    false,
    Constants.TEXTURE_NEAREST_SAMPLINGMODE,
    Constants.TEXTURETYPE_FLOAT
  )
  manager.texture.name = "soldier-animation"
  for (const group of container.animationGroups.slice()) {
    group.dispose()
  }

  const skinned = [bodies[Side.French], bodies[Side.German], mask]
  const statics = [rifle, guns[Side.French], guns[Side.German]]
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
  for (const mesh of statics) {
    prepare(mesh)
    mesh.setParent(null)
    mesh.bakeCurrentTransformIntoVertices()
  }
  // Every vertex of the rifle on its own column of the bake, the one after the bones and Babylon's identity.
  const vertices = rifle.getTotalVertices()
  const indices = new Float32Array(vertices * 4)
  const weights = new Float32Array(vertices * 4)
  for (let vertex = 0; vertex < vertices; vertex++) {
    indices[vertex * 4] = skeleton.bones.length + 1
    weights[vertex * 4] = 1
  }
  rifle.setVerticesData(VertexBuffer.MatricesIndicesKind, indices, false)
  rifle.setVerticesData(VertexBuffer.MatricesWeightsKind, weights, false)
  rifle.skeleton = skeleton
  rifle.bakedVertexAnimationManager = manager
  const materials = [...new Set(matte.values())]
  // The squad's markers, drawn over the battlefield, keep off the men (render/marker-stencil.ts).
  for (const material of materials) {
    marksSoldier(material)
  }
  return { bodies, rifle, mask, guns, drift, clips, materials }
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
