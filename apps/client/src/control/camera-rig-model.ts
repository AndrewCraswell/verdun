/**
 * The camera's behaviour, free of Babylon and the DOM: where it looks, how far back, from which bearing and angle, and
 * how it eases toward where the player wants it. Everything is damped exponentially, so it moves the same at any frame
 * rate and never jerks.
 */

/** Closest and furthest the camera pulls back from what it looks at, in metres. */
export const ZOOM_RANGE = { min: 8, max: 450 } as const
/**
 * Angle down from straight overhead (ArcRotateCamera's beta), close in and far out. Close in, the view drops toward a
 * soldier's-eye angle; pulled back, it tips over toward a map view.
 */
const PITCH = { close: 1.15, far: 0.5 } as const
/** How far the player can tilt either side of the zoom's natural angle, in radians. */
const TILT_RANGE = 0.3
/** Never steeper than this from overhead, nor shallower: the ground stays in view. */
const PITCH_LIMITS = { min: 0.15, max: 1.35 } as const
/** Damping rates, per second: how quickly each part of the view settles on where it's going. Higher is snappier. */
const RATES = { focus: 9, height: 5, distance: 11, yaw: 12, pitch: 10, pan: 10 } as const
/** Panning speed at full deflection, as a multiple of the zoom distance per second: the same feel at any zoom. */
const PAN_SPEED = 0.5
/** The camera keeps at least this far above the ground beneath it, in metres. */
const GROUND_CLEARANCE = 2.5
/** What the camera looks at sits this far above the ground: a man's chest, not his boots. */
const FOCUS_HEIGHT = 1.2

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
  /** Goes back to following the soldier. */
  recenter(): void
  /** Holds a pan, from -1 to 1 right and forward relative to the view, until changed. Zero stops. */
  setPan(right: number, forward: number): void
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
  /** Moves the view on by a frame. `ground` gives the terrain height at a point. */
  step(seconds: number, ground: (x: number, z: number) => number): RigView
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** How far along to move toward a target this frame, at a damping rate per second. */
function ease(rate: number, seconds: number): number {
  return 1 - Math.exp(-rate * seconds)
}

/** The natural angle down from overhead at a zoom distance: lower close in, steeper far out. */
export function pitchForDistance(distance: number): number {
  const along = Math.log(distance / ZOOM_RANGE.min) / Math.log(ZOOM_RANGE.max / ZOOM_RANGE.min)
  return PITCH.close + (PITCH.far - PITCH.close) * clamp(along, 0, 1)
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
  let distance = start.distance
  let yaw = start.yaw
  let tilt = start.pitch - pitchForDistance(start.distance)
  let pan = { right: 0, forward: 0 }
  let velocity = { x: 0, z: 0 }
  let turn = 0

  /** The ground directions to the view's right and straight ahead, for a bearing. */
  function axes(bearing: number) {
    // ArcRotateCamera sits at (cos α, sin α) from its target, so it looks along the opposite way.
    const forward = { x: -Math.cos(bearing), z: -Math.sin(bearing) }
    return { forward, right: { x: forward.z, z: -forward.x } }
  }

  function clampTarget(): void {
    target = { x: clamp(target.x, 0, bounds.width), z: clamp(target.z, 0, bounds.depth) }
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
    recenter() {
      following = true
    },
    setPan(right, forward) {
      pan = { right: clamp(right, -1, 1), forward: clamp(forward, -1, 1) }
      if (right !== 0 || forward !== 0) {
        following = false
      }
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
    step(seconds, ground) {
      yaw += turn * TURN_SPEED * seconds
      // Held pans ease in and out rather than starting and stopping dead.
      const { right, forward } = axes(yaw)
      const speed = PAN_SPEED * view.distance
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
        target = { ...followed }
        velocity = { x: 0, z: 0 }
      } else {
        target = { x: target.x + velocity.x * seconds, z: target.z + velocity.z * seconds }
      }
      clampTarget()

      const moveFocus = ease(RATES.focus, seconds)
      const focusX = view.focusX + (target.x - view.focusX) * moveFocus
      const focusZ = view.focusZ + (target.z - view.focusZ) * moveFocus
      // Average the ground around the focus, so the view glides over craters and trench lips instead of bobbing.
      const reach = 4
      const groundHere =
        (ground(focusX, focusZ) * 2 +
          ground(focusX + reach, focusZ) +
          ground(focusX - reach, focusZ) +
          ground(focusX, focusZ + reach) +
          ground(focusX, focusZ - reach)) /
        6
      const focusY = view.focusY + (groundHere + FOCUS_HEIGHT - view.focusY) * ease(RATES.height, seconds)
      const nextDistance = view.distance + (distance - view.distance) * ease(RATES.distance, seconds)
      const nextYaw = view.yaw + (yaw - view.yaw) * ease(RATES.yaw, seconds)
      let pitch = clamp(
        view.pitch + (pitchForDistance(nextDistance) + tilt - view.pitch) * ease(RATES.pitch, seconds),
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
