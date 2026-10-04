import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { heightAt } from "@verdun/map"
import { enqueueCommand, type EntityId, type Simulation } from "@verdun/sim"

/** Ground-plane vector, `x` east and `z` north. */
export interface GroundVector {
  readonly x: number
  readonly z: number
}

/** What the player is doing right now, independent of where it comes from (keyboard, gamepad, a test). */
export interface PlayerInput {
  /** Movement keys held: `KeyW`, `KeyA`, `KeyS`, `KeyD` as `KeyboardEvent.code` values. */
  readonly held: ReadonlySet<string>
  /** Ground point under the pointer, or null when it isn't over the battlefield. */
  pointerGround(): GroundVector | null
}

/**
 * Turns WASD into a ground-plane direction relative to the camera: W walks away from the camera, D to its right.
 * Returns a unit vector, or zero when no direction (or opposing keys) is held.
 */
export function steerFromKeys(held: ReadonlySet<string>, cameraAlpha: number): GroundVector {
  const forwardKeys = (held.has("KeyW") ? 1 : 0) - (held.has("KeyS") ? 1 : 0)
  const rightKeys = (held.has("KeyD") ? 1 : 0) - (held.has("KeyA") ? 1 : 0)
  if (forwardKeys === 0 && rightKeys === 0) {
    return { x: 0, z: 0 }
  }
  // An ArcRotateCamera sits at (cos alpha, sin alpha) from its target, so it looks along the opposite direction.
  const forward = { x: -Math.cos(cameraAlpha), z: -Math.sin(cameraAlpha) }
  const right = { x: forward.z, z: -forward.x }
  const x = forward.x * forwardKeys + right.x * rightKeys
  const z = forward.z * forwardKeys + right.z * rightKeys
  const length = Math.hypot(x, z)
  return { x: x / length, z: z / length }
}

/** Unit direction from a soldier to the aimed ground point, or null when the point is on top of the soldier. */
export function aimToward(from: GroundVector, target: GroundVector): GroundVector | null {
  const dx = target.x - from.x
  const dz = target.z - from.z
  const length = Math.hypot(dx, dz)
  return length < 0.25 ? null : { x: dx / length, z: dz / length }
}

/** Aim changes smaller than about one degree aren't worth a command. */
const AIM_EPSILON = 0.0002
/** How quickly the camera catches up with the soldier, per second. Higher is snappier. */
const FOLLOW_RATE = 6
/** The camera looks at chest height, not the ground under the soldier's boots. */
const FOLLOW_HEIGHT = 1.2

export interface PlayerControl {
  readonly soldier: EntityId
  /** Reads input, sends steer and face commands when they change, and moves the camera. Call once per frame. */
  update(frameSeconds: number): void
}

/**
 * Direct control of one soldier. Input becomes simulation commands, so the player's soldier moves through exactly the
 * same path as bots now and networked players later.
 */
export function createPlayerControl(
  sim: Simulation,
  soldier: EntityId,
  camera: ArcRotateCamera,
  input: PlayerInput
): PlayerControl {
  let lastSteer: GroundVector = { x: 0, z: 0 }
  let lastAim: GroundVector | null = null
  camera.panningSensibility = 0

  return {
    soldier,
    update(frameSeconds) {
      const steer = steerFromKeys(input.held, camera.alpha)
      if (steer.x !== lastSteer.x || steer.z !== lastSteer.z) {
        enqueueCommand(sim, { type: "steer", soldier, ...steer })
        lastSteer = steer
      }

      const x = sim.soldiers.position.x[soldier]
      const z = sim.soldiers.position.z[soldier]
      const pointer = input.pointerGround()
      const aim = pointer ? aimToward({ x, z }, pointer) : null
      if (aim && (!lastAim || (aim.x - lastAim.x) ** 2 + (aim.z - lastAim.z) ** 2 > AIM_EPSILON)) {
        enqueueCommand(sim, { type: "face", soldier, ...aim })
        lastAim = aim
      }

      const blend = 1 - Math.exp(-FOLLOW_RATE * frameSeconds)
      const target = camera.target
      target.x += (x - target.x) * blend
      target.y += (heightAt(sim.map, x, z) + FOLLOW_HEIGHT - target.y) * blend
      target.z += (z - target.z) * blend
    }
  }
}
