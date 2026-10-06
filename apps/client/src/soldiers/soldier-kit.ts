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
  RIFLE_SLUNG,
  RIFLE_SLUNG_BRIEFLY
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
/**
 * And both palms are above his hips, less this much in metres: a rifle is held in front of him, where hands that only
 * happen to be a rifle's length apart, hanging at his sides, hold none.
 */
const GRIP_ABOVE_HIPS = 0.05
/** A clip whose palms never hold the rifle takes the grip the standing aim's first frame has. */
const GRIP_FROM: ClipName = "rifle_standing_aiming_idle"
/** The frames looked through for a clip's grip, from the first. */
const GRIP_LOOK = 12
/** The clip whose first frame sets where the slung rifle hangs on his back: standing at ease. */
const SLING_FROM: ClipName = IDLE
/**
 * A rifle slung for a clip played once from his hands (`RIFLE_SLUNG_BRIEFLY`) goes onto his back over this many of its
 * first frames, and comes back to his hands over as many of its last, swinging out this far to his right on the way,
 * in metres, round his body rather than through it.
 */
const SLING_EASE = { frames: 8, out: 0.3 } as const
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
/** The left ankle, whose lift sets where a walk is in its stride, for laying an aimed walk's arms over it in step. */
const ANKLE = "Ankle_L"
/** A walk's stride is compared at this many points through it. */
const STRIDE_SAMPLES = 24
/**
 * In a death he lets the rifle go: at once in a clip whose hands never hold one, as soon as it would touch the ground,
 * once his hips have fallen below `release` of the height they began at, or else `late` of the way through. It falls
 * from his hand as it was moving, no faster than `fling` metres a second, under `gravity`, turning onto its side over
 * `turning` seconds at least, to lie `height` up (its grip: the stock's side on the ground), clear of where his body
 * comes to lie by `clear` metres. Never below the ground on the way.
 */
const DROP = { release: 0.8, late: 0.35, fling: 2, gravity: 9.8, turning: 0.35, height: 0.03, clear: 0.04 } as const
/**
 * A fallen man's body, as the rifle keeps clear of it: capsules from joint to joint, this many metres round. The head's
 * runs on past it, over the helmet.
 */
const LYING = [
  { from: "Hips", to: "Spine_03", radius: 0.14, beyond: 0 },
  { from: "Spine_03", to: "Neck", radius: 0.13, beyond: 0 },
  { from: "Neck", to: "Head", radius: 0.13, beyond: 0.12 },
  { from: "UpperLeg_L", to: "LowerLeg_L", radius: 0.08, beyond: 0 },
  { from: "UpperLeg_R", to: "LowerLeg_R", radius: 0.08, beyond: 0 },
  { from: "LowerLeg_L", to: "Ankle_L", radius: 0.06, beyond: 0 },
  { from: "LowerLeg_R", to: "Ankle_R", radius: 0.06, beyond: 0 }
] as const
/** The rifle's reach either side of its grip, in metres, as the kit's model has it: butt behind, muzzle ahead. */
const RIFLE_REACH = { butt: -0.28, muzzle: 0.92 } as const
/** Its ends, in its own frame (+z to the muzzle, +y its sights): the butt's toe and heel, and the muzzle's underside. */
const RIFLE_ENDS = [
  new Vector3(0, -0.12, RIFLE_REACH.butt),
  new Vector3(0, 0, RIFLE_REACH.butt),
  new Vector3(0, 0.02, RIFLE_REACH.muzzle)
] as const

/** How far below the ground a rifle placed so goes, at its lowest end: 0 when it's clear. */
function belowGround(rifle: Matrix): number {
  let lowest = Number.POSITIVE_INFINITY
  for (const end of RIFLE_ENDS) {
    lowest = Math.min(lowest, Vector3.TransformCoordinates(end, rifle).y)
  }
  return Math.max(0, -lowest)
}

/**
 * How far a held rifle tips about its grip, at most, in radians, to keep out of the ground, found in steps this fine,
 * and spread over this many frames either side of those it must, so it eases out of the ground rather than jumps.
 */
const GROUND_TIP = { most: 0.7, step: 0.01, spread: 4 } as const

/**
 * The tip about its grip (radians about its own right: positive lifts the butt, lowering the muzzle) that brings a
 * rifle out of the ground: the least that does, lifting whichever end is lower; or the most, if none does.
 */
function tipOutOfGround(rifle: Matrix): number {
  if (belowGround(rifle) <= 0) {
    return 0
  }
  const [toe, heel, muzzle] = RIFLE_ENDS.map((end) => Vector3.TransformCoordinates(end, rifle).y)
  const way = Math.min(toe ?? 0, heel ?? 0) < (muzzle ?? 0) ? 1 : -1
  const tip = new Matrix()
  const tipped = new Matrix()
  for (let angle = GROUND_TIP.step; angle < GROUND_TIP.most; angle += GROUND_TIP.step) {
    Matrix.RotationXToRef(way * angle, tip)
    tip.multiplyToRef(rifle, tipped)
    if (belowGround(tipped) <= 0) {
      return way * angle
    }
  }
  return way * GROUND_TIP.most
}

/**
 * Keeps a held rifle out of the ground through a clip: tipped about its grip, in the hand, as little as clears it;
 * where no tip will, the hand down on the ground with it, laid on its side under the hand, level, pointing the way it
 * pointed, and raised off the ground if the grip itself is in it. Either eases in and out over the frames either side.
 */
function keepOutOfGround(data: Float32Array, rows: { first: number; count: number }, stride: number, offset: number) {
  const rifles = Array.from({ length: rows.count }, (_, frame) =>
    Matrix.FromArray(data, (rows.first + frame) * stride + offset)
  )
  const needed = rifles.map(tipOutOfGround)
  if (needed.every((angle) => angle === 0)) {
    return
  }
  const tip = new Matrix()
  const tipped = new Matrix()
  // Where the most tip leaves it in the ground still.
  const laid = rifles.map((rifle, frame) => {
    Matrix.RotationXToRef(needed[frame] ?? 0, tip)
    tip.multiplyToRef(rifle, tipped)
    return belowGround(tipped) > 0 ? 1 : 0
  })
  const lying = new Matrix()
  const blended = new Matrix()
  /** The most any frame near asks for, fading with how far off it is. */
  const near = (values: readonly number[], frame: number, pick: (a: number, b: number) => number) => {
    let most = 0
    for (let step = -GROUND_TIP.spread; step <= GROUND_TIP.spread; step++) {
      most = pick(most, (values[frame + step] ?? 0) * (1 - Math.abs(step) / (GROUND_TIP.spread + 1)))
    }
    return most
  }
  for (const [frame, rifle] of rifles.entries()) {
    // The butt's lift and the muzzle's apart, so one doesn't undo the other.
    Matrix.RotationXToRef(near(needed, frame, Math.max) + near(needed, frame, Math.min), tip)
    tip.multiplyToRef(rifle, tipped)
    const lay = near(laid, frame, Math.max)
    if (lay > 0) {
      restingRifle(rifle, lying)
      lying.setTranslation(rifle.getTranslation())
      Matrix.DecomposeLerpToRef(tipped, lying, lay * lay * (3 - 2 * lay), blended)
      tipped.copyFrom(blended)
    }
    const sunk = belowGround(tipped)
    if (sunk > 0) {
      const at = tipped.getTranslation()
      tipped.setTranslationFromFloats(at.x, at.y + sunk, at.z)
    }
    tipped.copyToArray(data, (rows.first + frame) * stride + offset)
  }
}
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

/** A capsule: the segment from one point to another and all within `radius` of it. */
interface Capsule {
  readonly from: Vector3
  readonly to: Vector3
  readonly radius: number
}

/** The point on a segment nearest another. */
function nearestOnSegment(point: Vector3, from: Vector3, to: Vector3): Vector3 {
  const along = to.subtract(from)
  const length = along.lengthSquared()
  const t = length > 1e-12 ? Math.max(0, Math.min(1, Vector3.Dot(point.subtract(from), along) / length)) : 0
  return from.add(along.scaleInPlace(t))
}

/**
 * How far to move a rifle lying along `forward` from `grip`, across the ground, to keep it clear of a body: out from
 * whichever part it would lie in, until it lies in none.
 */
function clearOfBody(grip: Vector3, forward: Vector3, body: readonly Capsule[]): Vector3 {
  const moved = Vector3.Zero()
  // Square across the rifle, along the ground: the way it slides off a body it lies on, failing any better.
  const across = new Vector3(-forward.z, 0, forward.x)
  for (let attempt = 0; attempt < 8; attempt++) {
    let deepest = 0
    const way = Vector3.Zero()
    for (let along = RIFLE_REACH.butt; along <= RIFLE_REACH.muzzle; along += 0.05) {
      const point = grip.add(forward.scale(along)).addInPlace(moved)
      for (const { from, to, radius } of body) {
        const nearest = nearestOnSegment(point, from, to)
        const depth = radius + DROP.clear - Vector3.Distance(point, nearest)
        if (depth > deepest) {
          deepest = depth
          way.copyFrom(point.subtract(nearest))
        }
      }
    }
    if (deepest <= 0) {
      break
    }
    way.y = 0
    if (way.lengthSquared() < 1e-8) {
      way.copyFrom(across)
    }
    moved.addInPlace(way.normalize().scaleInPlace(deepest + 0.01))
  }
  return moved
}

/**
 * Lets a dying man's rifle go at `release` (a frame of the clip): it falls from his hand, moving as the hand moved, to
 * lie on its side on the ground (`restingRifle`), turning over as it falls and kept clear of where his body comes to lie.
 * Frames before `release` keep it in his hand.
 */
function dropRifle(
  data: Float32Array,
  rows: { first: number; count: number },
  stride: number,
  offset: number,
  release: number,
  body: readonly Capsule[]
): void {
  const held = Matrix.FromArray(data, (rows.first + release) * stride + offset)
  const before = Matrix.FromArray(data, (rows.first + Math.max(0, release - 1)) * stride + offset)
  const start = held.getTranslation()
  const velocity = start.subtract(before.getTranslation()).scaleInPlace(BAKE_FPS)
  if (velocity.length() > DROP.fling) {
    velocity.normalize().scaleInPlace(DROP.fling)
  }
  // When it reaches the ground: falling from its height, under gravity from the speed it had.
  const drop = Math.max(0, start.y - DROP.height)
  const landing = (velocity.y + Math.sqrt(velocity.y * velocity.y + 2 * DROP.gravity * drop)) / DROP.gravity
  const resting = restingRifle(held, new Matrix())
  const lying = new Vector3(start.x + velocity.x * landing, DROP.height, start.z + velocity.z * landing)
  const forward = Vector3.TransformNormal(Vector3.Forward(), resting)
  lying.addInPlace(clearOfBody(lying, forward, body))
  resting.setTranslation(lying)
  const blended = new Matrix()
  for (let frame = release; frame < rows.count; frame++) {
    const seconds = (frame - release) / BAKE_FPS
    const t = landing > 0 ? Math.min(1, seconds / landing) : 1
    const turned = Math.min(1, seconds / Math.max(landing, DROP.turning))
    Matrix.DecomposeLerpToRef(held, resting, turned * turned * (3 - 2 * turned), blended)
    // Its path a fall, not a slide: the height under gravity, the ground covered at the speed it went.
    const falling = Math.min(seconds, landing)
    blended.setTranslationFromFloats(
      start.x + (lying.x - start.x) * t,
      Math.max(DROP.height, start.y + velocity.y * falling - (DROP.gravity * falling * falling) / 2),
      start.z + (lying.z - start.z) * t
    )
    // Turning over as it lands, one end could dig in: it rests on it instead.
    const sunk = belowGround(blended)
    if (sunk > 0) {
      const at = blended.getTranslation()
      blended.setTranslationFromFloats(at.x, at.y + sunk, at.z)
    }
    blended.copyToArray(data, (rows.first + frame) * stride + offset)
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
  const rows: { name: ClipName; group: AnimationGroup; frames: number; upper?: AnimationGroup; stride: number }[] = []
  let start = 0
  const add = (name: ClipName, group: AnimationGroup | undefined, upper?: AnimationGroup) => {
    if (group) {
      const frames = Math.max(1, Math.round(clipSeconds(group) * BAKE_FPS) + 1)
      clips.set(name, { start, frames, fps: BAKE_FPS, turn: 0, spin: 0 })
      rows.push({ name, group, frames, upper, stride: 0 })
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
  const ankle = skeleton.bones.find((candidate) => candidate.name === ANKLE)
  const bodyBones = new Map(
    LYING.flatMap(({ from, to }) => [from, to]).map((name) => [name, skeleton.bones.find((bone) => bone.name === name)])
  )
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
      // Held in front of him, above his hips, where the skeleton has them.
      const low = hips ? jointAt(hips, world, placed, hipsAt).y - GRIP_ABOVE_HIPS : Number.NEGATIVE_INFINITY
      if (span >= GRIP_SPAN.min && span <= GRIP_SPAN.max && grip.y > low && forend.y > low) {
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
  /** How high the left ankle is through a clip's cycle, at `STRIDE_SAMPLES` points, or null without one. */
  const strideOf = (group: AnimationGroup): number[] | null => {
    if (!ankle) {
      return null
    }
    const length = clipSeconds(group)
    const heights = Array.from({ length: STRIDE_SAMPLES }, (_, index) => {
      poseAt(group, (index / STRIDE_SAMPLES) * length)
      skeleton.prepare(true)
      return jointAt(ankle, world, placed, joint).y
    })
    const mean = heights.reduce((sum, height) => sum + height, 0) / heights.length
    return heights.map((height) => height - mean)
  }
  // Where in its cycle each aimed walk's upper body starts, so its stride matches the walk's: the left foot up together.
  for (const entry of rows) {
    if (!entry.upper) {
      continue
    }
    const walk = strideOf(entry.group)
    const aimed = strideOf(entry.upper)
    if (!walk || !aimed) {
      continue
    }
    let best = -Infinity
    for (let shift = 0; shift < STRIDE_SAMPLES; shift++) {
      const match = walk.reduce(
        (sum, height, index) => sum + height * (aimed[(index + shift) % STRIDE_SAMPLES] ?? 0),
        0
      )
      if (match > best) {
        best = match
        entry.stride = shift / STRIDE_SAMPLES
      }
    }
  }
  const held = new Matrix()
  const blended = new Matrix()
  const aside = Vector3.Zero()
  const hipsPlaced = new Matrix()
  // Where the clips a rifle is slung from hold it, relative to the hips, as they begin.
  const easeFrom = new Set(RIFLE_SLUNG_BRIEFLY.values())
  const heldAtEase = new Map<ClipName, Matrix>()
  let row = 0
  for (const { name, group, frames, upper, stride } of rows) {
    const leftHeld = RIFLE_IN_LEFT_HAND.has(name)
    const slung = sling && chest && RIFLE_SLUNG.has(name) ? sling : null
    const easedFrom = RIFLE_SLUNG_BRIEFLY.get(name)
    const briefly = easedFrom !== undefined
    const dying = DEATHS.has(name)
    // A death's hips, frame by frame, for when he goes down and lets the rifle go; and his body as he comes to lie.
    const hipsHeights: number[] = []
    const body: Capsule[] = []
    // And the first frame his rifle, still in his hand, would go into the ground: he lets go of it then.
    let grounded = -1
    // An aimed walk's arms, and so its grip, are the aimed walk's.
    const ownGrip = gripOf(upper ?? group)
    const gripped = ownGrip ?? sharedGrip
    // Where an aiming clip points the rifle, summed over its frames: the soldier is turned to put that ahead.
    let aimX = 0
    let aimZ = 0
    // Which way the hips face in the first frame and the last, for how far the clip turns him round.
    let firstFacing = 0
    let lastFacing = 0
    for (let frame = 0; frame < frames; frame++) {
      poseAt(group, frame / BAKE_FPS)
      if (upper) {
        // Once through the aimed walk's cycle in the walk's, in step with it, so the two loop together.
        const cycle = frames > 1 ? frame / (frames - 1) : 0
        layUpper(upper, ((cycle + stride) % 1) * clipSeconds(upper))
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
        hipsHeights.push(hipsAt.y)
      }
      if (dying && frame === frames - 1) {
        for (const { from, to, radius, beyond } of LYING) {
          const start = bodyBones.get(from)
          const end = bodyBones.get(to)
          if (start && end) {
            const a = jointAt(start, world, placed, Vector3.Zero())
            const b = jointAt(end, world, placed, Vector3.Zero())
            body.push({ from: a, to: b.add(b.subtract(a).normalize().scaleInPlace(beyond)), radius })
          }
        }
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
        // Played once from his hands, onto his back as it begins and back into them as it ends, swung out round his
        // right side on the way.
        const ease = briefly ? Math.min(1, frame / SLING_EASE.frames, (frames - 1 - frame) / SLING_EASE.frames) : 1
        const atEase = easedFrom ? heldAtEase.get(easedFrom) : undefined
        if (ease < 1 && gripHand && gripped && thighs.left && thighs.right) {
          // From where the clip it's played from holds it, as his hips carry it; failing that, from his right hand.
          if (atEase && hips) {
            hips.getFinalMatrix().multiplyToRef(world, hipsPlaced)
            atEase.multiplyToRef(hipsPlaced, held)
          } else {
            gripHand.wrist.getFinalMatrix().multiplyToRef(world, placed)
            gripped.multiplyToRef(placed, held)
          }
          const share = ease * ease * (3 - 2 * ease)
          Matrix.DecomposeLerpToRef(held, rifle, share, blended)
          const facing = facingOf(
            jointAt(thighs.left, world, placed, left),
            jointAt(thighs.right, world, placed, right)
          )
          aside.set(Math.cos(facing), 0, -Math.sin(facing)).scaleInPlace(SLING_EASE.out * Math.sin(Math.PI * share))
          blended.setTranslation(blended.getTranslation().addInPlace(aside))
          rifle.copyFrom(blended)
        }
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
      if (dying && !slung && grounded < 0 && belowGround(rifle) > 0) {
        grounded = frame
      }
      if (frame === 0 && easeFrom.has(name) && hips) {
        hips.getFinalMatrix().multiplyToRef(world, hipsPlaced)
        heldAtEase.set(name, rifle.multiply(hipsPlaced.invertToRef(bone)))
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
    // Held, never in the ground. A dying man lets it go before it would touch, and it falls to lie on the ground.
    if (!slung && !dying && gripHand && forendHand && gripped) {
      keepOutOfGround(data, { first: row - frames, count: frames }, floatsPerFrame, boneFloats)
    }
    if (dying && gripHand && forendHand && frames > 2) {
      // He lets go as his hips go down, or failing that partway through; at once if the clip never held a rifle, or as
      // soon as it would touch the ground.
      const standing = hipsHeights[0] ?? 0
      const down = hipsHeights.findIndex((height, frame) => frame > 0 && height < standing * DROP.release)
      const late = down > 0 ? down : Math.round((frames - 1) * DROP.late)
      const touched = grounded >= 0 ? Math.max(0, grounded - 1) : late
      const release = ownGrip ? Math.min(frames - 2, late, touched) : 0
      dropRifle(data, { first: row - frames, count: frames }, floatsPerFrame, boneFloats, release, body)
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
