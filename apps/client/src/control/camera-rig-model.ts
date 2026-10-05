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
  let view: RigView = start
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
    const across = 2 * view.distance * Math.tan(lens.fov / 2) * lens.aspect
    const cap = LEAN.cap * across
    const offset = groundOffset(view, lens, pointer, cap / LEAN.share)
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
      const speed = PAN_SPEED * panMultiple * view.distance
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
      const focusX = approach(view.focusX, target.x, moveFocus)
      const focusZ = approach(view.focusZ, target.z, moveFocus)
      // Average the ground around the focus, so the view glides over craters and trench lips instead of bobbing.
      const reach = 4
      const groundHere =
        (ground(focusX, focusZ) * 2 +
          ground(focusX + reach, focusZ) +
          ground(focusX - reach, focusZ) +
          ground(focusX, focusZ + reach) +
          ground(focusX, focusZ - reach)) /
        6
      const focusY = approach(view.focusY, groundHere + FOCUS_HEIGHT, ease(RATES.height, seconds))
      const wantedDistance = gunView ? Math.max(distance, GUN_VIEW.distance) : distance
      const nextDistance = approach(view.distance, wantedDistance, ease(RATES.distance, seconds))
      const nextYaw = approach(view.yaw, yaw, ease(RATES.yaw, seconds))
      let pitch = clamp(
        approach(
          view.pitch,
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
      view = { focusX, focusY, focusZ, distance: nextDistance, yaw: nextYaw, pitch }
      return view
    }
  }
}
