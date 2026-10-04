import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import {
  BROKEN_MORALE,
  canRun,
  capturedIds,
  type EntityId,
  fallenIds,
  isInTrench,
  MaskState,
  PINNED,
  seesOverParapet,
  Side,
  type Simulation,
  soldierIds,
  Stance,
  STEP_SECONDS,
  Weapon
} from "@verdun/sim"
import type { SoldierRenderer } from "../battlefield-scene.ts"
import { drawnCount } from "../effects/instance-buffer.ts"
import {
  type Action,
  type BakedClip,
  choosePose,
  type ClipName,
  MOVING_SPEED,
  type Pose,
  poseFrame,
  poseSeconds,
  type SoldierState
} from "./soldier-animation.ts"
import type { SoldierKit } from "./soldier-kit.ts"

/** Draws the soldiers as animated Synty characters: thin instances over the baked animation texture. */
export interface SoldierCrowd extends SoldierRenderer {
  /** Moves and poses everyone for this frame. Runs before each render; exposed for tests. */
  update(): void
  /** How many soldiers the last update drew, and how long it took in milliseconds. */
  readonly stats: { drawn: number; updateMs: number }
  dispose(): void
}

export interface SoldierCrowdOptions {
  /** Seconds on a steady clock: performance.now by default. */
  readonly clock?: () => number
}

/** The clip each action plays, which sets how long it lasts. */
const ACTION_CLIPS: Readonly<Record<Action, ClipName>> = {
  fire: "brengun_fire",
  throw: "stengun_reload",
  hit: "hit_ribs"
}
/** Faster than this between syncs is a jump, not a walk: snap there. */
const SNAP_SPEED = 15
/** How quickly the drawn heading turns toward the simulation's, per second, and into or out of an aiming stance. */
const TURN_RATE = 8
/**
 * How closely a move must keep to an order, as a cosine, to be that order being carried out: heading for the move
 * order's target, or the way the player steers.
 */
const ON_ORDERS = 0.98
/** Rising more than this for every metre across the ground is a scramble, not a walk: the simulation's 45 degrees. */
const SCRAMBLE_GRADE = 1
/** A scramble lasts this long after the last step that rose like one, so a man on a wall doesn't flicker in and out. */
const CLIMB_HOLD = 0.3
/** A loss of health this large is a wound worth flinching at; gas wears health down more slowly. */
const WOUND = 0.02
/** How much of each new speed measurement goes into the smoothed speed. */
const SPEED_SMOOTHING = 0.5
/** Bounding sphere for culling against the view: centred at chest height, wide enough for a man lying down or a gun. */
const CULL = { height: 0.9, radius: 2.2 } as const
/** Ground slope sampling distance, in metres, for laying the fallen and prone along the ground. */
const SLOPE_STEP = 0.5
/** The steepest a body lies, in radians: crater lips are steeper than a man would come to rest on. */
const MAX_TILT = 0.35
/** How far ahead of a gunner his gun's tripod stands, in metres: it stands on the ground there, not at his feet. */
const GUN_REACH = 1

interface Track {
  status: SoldierState["status"]
  stance: Stance
  side: Side
  weapon: Weapon
  shown: boolean
  fromX: number
  fromY: number
  fromZ: number
  toX: number
  toY: number
  toZ: number
  moveStart: number
  moveSeconds: number
  x: number
  y: number
  z: number
  /** Where the soldier faces, drawn turning toward the simulation's facing, `targetYaw`. */
  yaw: number
  targetYaw: number
  /** How far the body is turned from that facing, toward the current clip's `BakedClip.turn`. */
  turn: number
  speed: number
  heading: number
  running: boolean
  /** Until when the soldier is scrambling up a wall, by the clock, and which way he's going up it. */
  climbUntil: number
  climbYaw: number
  /** Turns a lying body from level onto the slope beneath it, or null when standing. */
  tilt: Matrix | null
  cooldown: number
  grenades: number
  health: number
  action: Action | null
  actionUntil: number
  pose: Pose
  poseStart: number
  /** Where in a loop this soldier starts, so a crowd doesn't move in step. */
  phase: number
  masked: boolean
  /** How much higher the ground is under a gunner's gun than under him. */
  gunLift: number
  /**
   * Whether, standing where he was last asked about, he sees over the parapet: dozens of height samples round him, so
   * worked out again only once he has moved.
   */
  parapet: { x: number; z: number; sees: boolean } | null
}

/** One mesh drawn as thin instances: a matrix each and, when animated, a baked-animation setting each. */
interface Layer {
  readonly mesh: Mesh
  readonly animated: boolean
  matrices: Float32Array
  settings: Float32Array
  count: number
  /** Instances drawn last frame: the live ones, then the rest of their bucket collapsed to nothing. */
  drawn: number
}

function createLayer(mesh: Mesh, animated: boolean): Layer {
  // Thin instances share one bounding box; soldiers are culled one by one in update() instead.
  mesh.alwaysSelectAsActiveMesh = true
  mesh.doNotSyncBoundingInfo = true
  mesh.isPickable = false
  const layer: Layer = {
    mesh,
    animated,
    matrices: new Float32Array(0),
    settings: new Float32Array(0),
    count: 0,
    drawn: 0
  }
  allocate(layer, 64)
  mesh.thinInstanceCount = 0
  return layer
}

function allocate(layer: Layer, capacity: number): void {
  layer.matrices = new Float32Array(capacity * 16)
  layer.mesh.thinInstanceSetBuffer("matrix", layer.matrices, 16, false)
  if (layer.animated) {
    layer.settings = new Float32Array(capacity * 4)
    layer.mesh.thinInstanceSetBuffer("bakedVertexAnimationSettingsInstanced", layer.settings, 4, false)
  }
}

/** Space in the layer for one more soldier: its matrix and setting offsets. */
function claim(layer: Layer): number {
  if ((layer.count + 1) * 16 > layer.matrices.length) {
    const matrices = layer.matrices
    const settings = layer.settings
    allocate(layer, Math.max(64, layer.count * 2))
    layer.matrices.set(matrices)
    layer.settings.set(settings.subarray(0, Math.min(settings.length, layer.settings.length)))
  }
  return layer.count++
}

/**
 * Sends the layer's instances to the GPU. It draws whole buckets of them (see effects/instance-buffer.ts), the bucket's
 * spare instances and any left over from last frame collapsed to nothing, so the count drawn changes only now and then
 * and a recorded frame stays good for longer.
 */
function flush(layer: Layer): void {
  const drawn = drawnCount(layer.count, layer.matrices.length / 16)
  layer.matrices.fill(0, layer.count * 16, Math.max(drawn, layer.drawn) * 16)
  layer.drawn = drawn
  layer.mesh.thinInstanceBufferUpdated("matrix")
  if (layer.animated) {
    layer.mesh.thinInstanceBufferUpdated("bakedVertexAnimationSettingsInstanced")
  }
  if (layer.mesh.thinInstanceCount !== drawn) {
    layer.mesh.thinInstanceCount = drawn
  }
}

/** Shortest signed turn from one heading to another, in radians. */
function turn(from: number, to: number): number {
  const difference = (to - from) % (2 * Math.PI)
  if (difference > Math.PI) {
    return difference - 2 * Math.PI
  }
  return difference < -Math.PI ? difference + 2 * Math.PI : difference
}

/** Whether a move keeps to a direction: within `ON_ORDERS` of it. */
function along(dx: number, dz: number, directionX: number, directionZ: number): boolean {
  const lengths = Math.sqrt((dx * dx + dz * dz) * (directionX * directionX + directionZ * directionZ))
  return lengths > 0 && (dx * directionX + dz * directionZ) / lengths > ON_ORDERS
}

/** The stance a soldier is drawn in: prone, crouching or standing. Men down a dugout aren't drawn at all. */
function drawnStance(stance: number): Stance {
  if (stance === Stance.Prone || stance === Stance.Crouching) {
    return stance
  }
  return Stance.Standing
}

/** A stable fraction from 0 to 1 for an id. */
function idFraction(id: number): number {
  const hashed = Math.imul(id + 1, 2654435761) >>> 0
  return hashed / 2 ** 32
}

export function createSoldierCrowd(
  scene: Scene,
  sim: Simulation,
  kit: SoldierKit,
  { clock = () => performance.now() / 1000 }: SoldierCrowdOptions = {}
): SoldierCrowd {
  const { soldiers, map } = sim
  const layers = {
    bodies: {
      [Side.French]: createLayer(kit.bodies[Side.French], true),
      [Side.German]: createLayer(kit.bodies[Side.German], true)
    },
    rifle: createLayer(kit.rifle, true),
    mask: createLayer(kit.mask, true),
    guns: {
      [Side.French]: createLayer(kit.guns[Side.French], false),
      [Side.German]: createLayer(kit.guns[Side.German], false)
    }
  }
  const allLayers = [
    layers.bodies[Side.French],
    layers.bodies[Side.German],
    layers.rifle,
    layers.mask,
    layers.guns[Side.French],
    layers.guns[Side.German]
  ]
  const idle = kit.clips.get("idle")
  if (!idle) {
    throw new Error("soldier kit: no idle clip")
  }
  const clipOf = (name: ClipName): BakedClip => kit.clips.get(name) ?? idle

  const tracks: (Track | undefined)[] = []
  const drawn: Track[] = []
  let lastTick = sim.tick
  let lastFrame = clock()
  const stats = { drawn: 0, updateMs: 0 }

  function groundTilt(x: number, z: number): Matrix {
    // A trench floor is flat, but sampling across it would catch the walls and tip a body under the duckboards.
    if (isInTrench(map, x, z)) {
      return Matrix.Identity()
    }
    const slopeX = (heightAt(map, x + SLOPE_STEP, z) - heightAt(map, x - SLOPE_STEP, z)) / (2 * SLOPE_STEP)
    const slopeZ = (heightAt(map, x, z + SLOPE_STEP) - heightAt(map, x, z - SLOPE_STEP)) / (2 * SLOPE_STEP)
    const normal = new Vector3(-slopeX, 1, -slopeZ).normalize()
    // From straight up onto the ground's normal, about the axis between them.
    const axis = new Vector3(normal.z, 0, -normal.x)
    const angle = Math.min(MAX_TILT, Math.acos(Math.min(1, normal.y)))
    const rotation =
      axis.lengthSquared() > 1e-12 ? Quaternion.RotationAxis(axis.normalize(), angle) : Quaternion.Identity()
    return Matrix.FromQuaternionToRef(rotation, new Matrix())
  }

  function createTrack(id: EntityId, status: Track["status"], now: number): Track {
    const x = soldiers.position.x[id]
    const z = soldiers.position.z[id]
    const y = heightAt(map, x, z)
    const yaw = Math.atan2(soldiers.facing.x[id], soldiers.facing.z[id])
    return {
      status,
      stance: drawnStance(soldiers.stance.value[id]),
      side: soldiers.side.value[id] === Side.German ? Side.German : Side.French,
      weapon: soldiers.weapon.kind[id] === Weapon.MachineGun ? Weapon.MachineGun : Weapon.Rifle,
      shown: false,
      fromX: x,
      fromY: y,
      fromZ: z,
      toX: x,
      toY: y,
      toZ: z,
      moveStart: now,
      moveSeconds: 0,
      x,
      y,
      z,
      yaw,
      targetYaw: yaw,
      turn: 0,
      speed: 0,
      heading: 0,
      running: false,
      climbUntil: Number.NEGATIVE_INFINITY,
      climbYaw: yaw,
      tilt: null,
      cooldown: soldiers.weapon.cooldown[id],
      grenades: soldiers.grenades.count[id],
      health: soldiers.health.value[id],
      action: null,
      actionUntil: 0,
      pose: { clip: "idle", mode: "loop", rate: 1 },
      poseStart: now,
      phase: idFraction(id),
      masked: false,
      gunLift: 0,
      parapet: null
    }
  }

  /**
   * Whether a man moving (dx, dz) since the last sync is running: on a run order or the run key, standing, and with the
   * breath and the nerve for it. Both flags outlive what set them, so only a move along the order counts: straight for
   * the move order's target, or the way he's steered.
   */
  function runs(id: EntityId, dx: number, dz: number, track: Track): boolean {
    const { moveOrder, steer } = soldiers
    if (soldiers.stance.value[id] !== Stance.Standing || !canRun(sim, id)) {
      return false
    }
    const ordered = moveOrder.run[id] === 1 && along(dx, dz, moveOrder.x[id] - track.toX, moveOrder.z[id] - track.toZ)
    return ordered || (steer.run[id] === 1 && along(dx, dz, steer.x[id], steer.z[id]))
  }

  /** Sets where a track is drawn at `now`, partway from its last place to its newest. */
  function place(track: Track, now: number): void {
    const t = track.moveSeconds > 0 ? Math.min(1, (now - track.moveStart) / track.moveSeconds) : 1
    track.x = track.fromX + (track.toX - track.fromX) * t
    track.y = track.fromY + (track.toY - track.fromY) * t
    track.z = track.fromZ + (track.toZ - track.fromZ) * t
  }

  function startAction(track: Track, action: Action, now: number): void {
    track.action = action
    track.actionUntil =
      now + poseSeconds(clipOf(ACTION_CLIPS[action]), { clip: ACTION_CLIPS[action], mode: "once", rate: 1 })
  }

  function overParapet(track: Track, id: EntityId, x: number, z: number): boolean {
    if (track.parapet?.x !== x || track.parapet.z !== z) {
      track.parapet = { x, z, sees: seesOverParapet(sim, id) }
    }
    return track.parapet.sees
  }

  function visit(
    id: EntityId,
    status: Track["status"],
    ticks: number,
    now: number,
    isShown?: (soldier: EntityId) => boolean
  ): void {
    const fresh = tracks[id] === undefined
    let track = tracks[id]
    if (!track) {
      track = createTrack(id, status, now)
      tracks[id] = track
    }
    const x = soldiers.position.x[id]
    const z = soldiers.position.z[id]
    if (ticks > 0) {
      const seconds = ticks * STEP_SECONDS
      const dx = x - track.toX
      const dz = z - track.toZ
      const measured = Math.sqrt(dx * dx + dz * dz) / seconds
      // Glide on from wherever the soldier is drawn now, or jump there when no one could have walked it.
      const jumped = measured > SNAP_SPEED
      if (!jumped) {
        place(track, now)
      }
      track.speed = jumped ? 0 : track.speed + (measured - track.speed) * SPEED_SMOOTHING
      if (!jumped && measured >= MOVING_SPEED) {
        // Clockwise from facing: ahead is along facing, right is facing turned a quarter clockwise seen from above.
        const fx = soldiers.facing.x[id]
        const fz = soldiers.facing.z[id]
        track.heading = Math.atan2(dx * fz - dz * fx, dx * fx + dz * fz)
        track.running = runs(id, dx, dz, track)
      } else {
        track.running = false
      }
      // Up a wall the simulation moves a man slowly across the ground and steadily upward.
      const rise = heightAt(map, x, z) - track.toY
      if (!jumped && rise > 0 && rise > Math.sqrt(dx * dx + dz * dz) * SCRAMBLE_GRADE) {
        track.climbUntil = now + CLIMB_HOLD
        track.climbYaw = Math.atan2(dx, dz)
      }
      track.fromX = jumped ? x : track.x
      track.fromY = jumped ? heightAt(map, x, z) : track.y
      track.fromZ = jumped ? z : track.z
      track.moveStart = now
      track.moveSeconds = seconds
    }
    track.toX = x
    track.toZ = z
    track.toY = heightAt(map, x, z)

    const stance = soldiers.stance.value[id]
    // A soldier's side and weapon are his for life, but cost nothing to read again.
    track.side = soldiers.side.value[id] === Side.German ? Side.German : Side.French
    track.weapon = soldiers.weapon.kind[id] === Weapon.MachineGun ? Weapon.MachineGun : Weapon.Rifle
    const climbing = status === "fighting" && now < track.climbUntil
    if (status === "fighting") {
      // A man scrambles up a wall facing it, whichever way he was looking.
      track.targetYaw = climbing ? track.climbYaw : Math.atan2(soldiers.facing.x[id], soldiers.facing.z[id])
      track.stance = drawnStance(stance)
      if (soldiers.grenades.count[id] < track.grenades) {
        startAction(track, "throw", now)
      } else if (soldiers.weapon.cooldown[id] > track.cooldown + 1e-3) {
        startAction(track, "fire", now)
      } else if (soldiers.health.value[id] < track.health - WOUND) {
        startAction(track, "hit", now)
      }
    } else if (status === "captured") {
      track.targetYaw = Math.atan2(soldiers.facing.x[id], soldiers.facing.z[id])
    }
    track.cooldown = soldiers.weapon.cooldown[id]
    track.grenades = soldiers.grenades.count[id]
    track.health = soldiers.health.value[id]
    track.masked = soldiers.mask.state[id] !== MaskState.Off
    if (track.weapon === Weapon.MachineGun) {
      const gunX = x + soldiers.facing.x[id] * GUN_REACH
      const gunZ = z + soldiers.facing.z[id] * GUN_REACH
      track.gunLift = heightAt(map, gunX, gunZ) - heightAt(map, x, z)
    }
    if (track.action && now >= track.actionUntil) {
      track.action = null
    }
    if (status !== track.status) {
      track.status = status
      track.action = null
    }

    const pose = choosePose({
      status,
      stance: track.stance,
      weapon: track.weapon,
      speed: status === "fallen" ? 0 : track.speed,
      heading: track.heading,
      running: track.running,
      climbing,
      aiming: soldiers.target.id[id] >= 0,
      // Only a man standing still with no one in his sights needs to know: aiming or moving, he isn't watching.
      overParapet:
        status === "fighting" &&
        track.stance === Stance.Standing &&
        track.speed < MOVING_SPEED &&
        soldiers.target.id[id] < 0 &&
        overParapet(track, id, x, z),
      pinned: soldiers.suppression.value[id] >= PINNED,
      broken: soldiers.morale.value[id] < BROKEN_MORALE,
      action: track.action,
      id
    })
    if (pose.clip !== track.pose.clip || pose.mode !== track.pose.mode) {
      // A soldier already down when first seen lies as he fell rather than falling again.
      track.poseStart = fresh && status === "fallen" ? now - 1e6 : now
    }
    track.pose = pose
    const lying = status === "fallen" || (status === "fighting" && track.stance === Stance.Prone)
    if (!lying) {
      track.tilt = null
    } else if (status !== "fallen" || !track.tilt) {
      // The fallen don't move: lay them on the slope once.
      track.tilt = groundTilt(x, z)
    }

    track.shown = status !== "fighting" || (stance !== Stance.Sheltering && (isShown === undefined || isShown(id)))
    if (track.shown) {
      drawn.push(track)
    }
  }

  function sync(isShown?: (soldier: EntityId) => boolean): void {
    const now = clock()
    const ticks = Math.max(0, sim.tick - lastTick)
    lastTick = sim.tick
    drawn.length = 0
    for (const id of soldierIds(sim)) {
      visit(id, "fighting", ticks, now, isShown)
    }
    for (const id of capturedIds(sim)) {
      visit(id, "captured", ticks, now)
    }
    for (const id of fallenIds(sim)) {
      const track = tracks[id]
      if (track?.status === "fallen" && track.tilt) {
        // Laid down already, and the dead don't move: only drawn.
        drawn.push(track)
        continue
      }
      visit(id, "fallen", ticks, now)
    }
  }

  const yawMatrix = new Matrix()
  const placed = new Matrix()

  /** Writes a soldier's transform, standing at (x, y, z) and turned `yaw`, into a layer. */
  function writeMatrix(layer: Layer, index: number, track: Track, x: number, y: number, z: number, yaw: number): void {
    const offset = index * 16
    if (track.tilt) {
      Matrix.RotationYToRef(yaw, yawMatrix)
      yawMatrix.multiplyToRef(track.tilt, placed)
      placed.setTranslationFromFloats(x, y, z)
      placed.copyToArray(layer.matrices, offset)
      return
    }
    const cos = Math.cos(yaw)
    const sin = Math.sin(yaw)
    const m = layer.matrices
    m[offset] = cos
    m[offset + 1] = 0
    m[offset + 2] = -sin
    m[offset + 3] = 0
    m[offset + 4] = 0
    m[offset + 5] = 1
    m[offset + 6] = 0
    m[offset + 7] = 0
    m[offset + 8] = sin
    m[offset + 9] = 0
    m[offset + 10] = cos
    m[offset + 11] = 0
    m[offset + 12] = x
    m[offset + 13] = y
    m[offset + 14] = z
    m[offset + 15] = 1
  }

  /**
   * Where the soldier being added is drawn: his place, less any drift his clip has carried him, and his body's heading,
   * turned into his clip's stance.
   */
  const at = { x: 0, z: 0, yaw: 0 }

  function add(layer: Layer, track: Track, row: number): void {
    const index = claim(layer)
    writeMatrix(layer, index, track, at.x, track.y, at.z, at.yaw)
    if (layer.animated) {
      const offset = index * 4
      layer.settings[offset] = row
      layer.settings[offset + 1] = row
      layer.settings[offset + 2] = 0
      layer.settings[offset + 3] = 0
    }
  }

  function inView(track: Track): boolean {
    const planes = scene.frustumPlanes
    if (!planes) {
      return true
    }
    const y = track.y + CULL.height
    for (const plane of planes) {
      if (plane.normal.x * track.x + plane.normal.y * y + plane.normal.z * track.z + plane.d < -CULL.radius) {
        return false
      }
    }
    return true
  }

  function update(): void {
    const started = performance.now()
    const now = clock()
    const frameSeconds = Math.max(0, now - lastFrame)
    lastFrame = now
    for (const layer of allLayers) {
      layer.count = 0
    }
    const turning = Math.min(1, frameSeconds * TURN_RATE)
    for (const track of drawn) {
      place(track, now)
      const clip = clipOf(track.pose.clip)
      if (track.status !== "fallen") {
        track.yaw += turn(track.yaw, track.targetYaw) * turning
      }
      track.turn += (clip.turn - track.turn) * turning
      if (!inView(track)) {
        continue
      }
      const row = poseFrame(clip, track.pose, now - track.poseStart, track.phase)
      at.x = track.x
      at.z = track.z
      at.yaw = track.yaw + track.turn
      if (track.status === "fallen") {
        // Keep the hips over the spot where he fell: a body falling back a metre lands in the trench, not its wall.
        const driftX = kit.drift[row * 2] ?? 0
        const driftZ = kit.drift[row * 2 + 1] ?? 0
        const cos = Math.cos(at.yaw)
        const sin = Math.sin(at.yaw)
        at.x -= driftX * cos + driftZ * sin
        at.z -= driftZ * cos - driftX * sin
      }
      add(layers.bodies[track.side], track, row)
      if (track.status !== "captured" && track.weapon === Weapon.Rifle) {
        add(layers.rifle, track, row)
      }
      if (track.masked && track.status !== "captured") {
        add(layers.mask, track, row)
      }
      if (track.status === "fighting" && track.weapon === Weapon.MachineGun && track.speed < MOVING_SPEED) {
        // The gun stands square to where he faces, on the ground ahead, however he kneels to it.
        const gun = claim(layers.guns[track.side])
        writeMatrix(layers.guns[track.side], gun, track, track.x, track.y + track.gunLift, track.z, track.yaw)
      }
    }
    for (const layer of allLayers) {
      flush(layer)
    }
    stats.drawn = layers.bodies[Side.French].count + layers.bodies[Side.German].count
    stats.updateMs = performance.now() - started
  }

  let renderedFrame = -1
  const observer = scene.onBeforeCameraRenderObservable.add(() => {
    // Once a frame, after the camera has moved and its view is known for culling.
    if (scene.getFrameId() !== renderedFrame) {
      renderedFrame = scene.getFrameId()
      update()
    }
  })

  return {
    sync,
    update,
    stats,
    dispose() {
      scene.onBeforeCameraRenderObservable.remove(observer)
    }
  }
}
