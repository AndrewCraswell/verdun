import { Animation } from "@babylonjs/core/Animations/animation"
import { AnimationGroup } from "@babylonjs/core/Animations/animationGroup"
import { AssetContainer } from "@babylonjs/core/assetContainer"
import { Bone } from "@babylonjs/core/Bones/bone"
import { Skeleton } from "@babylonjs/core/Bones/skeleton"
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import type { Material } from "@babylonjs/core/Materials/material"
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
import { BAKE_FPS, bakeClips, loadSoldierKit, prepareSoldierKit, restingRifle, rifleBetween } from "./soldier-kit.ts"

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

/**
 * Hangs a mesh's vertices off one bone more in turn, up to `slots`, with the float dust an exporter can leave in the
 * slot after.
 */
function skin(mesh: Mesh, slots: number): void {
  const vertices = mesh.getTotalVertices()
  const weights = new Float32Array(vertices * 4)
  for (let vertex = 0; vertex < vertices; vertex++) {
    const filled = 1 + (vertex % slots)
    weights.fill(1 / filled, vertex * 4, vertex * 4 + filled)
    if (filled < 4) {
      weights[vertex * 4 + filled] = 1e-6
    }
  }
  mesh.setVerticesData(VertexBuffer.MatricesIndicesKind, new Float32Array(vertices * 4), false)
  mesh.setVerticesData(VertexBuffer.MatricesWeightsKind, weights, false)
}

/** How many bones a vertex the kit's men hang off at most, as soldier.glb has them. The rest hang off one. */
const SLOTS = new Map([
  ["Soldier_French", 3],
  ["Soldier_German", 2]
])

/**
 * What the glTF loader hands back for soldier.glb, in miniature: a mirrored root, a scaled armature, one bone, the
 * rifle unrigged under the root like the guns (or, from a kit built before that, rigged like the mask).
 */
function loadedContainer(
  target: Scene,
  { skip, riggedRifle }: { skip?: string; riggedRifle?: boolean } = {}
): AssetContainer {
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
  // A material that's matte already passes through as it is.
  const matte = new StandardMaterial("Soldier_German", target)
  const materials = new Map<string, Material>([
    ["Soldier_French", palette],
    ["Soldier_German", matte]
  ])
  const rigged = ["Soldier_French", "Soldier_German", "Soldier_Mask", ...(riggedRifle ? ["Soldier_Rifle"] : [])]
  for (const name of rigged.filter((candidate) => candidate !== skip)) {
    const mesh = CreateBox(name, { size: 0.5 }, target)
    mesh.parent = armature
    mesh.skeleton = skeleton
    skin(mesh, SLOTS.get(name) ?? 1)
    mesh.material = materials.get(name) ?? plain
    container.meshes.push(mesh)
  }
  const unrigged = [...(riggedRifle ? [] : ["Soldier_Rifle"]), "MachineGun_French", "MachineGun_German"]
  for (const name of unrigged) {
    const gun = CreateBox(name, { width: 0.2, height: 0.4, depth: 1 }, target)
    gun.position.z = 1
    gun.parent = root
    gun.material = plain
    container.meshes.push(gun)
  }
  container.meshes.push(root)
  container.transformNodes.push(armature, hipsNode)
  container.materials.push(palette, plain, matte)
  container.skeletons.push(skeleton)
  container.animationGroups.push(
    clip(target, "rifle_standing_idle", hipsNode, "position"),
    clip(target, "rifle_walk_forward", hipsNode, "rotationQuaternion"),
    clip(target, "bazooka_fire", hipsNode, "position")
  )
  return container
}

/** Two hands, each a wrist with an index finger a tenth of a metre ahead of it, for clips to move about. */
function hands(target: Scene) {
  const skeleton = new Skeleton("hands", "hands0", target)
  const joint = (name: string, parent: Bone | null, at: Vector3) => {
    const node = new TransformNode(name, target)
    node.position.copyFrom(at)
    node.rotationQuaternion = Quaternion.Identity()
    const bone = new Bone(name, skeleton, parent, Matrix.Identity())
    bone.linkTransformNode(node)
    return { node, bone }
  }
  const right = joint("Hand_R", null, new Vector3(0.2, 1, 0))
  joint("IndexFinger_01.001", right.bone, new Vector3(0, 0, 0.1))
  const left = joint("Hand_L", null, new Vector3(-0.1, 1.1, 0.4))
  joint("IndexFinger_01", left.bone, new Vector3(0, 0, 0.1))
  return { skeleton, right: right.node, left: left.node }
}

/** A one-second clip moving each node from where it is to where it's sent. */
function moves(target: Scene, name: string, sent: readonly [TransformNode, Vector3][]): AnimationGroup {
  const group = new AnimationGroup(name, target)
  for (const [node, to] of sent) {
    const animation = new Animation(`${name}-${node.name}`, "position", 60, Animation.ANIMATIONTYPE_VECTOR3)
    animation.setKeys([
      { frame: 0, value: node.position.clone() },
      { frame: 60, value: to }
    ])
    group.addTargetedAnimation(animation, node)
  }
  group.normalize(0, 60)
  return group
}

/** The rifle's matrix in one baked row: after the hands' four bones and Babylon's identity. */
function rifleAt(data: Float32Array, row: number): Matrix {
  const floatsPerFrame = (4 + 2) * 16
  return Matrix.FromArray(data, row * floatsPerFrame + 5 * 16)
}

const forwardOf = (matrix: Matrix) => Vector3.TransformNormal(Vector3.Forward(), matrix)
const upOf = (matrix: Matrix) => Vector3.TransformNormal(Vector3.Up(), matrix)

describe("rifleBetween", () => {
  it("puts the grip in the right palm, the muzzle through the left, and the sights up", () => {
    const rifle = rifleBetween(new Vector3(0, 1, 0), new Vector3(0, 1.3, 0.4), new Matrix())

    expect(rifle.getTranslation().asArray()).toEqual([0, 1, 0])
    expect(
      forwardOf(rifle)
        .asArray()
        .map((value) => Number(value.toFixed(4)))
    ).toEqual([0, 0.6, 0.8])
    expect(upOf(rifle).y).toBeGreaterThan(0)
    expect(Vector3.Dot(upOf(rifle), forwardOf(rifle))).toBeCloseTo(0)
    expect(rifle.determinant()).toBeCloseTo(1)
  })

  it("still has sights to point somewhere when the rifle points straight down, or the hands meet", () => {
    const down = rifleBetween(Vector3.Zero(), new Vector3(0, -1, 0), new Matrix())
    expect(upOf(down).z).toBeCloseTo(1)

    const together = rifleBetween(Vector3.One(), Vector3.One(), new Matrix())
    expect(forwardOf(together).z).toBeCloseTo(1)
  })
})

describe("bakeClips", () => {
  it("bakes the crowd's clips frame by frame into rows of bone matrices, carried into the meshes' space", () => {
    const target = scene()
    const container = loadedContainer(target)
    const skeleton = container.skeletons[0]
    if (!skeleton) {
      throw new Error("no skeleton")
    }
    const world = Matrix.Scaling(2, 2, -2)
    const { data, drift, clips, width } = bakeClips(skeleton, container.animationGroups, world)

    // One second at 24 frames a second, both ends included; the bazooka isn't among the crowd's clips.
    expect(clips.get("rifle_standing_idle")).toEqual({
      start: 0,
      frames: BAKE_FPS + 1,
      fps: BAKE_FPS,
      turn: 0,
      spin: 0
    })
    expect(clips.get("rifle_walk_forward")).toEqual({
      start: BAKE_FPS + 1,
      frames: BAKE_FPS + 1,
      fps: BAKE_FPS,
      turn: 0,
      spin: 0
    })
    expect(clips.size).toBe(2)
    // Three matrices a frame: the bone's, the identity Babylon appends, and the rifle's.
    const floatsPerFrame = 3 * 16
    expect(width).toBe(12)
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
    // A skeleton without hands leaves the rifle where it was modelled.
    expect(Matrix.FromArray(data, 32).isIdentity()).toBe(true)
  })

  it("holds the rifle between the palms in every frame, however the hands move", () => {
    const target = scene()
    const { skeleton, left } = hands(target)
    // The left hand reaches further out and lower, still a rifle's length from the right.
    const idle = moves(target, "rifle_standing_idle", [[left, new Vector3(0.5, 0.9, 0.4)]])
    const { data } = bakeClips(skeleton, [idle], Matrix.Identity())

    const first = rifleAt(data, 0)
    // The right palm: halfway from the wrist to the base of the index finger.
    expect(
      first
        .getTranslation()
        .asArray()
        .map((value) => Number(value.toFixed(4)))
    ).toEqual([0.2, 1, 0.05])
    expect(Vector3.Dot(forwardOf(first), new Vector3(-0.3, 0.1, 0.4).normalize())).toBeCloseTo(1)
    const last = rifleAt(data, BAKE_FPS)
    expect(Vector3.Dot(forwardOf(last), new Vector3(0.3, -0.1, 0.4).normalize())).toBeCloseTo(1)
  })

  it("keeps the rifle in the right hand as it was last held when the left hand lets go of it, or closes up", () => {
    const target = scene()
    const { skeleton, left } = hands(target)
    // The left hand flung out, as a man is hit: two metres off, nowhere near a rifle's length.
    const hit = moves(target, "hit_reaction_while_holding_a_rifle", [[left, new Vector3(1.5, 0.2, 1.4)]])
    const { data } = bakeClips(skeleton, [hit], Matrix.Identity())

    // Three quarters of the way, the hand is long gone from the rifle: it no longer swings after it.
    const letGo = rifleAt(data, (BAKE_FPS * 3) / 4)
    const last = rifleAt(data, BAKE_FPS)
    expect(Vector3.Dot(forwardOf(last), forwardOf(letGo))).toBeCloseTo(1)
    expect(Vector3.Distance(last.getTranslation(), letGo.getTranslation())).toBeCloseTo(0)
  })

  it("turns an aiming clip's soldier so the rifle points ahead, and no other", () => {
    const target = scene()
    const { skeleton, left } = hands(target)
    const still = (name: string) => moves(target, name, [[left, left.position.clone()]])
    const { clips } = bakeClips(
      skeleton,
      [still("rifle_standing_idle"), still("rifle_standing_aiming_idle")],
      Matrix.Identity()
    )

    // The rifle points from the right palm through the left: 0.3 m left for every 0.4 m ahead. Turn right that much.
    expect(clips.get("rifle_standing_aiming_idle")?.turn).toBeCloseTo(Math.atan2(0.3, 0.4))
    expect(clips.get("rifle_standing_idle")?.turn).toBe(0)
  })

  it("keeps the rifle in the left hand when the right leaves it to work the bolt", () => {
    const target = scene()
    const { skeleton, right, left } = hands(target)
    // The right hand goes forward to the bolt, a little closer to the left: still within a rifle's grip of it.
    const bolt = moves(target, "fire_bolt_standing", [[right, new Vector3(0.1, 1.1, 0.15)]])
    const { data } = bakeClips(skeleton, [bolt], Matrix.Identity())

    const first = rifleAt(data, 0)
    const last = rifleAt(data, BAKE_FPS)
    // The left hand hasn't moved, so neither has the rifle.
    expect(last.equalsWithEpsilon(first, 1e-5)).toBe(true)
    expect(left.position.asArray()).toEqual([-0.1, 1.1, 0.4])
  })

  it("leaves the rifle in the right hand alone as a man falls, then lets it fall to the ground", () => {
    const target = scene()
    const { skeleton, right, left } = hands(target)
    const death = moves(target, "dying_from_a_prone_position", [
      [right, new Vector3(0.2, 0.2, 0.5)],
      [left, new Vector3(-1, 0, -1)]
    ])
    const { data } = bakeClips(skeleton, [death], Matrix.Identity())

    const first = rifleAt(data, 0)
    // A quarter of the way down it's carried with the right wrist, palm and all, pointing the way it began.
    const falling = rifleAt(data, BAKE_FPS / 4)
    expect(
      falling
        .getTranslation()
        .asArray()
        .map((value) => Number(value.toFixed(4)))
    ).toEqual([0.2, 0.8, 0.175])
    expect(Vector3.Dot(forwardOf(falling), forwardOf(first))).toBeCloseTo(1)
    // At the end it lies on its side on the ground below the hand, pointing the way it pointed, level.
    const resting = rifleAt(data, BAKE_FPS)
    expect(
      resting
        .getTranslation()
        .asArray()
        .map((value) => Number(value.toFixed(4)))
    ).toEqual([0.2, 0.1, 0.55])
    expect(
      forwardOf(resting)
        .asArray()
        .map((value) => Number(value.toFixed(4)))
    ).toEqual([-0.6, 0, 0.8])
  })
})

describe("restingRifle", () => {
  it("lays a rifle held straight down along where its sights faced", () => {
    const held = rifleBetween(new Vector3(1, 1, 1), new Vector3(1, 0, 1), new Matrix())
    const resting = restingRifle(held, new Matrix())

    expect(forwardOf(resting).z).toBeCloseTo(1)
    expect(resting.determinant()).toBeCloseTo(1)
  })
})

describe("aimed walks and turns", () => {
  /** A one-second clip setting nodes' positions, and turns about an axis in degrees, from the first value to the second. */
  function keyed(
    target: Scene,
    name: string,
    keys: readonly [TransformNode, "position" | "rotationQuaternion", Vector3 | number, Vector3 | number, Vector3?][]
  ): AnimationGroup {
    const group = new AnimationGroup(name, target)
    for (const [node, property, from, to, axis = Vector3.Right()] of keys) {
      const type = property === "position" ? Animation.ANIMATIONTYPE_VECTOR3 : Animation.ANIMATIONTYPE_QUATERNION
      const animation = new Animation(`${name}-${node.name}-${property}`, property, 60, type)
      const value = (key: Vector3 | number) =>
        key instanceof Vector3 ? key : Quaternion.RotationAxis(axis, (key * Math.PI) / 180)
      animation.setKeys([
        { frame: 0, value: value(from) },
        { frame: 60, value: value(to) }
      ])
      group.addTargetedAnimation(animation, node)
    }
    group.normalize(0, 60)
    return group
  }

  /** Hips with the spine's first bone and the thighs on them, a tenth of a metre to either side. */
  function body(target: Scene) {
    const skeleton = new Skeleton("body", "body0", target)
    const joint = (name: string, parent: { node: TransformNode; bone: Bone } | null, at: Vector3) => {
      const node = new TransformNode(name, target)
      node.position.copyFrom(at)
      node.rotationQuaternion = Quaternion.Identity()
      node.parent = parent?.node ?? null
      const bone = new Bone(name, skeleton, parent?.bone ?? null, Matrix.Identity())
      bone.linkTransformNode(node)
      return { node, bone }
    }
    const hips = joint("Hips", null, new Vector3(0, 1, 0))
    const spine = joint("Spine_01", hips, new Vector3(0, 0.1, 0))
    joint("UpperLeg_L", hips, new Vector3(-0.1, 0, 0))
    joint("UpperLeg_R", hips, new Vector3(0.1, 0, 0))
    return { skeleton, hips: hips.node, spine: spine.node }
  }

  it("lays an aimed walk's upper body over each walk, facing the way the walk's hips do", () => {
    const target = scene()
    const { skeleton, hips, spine } = body(target)
    const up = new Vector3(0, 1, 0)
    // The walk bobs the hips and swings them 10 degrees about the vertical; it bends the spine forward 5.
    const walk = keyed(target, "rifle_walk_forward", [
      [hips, "position", up, new Vector3(0, 1.1, 0)],
      [hips, "rotationQuaternion", 0, 10, Vector3.Up()],
      [spine, "rotationQuaternion", 5, 5]
    ])
    // The aimed walk stands bladed, hips turned 40 degrees, its spine turned back 40 and bent forward 20 to aim.
    const aimed = keyed(target, "walking_while_aiming_rifle", [
      [hips, "rotationQuaternion", 40, 40, Vector3.Up()],
      [spine, "rotationQuaternion", 20, 20]
    ])
    const { data, clips } = bakeClips(skeleton, [walk, aimed], Matrix.Identity())

    const made = clips.get("aim_walk_forward")
    expect(made?.frames).toBe(BAKE_FPS + 1)
    expect(clips.has("aim_walk_backward")).toBe(false)
    const floatsPerFrame = (4 + 2) * 16
    const hipsAt = (row: number) => Matrix.FromArray(data, row * floatsPerFrame)
    const spineAt = (row: number) => Matrix.FromArray(data, row * floatsPerFrame + 16)
    const halfway = (made?.start ?? 0) + BAKE_FPS / 2
    // The legs are the walk's: halfway the hips are 1.05 up and swung 5 degrees.
    expect(hipsAt(halfway).getTranslation().y).toBeCloseTo(1.05, 4)
    // The spine faces as it faced on its own hips, 40 degrees round, and bends 20, whatever the walk's hips do.
    const spineForward = Vector3.TransformNormal(Vector3.Forward(), spineAt(halfway))
    expect(Math.atan2(spineForward.x, spineForward.z)).toBeCloseTo((40 * Math.PI) / 180, 3)
    expect(Math.asin(-spineForward.y)).toBeCloseTo((20 * Math.PI) / 180, 3)
  })

  it("measures how far a clip turns a man round, clockwise seen from above", () => {
    const target = scene()
    const { skeleton, hips } = body(target)
    const right = keyed(target, "rifle_turn_90_degree_right_turn", [[hips, "rotationQuaternion", 0, 90, Vector3.Up()]])
    const left = keyed(target, "rifle_turn_45_degree_left_turn", [[hips, "rotationQuaternion", 0, -45, Vector3.Up()]])
    const { clips } = bakeClips(skeleton, [right, left], Matrix.Identity())

    expect(clips.get("rifle_turn_90_degree_right_turn")?.spin).toBeCloseTo(Math.PI / 2)
    expect(clips.get("rifle_turn_45_degree_left_turn")?.spin).toBeCloseTo(-Math.PI / 4)
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
    expect(body.bakedVertexAnimationManager?.texture?.getSize().width).toBe(12)
    expect(kit.rifle.bakedVertexAnimationManager).toBe(body.bakedVertexAnimationManager)
    expect(body.material).toBeInstanceOf(StandardMaterial)
    expect(body.material?.name).toBe("Soldier_French")
    expect(kit.bodies[Side.German].material?.name).toBe("Soldier_German")
    expect(kit.mask.material).toBe(kit.rifle.material)
    expect(kit.materials.every((material) => material instanceof StandardMaterial)).toBe(true)
    expect([...kit.clips.keys()]).toEqual(["rifle_standing_idle", "rifle_walk_forward"])
    expect(target.animationGroups).toHaveLength(0)
  })

  it("skins every vertex of the rifle to its own column of the bake", () => {
    const target = scene()
    const container = loadedContainer(target)
    const { rifle } = prepareSoldierKit(target, container)

    expect(rifle.parent).toBeNull()
    expect(rifle.skeleton).toBe(container.skeletons[0])
    const indices = rifle.getVerticesData(VertexBuffer.MatricesIndicesKind) ?? []
    const weights = rifle.getVerticesData(VertexBuffer.MatricesWeightsKind) ?? []
    expect(indices).toHaveLength(rifle.getTotalVertices() * 4)
    // One bone, then Babylon's identity, then the rifle.
    expect(new Set(Array.from(indices).filter((_, index) => index % 4 === 0))).toEqual(new Set([2]))
    expect(new Set(Array.from(weights).filter((_, index) => index % 4 === 0))).toEqual(new Set([1]))
  })

  it("has each mesh read only the bone slots its vertices fill, and unlinks the bones from the glTF's nodes", () => {
    const target = scene()
    const container = loadedContainer(target)
    const kit = prepareSoldierKit(target, container)

    // Up to the last slot weighted; the dust after it moves nothing.
    expect(kit.bodies[Side.French].numBoneInfluencers).toBe(3)
    expect(kit.bodies[Side.German].numBoneInfluencers).toBe(2)
    expect(kit.mask.numBoneInfluencers).toBe(1)
    expect(kit.rifle.numBoneInfluencers).toBe(1)
    // The bake done, the bones no longer follow the nodes about every frame.
    expect(container.skeletons[0]?.bones.map((bone) => bone.getTransformNode())).toEqual([null])

    // A vertex leaving a slot empty before a weighted one still needs that one read.
    const gapped = loadedContainer(target)
    const mask = gapped.meshes.find((mesh) => mesh.name === "Soldier_Mask")
    const weighted = mask?.getVerticesData(VertexBuffer.MatricesWeightsKind)
    if (!mask || !weighted) {
      throw new Error("no mask weights")
    }
    const weights = Float32Array.from(weighted)
    weights.set([0.9, 0, 0.1, 0])
    mask.setVerticesData(VertexBuffer.MatricesWeightsKind, weights, false)
    expect(prepareSoldierKit(target, gapped).mask.numBoneInfluencers).toBe(3)
  })

  it("bakes the guns' place into their vertices", () => {
    const target = scene()
    const gun = prepareSoldierKit(target, loadedContainer(target)).guns[Side.German]

    expect(gun.parent).toBeNull()
    gun.refreshBoundingInfo()
    // A metre out along z: the root's mirror and half turn cancel along z.
    expect(gun.getBoundingInfo().boundingBox.center.z).toBeCloseTo(1)
  })

  it("refuses a kit missing a mesh, its skeleton or an idle, or built before the rifle came unrigged", () => {
    const target = scene()
    expect(() => prepareSoldierKit(target, loadedContainer(target, { skip: "Soldier_Mask" }))).toThrow(/Soldier_Mask/)

    const boneless = loadedContainer(target)
    boneless.skeletons.length = 0
    expect(() => prepareSoldierKit(target, boneless)).toThrow(/skeleton/)

    const restless = loadedContainer(target)
    restless.animationGroups.splice(0, 1)
    expect(() => prepareSoldierKit(target, restless)).toThrow(/idle/)

    expect(() => prepareSoldierKit(target, loadedContainer(target, { riggedRifle: true }))).toThrow(/rebuild/)
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
    // Given no files, it opens the kit's own; here, with no dev server to serve them, there are none to read.
    await expect(loadSoldierKit(scene())).resolves.toBeNull()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("capsules"), expect.anything())
  })
})
