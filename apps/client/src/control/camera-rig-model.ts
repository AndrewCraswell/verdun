/**
 * The camera's behaviour, free of Babylon and the DOM: where it looks, how far back, from which bearing and angle, and
 * how it eases toward where the player wants it. Everything is damped exponentially, so it moves the same at any frame
 * rate and never jerks.
 */

/** Closest and furthest the camera pulls back from what it looks at, in metres. */
export const ZOOM_RANGE = { min: 8, max: 450 } as const
/**
 * Angle down from straight overhead (ArcRotateCamera's beta). Through the zooms a soldier is played from it is the
 * vision's 55° below the horizon (`field`); only close in, under `closeFrom` metres, does it drop toward `close`, and
 * pulled back past `mapFrom` it tips over toward `map`, a map view.
 */
const PITCH = { field: 0.61, close: 0.85, map: 0.5, closeFrom: 16, mapFrom: 90 } as const
/** How far the player can tilt either side of the zoom's natural angle, in radians. */
const TILT_RANGE = 0.3
/** Never steeper than this from overhead, nor shallower: the ground stays in view. */
const PITCH_LIMITS = { min: 0.15, max: 1.35 } as const
/** Damping rates, per second: how quickly each part of the view settles on where it's going. Higher is snappier. */
const RATES = { focus: 9, height: 5, distance: 11, yaw: 12, pitch: 10, pan: 10, lean: 4 } as const
/** Panning speed at full deflection, as a multiple of the zoom distance per second: the same feel at any zoom. */
const PAN_SPEED = 0.5
/** The camera keeps at least this far above the ground beneath it, in metres. */
const GROUND_CLEARANCE = 2.5
/** What the camera looks at sits this far above the ground: a man's chest, not his boots. */
const FOCUS_HEIGHT = 1.2
/**
 * While following, the view leans toward the pointer, as Running With Rifles extends the view toward it: its middle
 * moves `share` of the way from where it would be toward the ground under the pointer's place on the screen, which
 * settles with the middle a third of the way from the soldier to what the pointer is over. It comes from where the
 * pointer sits on the screen, which the view moving doesn't change, so it settles rather than chasing itself. It goes
 * no further than `cap` of the ground the screen shows across, so the soldier stays well on the screen.
 */
const LEAN = { share: 0.5, cap: 0.35 } as const
/**
 * Manning a machine gun, the view rises and looks down along the ground the gun sweeps: at least this far back, in
 * metres, and at this angle from overhead, a little lower than the field view's, so the gunner sees men coming across
 * the open well before they're on him.
 */
const GUN_VIEW = { distance: 45, pitch: 0.75 } as const
/**
 * The aim view, while the right button is held: the camera behind the soldier's right shoulder, `back` metres behind his
 * eye along the aim, `right` to his right and `up` above it, looking along the aim (at a point `reach` metres on, which
 * keeps the camera's own limits happy). It swings in and out over `seconds`. The aim tilts between `lowest` and
 * `highest` radians from level, and the camera keeps `clearance` metres above the ground between his eye and it.
 */
const AIM_VIEW = {
  back: 1.4,
  right: 0.45,
  up: 0.25,
  reach: 8,
  seconds: 0.25,
  lowest: -0.6,
  highest: 0.45,
  clearance: 0.15
} as const
/** Points along the line from his eye to the camera checked against the ground. */
const AIM_CLEARANCE_SAMPLES = 12

/** The camera's lens: its field of view top to bottom, in radians, and the screen's width over its height. */
export interface Lens {
  readonly fov: number
  readonly aspect: number
}

/** Babylon's usual field of view on a wide screen: the lens until the rig says otherwise. */
const DEFAULT_LENS: Lens = { fov: 0.8, aspect: 16 / 9 }

/** A place on the screen, from -1 to 1: from the middle to the right edge, and to the top edge. */
export interface ScreenPoint {
  readonly right: number
  readonly up: number
}

/** A point in the world, in metres: `x` east, `y` up, `z` north. */
export interface WorldPoint {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** The soldier the aim view sits behind. */
export interface Shoulder {
  readonly eye: WorldPoint
  /** The way he faces on the ground, a unit vector: where the aim starts from. */
  readonly facing: { readonly x: number; readonly z: number }
  /** How many times his sights magnify: the aim view's field of view narrows by this. */
  readonly magnification: number
}

/** Where the aim view looks. */
export interface Aim {
  /** The aim's bearing, as the alpha of an ArcRotateCamera looking along it: it faces (-cos yaw, -sin yaw). */
  readonly yaw: number
  /** Up from level, in radians. */
  readonly pitch: number
}

export interface RigView {
  readonly focusX: number
  readonly focusY: number
  readonly focusZ: number
  readonly distance: number
  /** Bearing around the focus, as ArcRotateCamera's alpha. */
  readonly yaw: number
  /** Angle down from overhead, as ArcRotateCamera's beta. */
  readonly pitch: number
}

export interface RigBounds {
  readonly width: number
  readonly depth: number
}

export interface CameraRigModel {
  /** The view as it is now. */
  readonly view: RigView
  /** Whether the camera is following the soldier under control. Panning lets go; recentring takes hold again. */
  readonly following: boolean
  /** Where the followed soldier is now. Call every frame; ignored while panning freely. */
  follow(x: number, z: number): void
  /**
   * Where the pointer sits on the screen: while following, the view leans toward the ground under it. Null leans back
   * to the soldier.
   */
  setPointer(pointer: ScreenPoint | null): void
  /** The camera's lens, which the lean is worked out through. */
  setLens(lens: Lens): void
  /** Goes back to following the soldier. */
  recenter(): void
  /** Holds a pan, from -1 to 1 right and forward relative to the view, until changed. Zero stops. */
  setPan(right: number, forward: number): void
  /** Pans faster or slower than the usual, by this multiple: the player's setting. */
  setPanSpeed(multiple: number): void
  /** Drags the ground by this many metres, right and forward relative to the view: grabbing the map. */
  drag(right: number, forward: number): void
  /** Turns the view around the focus, and tilts it, in radians. */
  rotate(yaw: number, tilt: number): void
  /** Holds a turn, from -1 to 1, until changed: radians a second at full deflection. */
  setTurn(rate: number): void
  /** Zooms by wheel notches, in or out, toward a ground point when given (only while panning freely). */
  zoom(notches: number, toward?: { readonly x: number; readonly z: number }): void
  /** Jumps the zoom to a distance, as if the player had zoomed there. */
  setDistance(distance: number): void
  /** Rises to the gun's view while the soldier mans a machine gun, and comes back down to the zoom when he leaves it. */
  setGunView(on: boolean): void
  /** The soldier under control, for the aim view to sit behind; null without one. Call every frame. */
  setShoulder(shoulder: Shoulder | null): void
  /**
   * Holds the aim view while on (the right button): the camera swings behind his shoulder and looks the way he faces,
   * and the field view goes back to following him. Off swings back out to the field view.
   */
  holdAim(on: boolean): void
  /** Turns the aim by radians, right and up. Only in the aim view. */
  turnAim(right: number, up: number): void
  /** Where the aim view looks while it's held over a soldier, or null in the field view. */
  readonly aim: Aim | null
  /** How far the camera has swung into the aim view: 0 in the field view, 1 behind his shoulder. */
  readonly aimShare: number
  /** How many times the camera magnifies now: 1 in the field view, his sights' behind his shoulder. */
  readonly magnification: number
  /** Moves the view on by a frame. `ground` gives the terrain height at a point. */
  step(seconds: number, ground: (x: number, z: number) => number): RigView
}

/**
 * Easing that's this close to where it's going, in metres or radians, arrives: exponential damping would otherwise creep
 * on by fractions of a millimetre for seconds, and a view that never quite stops can't be replayed (snapshot rendering).
 */
const ARRIVED = 0.0005

/** Moves `from` toward `to` by a share, landing on it once within `ARRIVED`. */
function approach(from: number, to: number, share: number): number {
  const next = from + (to - from) * share
  return Math.abs(to - next) < ARRIVED ? to : next
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** How far along to move toward a target this frame, at a damping rate per second. */
function ease(rate: number, seconds: number): number {
  return 1 - Math.exp(-rate * seconds)
}

/** Eases from 0 to 1 and back without a jolt at either end. */
function smoothstep(value: number): number {
  const t = clamp(value, 0, 1)
  return t * t * (3 - 2 * t)
}

/**
 * The natural angle down from overhead at a zoom distance: the vision's 55° through the distances a soldier is played
 * from, dropping a little toward the ground only close in, and tipping over toward a map view well out.
 */
export function pitchForDistance(distance: number): number {
  if (distance < PITCH.closeFrom) {
    const near = clamp((PITCH.closeFrom - distance) / (PITCH.closeFrom - ZOOM_RANGE.min), 0, 1)
    return PITCH.field + (PITCH.close - PITCH.field) * near * near
  }
  const out = Math.log(distance / PITCH.mapFrom) / Math.log(ZOOM_RANGE.max / PITCH.mapFrom)
  return PITCH.field + (PITCH.map - PITCH.field) * smoothstep(out)
}

/** An angle brought within half a turn either side of zero. */
function wrap(angle: number): number {
  return angle - 2 * Math.PI * Math.round(angle / (2 * Math.PI))
}

/** The bearing, as an ArcRotateCamera's alpha, of a camera looking along a ground direction. */
function yawLookingAlong(direction: { readonly x: number; readonly z: number }): number {
  return Math.atan2(-direction.z, -direction.x)
}

/**
 * The aim view's camera and the point it looks at, behind the shoulder of a man with his eye at `eye`, pulled in toward
 * his eye where the ground rises into the line between them.
 */
function shoulderView(
  eye: WorldPoint,
  aim: Aim,
  ground: (x: number, z: number) => number
): { camera: WorldPoint; target: WorldPoint } {
  const level = Math.cos(aim.pitch)
  const look = { x: -Math.cos(aim.yaw) * level, y: Math.sin(aim.pitch), z: -Math.sin(aim.yaw) * level }
  const { right } = axes(aim.yaw)
  const wanted = {
    x: eye.x - look.x * AIM_VIEW.back + right.x * AIM_VIEW.right,
    y: eye.y - look.y * AIM_VIEW.back + AIM_VIEW.up,
    z: eye.z - look.z * AIM_VIEW.back + right.z * AIM_VIEW.right
  }
  let reach = 1
  for (let sample = 1; sample <= AIM_CLEARANCE_SAMPLES; sample++) {
    const t = sample / AIM_CLEARANCE_SAMPLES
    const x = eye.x + (wanted.x - eye.x) * t
    const z = eye.z + (wanted.z - eye.z) * t
    if (ground(x, z) + AIM_VIEW.clearance > eye.y + (wanted.y - eye.y) * t) {
      reach = (sample - 1) / AIM_CLEARANCE_SAMPLES
      break
    }
  }
  const camera = {
    x: eye.x + (wanted.x - eye.x) * reach,
    y: eye.y + (wanted.y - eye.y) * reach,
    z: eye.z + (wanted.z - eye.z) * reach
  }
  const target = {
    x: camera.x + look.x * AIM_VIEW.reach,
    y: camera.y + look.y * AIM_VIEW.reach,
    z: camera.z + look.z * AIM_VIEW.reach
  }
  return { camera, target }
}

/** Where a view's camera sits: (cos α sin β, cos β, sin α sin β) from its focus, `distance` away. */
function cameraOf(view: RigView): WorldPoint {
  const across = view.distance * Math.sin(view.pitch)
  return {
    x: view.focusX + Math.cos(view.yaw) * across,
    y: view.focusY + view.distance * Math.cos(view.pitch),
    z: view.focusZ + Math.sin(view.yaw) * across
  }
}

/** The ground directions to the view's right and straight ahead, for a bearing. */
function axes(bearing: number) {
  // ArcRotateCamera sits at (cos α, sin α) from its target, so it looks along the opposite way.
  const forward = { x: -Math.cos(bearing), z: -Math.sin(bearing) }
  return { forward, right: { x: forward.z, z: -forward.x } }
}

/**
 * Where the ray through a place on the screen meets level ground at the focus's height, from the focus, in metres east
 * and north. A ray at or above the horizon reaches `far` metres along the ground its way.
 */
function groundOffset(view: RigView, lens: Lens, at: ScreenPoint, far: number): { x: number; z: number } {
  const { yaw, pitch, distance } = view
  const sinPitch = Math.sin(pitch)
  const cosPitch = Math.cos(pitch)
  // The camera sits at (cos α sin β, cos β, sin α sin β) from its focus and looks back at it.
  const look = { x: -Math.cos(yaw) * sinPitch, y: -cosPitch, z: -Math.sin(yaw) * sinPitch }
  const up = { x: -Math.cos(yaw) * cosPitch, y: sinPitch, z: -Math.sin(yaw) * cosPitch }
  const { right } = axes(yaw)
  const half = Math.tan(lens.fov / 2)
  const ray = {
    x: look.x + up.x * at.up * half + right.x * at.right * half * lens.aspect,
    y: look.y + up.y * at.up * half,
    z: look.z + up.z * at.up * half + right.z * at.right * half * lens.aspect
  }
  const eye = { x: -look.x * distance, y: -look.y * distance, z: -look.z * distance }
  if (ray.y > -1e-4) {
    const flat = Math.hypot(ray.x, ray.z) || 1
    return { x: (ray.x / flat) * far, z: (ray.z / flat) * far }
  }
  const along = -eye.y / ray.y
  return { x: eye.x + ray.x * along, z: eye.z + ray.z * along }
}

/** Turning speed at full deflection of the turn keys, in radians a second. */
const TURN_SPEED = 1.6
/** Each wheel notch zooms by this factor. */
const ZOOM_PER_NOTCH = 1.12

export function createCameraRigModel(bounds: RigBounds, start: RigView): CameraRigModel {
  // The field view, eased on from frame to frame; `view` is what's shown, swung toward the aim view while it's held.
  let field: RigView = start
  let view: RigView = start
  let shoulder: Shoulder | null = null
  let aimHeld = false
  let aim: Aim | null = null
  // The aim the view last looked along, which it swings back out from once the button's let go.
  let lastAim: Aim = { yaw: start.yaw, pitch: 0 }
  let aimShare = 0
  let following = true
  let target = { x: start.focusX, z: start.focusZ }
  let followed = { x: start.focusX, z: start.focusZ }
  let pointer: ScreenPoint | null = null
  let lens = DEFAULT_LENS
  let lean = { x: 0, z: 0 }
  let distance = start.distance
  let yaw = start.yaw
  // The player's tilt either side of the zoom's angle: none to begin with, whatever angle the camera was made at.
  let tilt = 0
  let pan = { right: 0, forward: 0 }
  let panMultiple = 1
  let velocity = { x: 0, z: 0 }
  let turn = 0
  let gunView = false

  function clampTarget(): void {
    target = { x: clamp(target.x, 0, bounds.width), z: clamp(target.z, 0, bounds.depth) }
  }

  /** How far the view leans from the soldier toward the ground under the pointer, as things stand. */
  function wantedLean(): { x: number; z: number } {
    if (!pointer) {
      return { x: 0, z: 0 }
    }
    const across = 2 * field.distance * Math.tan(lens.fov / 2) * lens.aspect
    const cap = LEAN.cap * across
    const offset = groundOffset(field, lens, pointer, cap / LEAN.share)
    const wanted = { x: offset.x * LEAN.share, z: offset.z * LEAN.share }
    const length = Math.hypot(wanted.x, wanted.z)
    return length > cap ? { x: (wanted.x / length) * cap, z: (wanted.z / length) * cap } : wanted
  }

  return {
    get view() {
      return view
    },
    get following() {
      return following
    },
    get aim() {
      return aim
    },
    get aimShare() {
      return aimShare
    },
    get magnification() {
      return 1 + ((shoulder?.magnification ?? 1) - 1) * smoothstep(aimShare)
    },
    setShoulder(next) {
      shoulder = next
      if (!shoulder) {
        aim = null
      } else if (aimHeld && !aim) {
        aim = { yaw: yawLookingAlong(shoulder.facing), pitch: 0 }
        following = true
      }
    },
    holdAim(on) {
      aimHeld = on
      if (!on) {
        aim = null
      } else if (shoulder && !aim) {
        aim = { yaw: yawLookingAlong(shoulder.facing), pitch: 0 }
        following = true
      }
    },
    turnAim(right, up) {
      if (aim) {
        aim = { yaw: aim.yaw - right, pitch: clamp(aim.pitch + up, AIM_VIEW.lowest, AIM_VIEW.highest) }
      }
    },
    follow(x, z) {
      followed = { x, z }
    },
    setPointer(at) {
      pointer = at ? { right: clamp(at.right, -1, 1), up: clamp(at.up, -1, 1) } : null
    },
    setLens(next) {
      if (next.fov > 0 && next.aspect > 0) {
        lens = { fov: next.fov, aspect: next.aspect }
      }
    },
    recenter() {
      following = true
    },
    setPan(right, forward) {
      pan = { right: clamp(right, -1, 1), forward: clamp(forward, -1, 1) }
      if (right !== 0 || forward !== 0) {
        following = false
      }
    },
    setPanSpeed(multiple) {
      panMultiple = Number.isFinite(multiple) && multiple > 0 ? multiple : 1
    },
    drag(right, forward) {
      if (right === 0 && forward === 0) {
        return
      }
      following = false
      const { right: r, forward: f } = axes(yaw)
      target = { x: target.x + r.x * right + f.x * forward, z: target.z + r.z * right + f.z * forward }
      clampTarget()
    },
    rotate(turnBy, tiltBy) {
      yaw += turnBy
      tilt = clamp(tilt + tiltBy, -TILT_RANGE, TILT_RANGE)
    },
    setTurn(rate) {
      turn = clamp(rate, -1, 1)
    },
    zoom(notches, toward) {
      const before = distance
      distance = clamp(distance * ZOOM_PER_NOTCH ** notches, ZOOM_RANGE.min, ZOOM_RANGE.max)
      if (toward && !following) {
        // Like a map: the ground under the cursor stays under the cursor.
        const pull = 1 - distance / before
        target = { x: target.x + (toward.x - target.x) * pull, z: target.z + (toward.z - target.z) * pull }
        clampTarget()
      }
    },
    setDistance(next) {
      distance = clamp(next, ZOOM_RANGE.min, ZOOM_RANGE.max)
    },
    setGunView(on) {
      gunView = on
    },
    step(seconds, ground) {
      yaw += turn * TURN_SPEED * seconds
      // Held pans ease in and out rather than starting and stopping dead.
      const { right, forward } = axes(yaw)
      const speed = PAN_SPEED * panMultiple * field.distance
      const wanted = {
        x: (right.x * pan.right + forward.x * pan.forward) * speed,
        z: (right.z * pan.right + forward.z * pan.forward) * speed
      }
      const accelerate = ease(RATES.pan, seconds)
      velocity = {
        x: velocity.x + (wanted.x - velocity.x) * accelerate,
        z: velocity.z + (wanted.z - velocity.z) * accelerate
      }
      if (following) {
        const toward = wantedLean()
        const swing = ease(RATES.lean, seconds)
        lean = { x: approach(lean.x, toward.x, swing), z: approach(lean.z, toward.z, swing) }
        target = { x: followed.x + lean.x, z: followed.z + lean.z }
        velocity = { x: 0, z: 0 }
      } else {
        target = { x: target.x + velocity.x * seconds, z: target.z + velocity.z * seconds }
      }
      clampTarget()

      const moveFocus = ease(RATES.focus, seconds)
      const focusX = approach(field.focusX, target.x, moveFocus)
      const focusZ = approach(field.focusZ, target.z, moveFocus)
      // Average the ground around the focus, so the view glides over craters and trench lips instead of bobbing.
      const reach = 4
      const groundHere =
        (ground(focusX, focusZ) * 2 +
          ground(focusX + reach, focusZ) +
          ground(focusX - reach, focusZ) +
          ground(focusX, focusZ + reach) +
          ground(focusX, focusZ - reach)) /
        6
      const focusY = approach(field.focusY, groundHere + FOCUS_HEIGHT, ease(RATES.height, seconds))
      const wantedDistance = gunView ? Math.max(distance, GUN_VIEW.distance) : distance
      const nextDistance = approach(field.distance, wantedDistance, ease(RATES.distance, seconds))
      const nextYaw = approach(field.yaw, yaw, ease(RATES.yaw, seconds))
      let pitch = clamp(
        approach(
          field.pitch,
          (gunView ? GUN_VIEW.pitch : pitchForDistance(nextDistance)) + tilt,
          ease(RATES.pitch, seconds)
        ),
        PITCH_LIMITS.min,
        PITCH_LIMITS.max
      )
      // Keep the camera above the ground behind it: tip toward overhead until it clears.
      for (let attempt = 0; attempt < 4; attempt++) {
        const back = nextDistance * Math.sin(pitch)
        const cameraX = focusX + Math.cos(nextYaw) * back
        const cameraZ = focusZ + Math.sin(nextYaw) * back
        const floor = ground(cameraX, cameraZ) + GROUND_CLEARANCE
        const cameraY = focusY + nextDistance * Math.cos(pitch)
        if (cameraY >= floor) {
          break
        }
        pitch = Math.max(PITCH_LIMITS.min, Math.acos(clamp((floor - focusY) / nextDistance, -1, 1)))
      }
      field = { focusX, focusY, focusZ, distance: nextDistance, yaw: nextYaw, pitch }

      // Swing toward the aim view while it's held, and back out of it, at an even pace eased at both ends.
      const swingTo = aim && shoulder ? 1 : 0
      const swing = seconds / AIM_VIEW.seconds
      aimShare = swingTo > aimShare ? Math.min(swingTo, aimShare + swing) : Math.max(swingTo, aimShare - swing)
      if (aimShare === 0 || !shoulder) {
        aimShare = 0
        view = field
        return view
      }
      if (aim) {
        lastAim = aim
      }
      const behind = shoulderView(shoulder.eye, lastAim, ground)
      const blend = smoothstep(aimShare)
      const mix = (from: WorldPoint, to: WorldPoint): WorldPoint => ({
        x: from.x + (to.x - from.x) * blend,
        y: from.y + (to.y - from.y) * blend,
        z: from.z + (to.z - from.z) * blend
      })
      const eye = mix(cameraOf(field), behind.camera)
      const at = mix({ x: field.focusX, y: field.focusY, z: field.focusZ }, behind.target)
      const offset = { x: eye.x - at.x, y: eye.y - at.y, z: eye.z - at.z }
      const length = Math.max(1e-3, Math.hypot(offset.x, offset.y, offset.z))
      view = {
        focusX: at.x,
        focusY: at.y,
        focusZ: at.z,
        distance: length,
        // Kept within half a turn of the field view's bearing, so the angle never jumps a whole turn.
        yaw: field.yaw + wrap(Math.atan2(offset.z, offset.x) - field.yaw),
        pitch: Math.acos(clamp(offset.y / length, -1, 1))
      }
      return view
    }
  }
}
