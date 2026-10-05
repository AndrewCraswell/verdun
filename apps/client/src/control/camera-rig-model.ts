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
const PITCH = { close: 1.25, far: 0.5, curve: 1.6 } as const
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
/**
 * While following, the view leads a soldier on the move the way he's going, by this share of the zoom distance up to a
 * limit in metres, so he sees what he's walking into. Standing, he's in the middle. It follows where he goes, never
 * where he faces: the pointer turns him, and a view that swung with his facing would slide the ground under a still
 * pointer and turn him again.
 */
const WALK_LEAD = { share: 0.12, max: 20 } as const
/**
 * Aiming, the view leans toward the pointer: at the screen's edge by this share of the zoom distance, up to a limit in
 * metres. The lean comes from where the pointer sits on the screen, which the view moving doesn't change, so it settles
 * rather than chasing itself.
 */
const AIM_LEAN = { share: 0.45, max: 100 } as const
/**
 * Close in, the view looks past the soldier it follows: its middle sits ahead of him, the way the view faces, by this
 * share of the zoom distance, so he stands low on the screen with the ground in front of him above. Fully so within
 * `full` metres of zoom, fading to nothing by `none`, where the view is a map. Along the view rather than his facing,
 * for the same reason the walking lead is: it mustn't slide the ground under the pointer as he turns.
 */
const LOOK_AHEAD = { share: 0.3, full: 25, none: 120 } as const

/** How far ahead of the followed soldier the view looks, in metres, at a zoom distance. */
export function lookAhead(distance: number): number {
  const fade = clamp((LOOK_AHEAD.none - distance) / (LOOK_AHEAD.none - LOOK_AHEAD.full), 0, 1)
  return LOOK_AHEAD.share * distance * fade
}
/**
 * Manning a machine gun, the view rises and looks down along the ground the gun sweeps: at least this far back, in
 * metres, and this far down from overhead, so the gunner sees men coming across the open well before they're on him.
 */
const GUN_VIEW = { distance: 45, pitch: 0.8 } as const
/** How quickly the lead swings round, per second: aiming answers faster than walking. */
const LEAD_RATE = { walk: 2.5, aim: 4 } as const

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
  /**
   * Where the followed soldier is now, and the way they're walking on the ground (a unit vector, or none). Call every
   * frame; ignored while panning freely.
   */
  follow(x: number, z: number, moving?: { readonly x: number; readonly z: number }): void
  /**
   * Aims, leaning the view toward the pointer, from where it sits on the screen: -1 to 1 from the middle to the right
   * edge and to the top edge. Null stops aiming. Aiming goes back to following the soldier.
   */
  setAim(pointer: { readonly right: number; readonly up: number } | null): void
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

/**
 * The natural angle down from overhead at a zoom distance: lower close in, steeper far out. It stays low through the
 * middle distances a soldier is followed from, so the top of the screen reaches out across no man's land, and only
 * tips over into a map view well out.
 */
export function pitchForDistance(distance: number): number {
  const along = Math.log(distance / ZOOM_RANGE.min) / Math.log(ZOOM_RANGE.max / ZOOM_RANGE.min)
  return PITCH.close + (PITCH.far - PITCH.close) * clamp(along, 0, 1) ** PITCH.curve
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
  let moving = { x: 0, z: 0 }
  let aim: { right: number; up: number } | null = null
  let lead = { x: 0, z: 0 }
  let distance = start.distance
  let yaw = start.yaw
  let tilt = start.pitch - pitchForDistance(start.distance)
  let pan = { right: 0, forward: 0 }
  let panMultiple = 1
  let velocity = { x: 0, z: 0 }
  let turn = 0
  let gunView = false

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
    follow(x, z, going) {
      followed = { x, z }
      moving = going ? { x: going.x, z: going.z } : { x: 0, z: 0 }
    },
    setAim(pointer) {
      aim = pointer ? { right: clamp(pointer.right, -1, 1), up: clamp(pointer.up, -1, 1) } : null
      if (aim) {
        following = true
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
        let wantedLead: { x: number; z: number }
        if (aim) {
          const reach = Math.min(AIM_LEAN.max, AIM_LEAN.share * view.distance)
          wantedLead = {
            x: (right.x * aim.right + forward.x * aim.up) * reach,
            z: (right.z * aim.right + forward.z * aim.up) * reach
          }
        } else {
          const reach = Math.min(WALK_LEAD.max, WALK_LEAD.share * view.distance)
          wantedLead = { x: moving.x * reach, z: moving.z * reach }
        }
        const swing = ease(aim ? LEAD_RATE.aim : LEAD_RATE.walk, seconds)
        const ahead = lookAhead(view.distance)
        wantedLead = { x: wantedLead.x + forward.x * ahead, z: wantedLead.z + forward.z * ahead }
        lead = { x: approach(lead.x, wantedLead.x, swing), z: approach(lead.z, wantedLead.z, swing) }
        target = { x: followed.x + lead.x, z: followed.z + lead.z }
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
