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
import {
  AIM_LAYERS,
  AIMING,
  type BakedClip,
  CLIPS,
  type ClipName,
  DEATHS,
  IDLE,
  RIFLE_IN_LEFT_HAND,
  RIFLE_SLUNG
} from "./soldier-animation.ts"

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
  /**
   * Per baked row, the rifle's place: the matrix (16 floats) taking the rifle model's own frame into the meshes', as
   * the rifle is drawn. With `muzzle`, where its muzzle is in each frame of each clip.
   */
  readonly rifleRows: Float32Array
  /** The rifle's muzzle in the rifle model's own frame: the middle of the barrel's end, in metres. */
  readonly muzzle: Vector3
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
/**
 * How the right hand grips the rifle through a clip: as the clip's first frame with both palms on it has it between
 * them, this far apart in metres, and fixed in the hand from then on. Mixamo made its rifle clips with the gun fixed in
 * the right hand and the left reaching for it, so the rifle never swings about when the left lets go.
 */
const GRIP_SPAN = { min: 0.22, max: 0.55 } as const
/** A clip whose palms never hold the rifle takes the grip the standing aim's first frame has. */
const GRIP_FROM: ClipName = "rifle_standing_aiming_idle"
/** The frames looked through for a clip's grip, from the first. */
const GRIP_LOOK = 12
/** The clip whose first frame sets where the slung rifle hangs on his back: standing at ease. */
const SLING_FROM: ClipName = IDLE
/** The bone the slung rifle hangs from: the chest. */
const CHEST = "Spine_03"
/**
 * Slung across the back, for a man facing +z (the meshes' forward, +x his right): the grip this far from the chest, in
 * metres (to his right, down, behind), the barrel up toward his left shoulder, the sights facing back.
 */
const SLING = {
  grip: new Vector3(0.14, -0.32, -0.2),
  along: new Vector3(-0.35, 0.94, -0.05),
  sights: new Vector3(0, 0, -1)
} as const
/** The bones an aimed walk lays over a walk (see `AIM_LAYERS`): the spine and all above it. */
const UPPER = /Spine|Neck|Head|Clavicle|Shoulder|Elbow|Hand|Finger|Thumb/
/** The spine's first bone, the hips' child: turned so the aimed walk's upper body faces the way its own hips did. */
const SPINE = "Spine_01"
/** The thighs: the line between them, seen from above, is which way the hips face, for how far a clip turns a man. */
const THIGHS = { left: "UpperLeg_L", right: "UpperLeg_R" } as const
/** In a death he lets the rifle go: from `from` of the way through, it falls to lie `height` up, clear of bumps. */
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

/** A clip's pose `seconds` in, for the nodes it moves: their rotations and places, without posing them. */
function sampleAt(
  group: AnimationGroup,
  seconds: number
): Map<TransformNode, { rotation?: Quaternion; position?: Vector3 }> {
  const pose = new Map<TransformNode, { rotation?: Quaternion; position?: Vector3 }>()
  for (const { animation, target } of group.targetedAnimations) {
    if (!(target instanceof TransformNode)) {
      continue
    }
    const value: unknown = animation.evaluate(group.from + seconds * animation.framePerSecond)
    const sample = pose.get(target) ?? {}
    if (animation.targetProperty === "position" && value instanceof Vector3) {
      sample.position = value.clone()
    } else if (animation.targetProperty === "rotationQuaternion" && value instanceof Quaternion) {
      sample.rotation = value.clone()
    }
    pose.set(target, sample)
  }
  return pose
}

/**
 * Lays another clip's upper body, `seconds` into it (looping), over whatever pose the nodes are in: the spine and all
 * above it as that clip has them, the spine's first bone turned so the upper body faces the posed hips as it faced its
 * own clip's hips. A walk's legs carry the arms and rifle of a walk made aiming.
 */
function layUpper(upper: AnimationGroup, seconds: number): void {
  const length = clipSeconds(upper)
  const pose = sampleAt(upper, length > 0 ? seconds % length : 0)
  const upperHips = [...pose].find(([node]) => node.name === HIPS)?.[1].rotation
  for (const [node, { rotation, position }] of pose) {
    if (!UPPER.test(node.name)) {
      continue
    }
    if (rotation) {
      const hips = node.parent instanceof TransformNode ? node.parent.rotationQuaternion : null
      node.rotationQuaternion =
        node.name === SPINE && upperHips && hips
          ? Quaternion.Inverse(hips).multiply(upperHips).multiply(rotation)
          : rotation
    }
    if (position && node.name !== SPINE) {
      node.position.copyFrom(position)
    }
  }
}

/** Which way a line across the hips faces, seen from above: radians clockwise, as a soldier's yaw is measured. */
function facingOf(left: Vector3, right: Vector3): number {
  // Square to the line from the right thigh to the left, ahead of it.
  return Math.atan2(left.z - right.z, right.x - left.x)
}

/** The shortest signed turn from one heading to another, in radians. */
function turnBetween(from: number, to: number): number {
  const difference = (to - from) % (2 * Math.PI)
  if (difference > Math.PI) {
    return difference - 2 * Math.PI
  }
  return difference < -Math.PI ? difference + 2 * Math.PI : difference
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

/** A rifle with its grip at `grip`, pointing `along`, its sights turned toward `sights`, as `rifleBetween` lays it. */
function rifleAlong(grip: Vector3, along: Vector3, sights: Vector3, result: Matrix): Matrix {
  const forward = along.normalizeToNew()
  const up = sights.subtract(forward.scale(Vector3.Dot(sights, forward))).normalize()
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
): { data: Float32Array; drift: Float32Array; rifles: Float32Array; clips: Map<ClipName, BakedClip>; width: number } {
  const byName = new Map(groups.map((group) => [group.name, group]))
  const clips = new Map<ClipName, BakedClip>()
  const rows: { name: ClipName; group: AnimationGroup; frames: number; upper?: AnimationGroup }[] = []
  let start = 0
  const add = (name: ClipName, group: AnimationGroup | undefined, upper?: AnimationGroup) => {
    if (group) {
      const frames = Math.max(1, Math.round(clipSeconds(group) * BAKE_FPS) + 1)
      clips.set(name, { start, frames, fps: BAKE_FPS, turn: 0, spin: 0 })
      rows.push({ name, group, frames, upper })
      start += frames
    }
  }
  for (const name of CLIPS) {
    add(name, byName.get(name))
  }
  // The aimed walks: each walk's legs under the upper body of a walk made aiming.
  for (const { walks, made, upper } of AIM_LAYERS) {
    const aimed = byName.get(upper)
    for (const [index, name] of made.entries()) {
      if (aimed) {
        add(name, byName.get(walks[index] ?? ""), aimed)
      }
    }
  }
  const boneFloats = (skeleton.bones.length + 1) * 16
  const floatsPerFrame = boneFloats + 16
  const data = new Float32Array(floatsPerFrame * start)
  const drift = new Float32Array(2 * start)
  const rifles = new Float32Array(16 * start)
  const hips = skeleton.bones.find((candidate) => candidate.name === HIPS)
  const thighs = {
    left: skeleton.bones.find((candidate) => candidate.name === THIGHS.left),
    right: skeleton.bones.find((candidate) => candidate.name === THIGHS.right)
  }
  const left = Vector3.Zero()
  const right = Vector3.Zero()
  const gripHand = handOf(skeleton, HANDS.grip)
  const forendHand = handOf(skeleton, HANDS.forend)
  const bone = new Matrix()
  const placed = new Matrix()
  const rifle = new Matrix()
  // The rifle in the left hand, for a bolt worked or a grenade thrown: the right hand leaves it, the left holds on.
  const heldByLeft = new Matrix()
  const leftPlaced = new Matrix()
  const chestPlaced = new Matrix()
  const chest = skeleton.bones.find((candidate) => candidate.name === CHEST)
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
  /**
   * The rifle between the palms, relative to the right hand, at the clip's first frame (of the first `GRIP_LOOK`) with
   * both palms on it: how that hand grips it. Null when they never are.
   */
  const gripOf = (group: AnimationGroup): Matrix | null => {
    if (!gripHand || !forendHand) {
      return null
    }
    const frames = Math.min(GRIP_LOOK, Math.round(clipSeconds(group) * BAKE_FPS) + 1)
    for (let frame = 0; frame < frames; frame++) {
      poseAt(group, frame / BAKE_FPS)
      skeleton.prepare(true)
      const span = Vector3.Distance(palm(gripHand, grip), palm(forendHand, forend))
      if (span >= GRIP_SPAN.min && span <= GRIP_SPAN.max) {
        rifleBetween(grip, forend, rifle)
        gripHand.wrist.getFinalMatrix().multiplyToRef(world, placed)
        return rifle.multiply(placed.invertToRef(bone))
      }
    }
    return null
  }
  const reference = byName.get(GRIP_FROM)
  const sharedGrip = reference ? gripOf(reference) : null
  // Slung across the back, relative to the chest, as he stands at ease.
  const slingFrom = byName.get(SLING_FROM)
  let sling: Matrix | null = null
  if (chest && slingFrom) {
    poseAt(slingFrom, 0)
    skeleton.prepare(true)
    chest.getFinalMatrix().multiplyToRef(world, chestPlaced)
    const at = chestPlaced.getTranslation().addInPlace(SLING.grip)
    sling = rifleAlong(at, SLING.along, SLING.sights, new Matrix()).multiply(chestPlaced.invertToRef(bone))
  }
  let row = 0
  for (const { name, group, frames, upper } of rows) {
    const leftHeld = RIFLE_IN_LEFT_HAND.has(name)
    const slung = sling && chest && RIFLE_SLUNG.has(name) ? sling : null
    // An aimed walk's arms, and so its grip, are the aimed walk's.
    const gripped = gripOf(upper ?? group) ?? sharedGrip
    // Where an aiming clip points the rifle, summed over its frames: the soldier is turned to put that ahead.
    let aimX = 0
    let aimZ = 0
    // Which way the hips face in the first frame and the last, for how far the clip turns him round.
    let firstFacing = 0
    let lastFacing = 0
    for (let frame = 0; frame < frames; frame++) {
      poseAt(group, frame / BAKE_FPS)
      if (upper) {
        layUpper(upper, frame / BAKE_FPS)
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
      if (thighs.left && thighs.right && (frame === 0 || frame === frames - 1)) {
        const facing = facingOf(jointAt(thighs.left, world, placed, left), jointAt(thighs.right, world, placed, right))
        if (frame === 0) {
          firstFacing = facing
        }
        lastFacing = facing
      }
      if (slung && chest) {
        chest.getFinalMatrix().multiplyToRef(world, chestPlaced)
        slung.multiplyToRef(chestPlaced, rifle)
      } else if (gripHand && forendHand && gripped) {
        // The right hand in the world, and the rifle in it as it grips it.
        gripHand.wrist.getFinalMatrix().multiplyToRef(world, placed)
        gripped.multiplyToRef(placed, rifle)
        if (leftHeld) {
          // Then wherever the left hand takes it, from the first frame on.
          forendHand.wrist.getFinalMatrix().multiplyToRef(world, leftPlaced)
          if (frame === 0) {
            rifle.multiplyToRef(leftPlaced.invertToRef(bone), heldByLeft)
          } else {
            heldByLeft.multiplyToRef(leftPlaced, rifle)
          }
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
    if (clip) {
      const turn = AIMING.has(name) && aimX * aimX + aimZ * aimZ > 1e-12 ? -Math.atan2(aimX, aimZ) : 0
      clips.set(name, { ...clip, turn, spin: turnBetween(firstFacing, lastFacing) })
    }
    if (DEATHS.has(name) && gripHand && forendHand && frames > 1) {
      dropRifle(data, { first: row - frames, count: frames }, floatsPerFrame, boneFloats)
    }
  }
  for (let at = 0; at < start; at++) {
    rifles.set(data.subarray(at * floatsPerFrame + boneFloats, at * floatsPerFrame + boneFloats + 16), at * 16)
  }
  return { data, drift, rifles, clips, width: floatsPerFrame / 4 }
}

function findMesh(container: AssetContainer, name: string): Mesh {
  const mesh = container.meshes.find((candidate) => candidate.name === name)
  if (!(mesh instanceof Mesh)) {
    throw new Error(`soldier kit: no mesh named ${name}`)
  }
  return mesh
}

/**
 * A bone's weight too slight to count. Babylon sums each bone's matrix times its weight without making the weights add
 * up again, so leaving one out moves the vertex by that weight of the bone's whole transform: at most a ten-thousandth
 * of the way from where it is to the origin, a fraction of a millimetre for a man at the origin, where the bake poses
 * him.
 */
const SLIGHT = 1e-4

/**
 * How many bone slots a skinned mesh's vertices fill: up to the last one any vertex weights, and at least the first,
 * which the baked-animation shader reads whatever. Babylon reads four unless told otherwise, each a matrix from the
 * animation texture, and the kit's men hang off three bones a vertex at most, their masks off one.
 */
function influencesUsed(mesh: Mesh): number {
  let used = 1
  const slots = [
    mesh.getVerticesData(VertexBuffer.MatricesWeightsKind),
    mesh.getVerticesData(VertexBuffer.MatricesWeightsExtraKind)
  ]
  // Weights that can't be read from here can't be counted: then it reads as many slots as it did.
  if (!slots.some(Boolean)) {
    return mesh.numBoneInfluencers
  }
  for (const [set, weights] of slots.entries()) {
    if (!weights) {
      continue
    }
    for (let index = 0; index < weights.length; index++) {
      if (weights[index] > SLIGHT) {
        used = Math.max(used, set * 4 + (index % 4) + 1)
      }
    }
  }
  return used
}

/**
 * Readies a loaded soldier kit: matte materials, the clips baked into one animation texture shared by every skinned
 * mesh, each mesh standing at the origin with its transform taken into the bake (or, for the rifle and the guns, its
 * vertices), the rifle skinned to its own column of the bake, every skinned mesh reading only the bone slots its
 * vertices fill, and the animation groups and the bones' links to the glTF's nodes, done with, let go.
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
  const { data, drift, rifles, clips, width } = bakeClips(skeleton, container.animationGroups, world)
  if (!clips.has(IDLE)) {
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
  // The bake is done with the glTF's bone nodes. Left linked, the skeleton would copy them into its bones and work out
  // every bone's matrix again each frame, for meshes that take theirs from the texture.
  for (const bone of skeleton.bones) {
    bone.linkTransformNode(null)
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
    mesh.numBoneInfluencers = influencesUsed(mesh)
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
  rifle.numBoneInfluencers = 1
  const muzzle = muzzleOf(rifle)
  const materials = [...new Set(matte.values())]
  // The squad's markers, drawn over the battlefield, keep off the men (render/marker-stencil.ts).
  for (const material of materials) {
    marksSoldier(material)
  }
  return { bodies, rifle, mask, guns, drift, rifleRows: rifles, muzzle, clips, materials }
}

/** How near the barrel's end a vertex must be, in metres, to be taken for part of the muzzle. */
const MUZZLE_DEPTH = 0.03

/** The middle of the rifle model's barrel end: its vertices furthest along +z, the way it points. */
export function muzzleOf(rifle: Mesh): Vector3 {
  const positions = rifle.getVerticesData(VertexBuffer.PositionKind) ?? []
  let end = Number.NEGATIVE_INFINITY
  for (let index = 2; index < positions.length; index += 3) {
    end = Math.max(end, positions[index] ?? end)
  }
  const sum = Vector3.Zero()
  let count = 0
  for (let index = 0; index + 2 < positions.length; index += 3) {
    if ((positions[index + 2] ?? end) >= end - MUZZLE_DEPTH) {
      sum.addInPlaceFromFloats(positions[index] ?? 0, positions[index + 1] ?? 0, positions[index + 2] ?? 0)
      count++
    }
  }
  return count > 0 ? sum.scaleInPlace(1 / count) : Vector3.Zero()
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
