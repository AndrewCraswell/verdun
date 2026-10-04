import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { heightAt } from "@verdun/map"
import {
  enqueueCommand,
  type EntityId,
  isAlive,
  nextLivingMember,
  type Simulation,
  type Squad,
  Stance
} from "@verdun/sim"
import { cameraRigOf } from "./camera-rig.ts"

/** Ground-plane vector, `x` east and `z` north. */
export interface GroundVector {
  readonly x: number
  readonly z: number
}

/** A one-off command from the player, as opposed to held movement keys. */
export type PlayerAction =
  /** Take control of the next living soldier in the squad. */
  | { readonly kind: "switch-next" }
  /** Take control of the soldier in a squad slot, counting from 0. */
  | { readonly kind: "switch-slot"; readonly slot: number }
  | { readonly kind: "order-follow" }
  | { readonly kind: "order-hold" }
  /** Send the squad to a ground point. */
  | { readonly kind: "order-advance"; readonly x: number; readonly z: number }
  /** Pull the trigger: the controlled soldier fires where they aim. */
  | { readonly kind: "fire" }
  /** Blow the whistle: the whole side goes over the top. */
  | { readonly kind: "whistle" }
  /** Order a preparatory bombardment of the enemy line. */
  | { readonly kind: "bombard" }
  /** Call for artillery on a ground point. */
  | { readonly kind: "call-fire"; readonly x: number; readonly z: number }
  /** Call a gas shoot onto a ground point. */
  | { readonly kind: "call-gas"; readonly x: number; readonly z: number }
  /** Turn fog of war on or off. */
  | { readonly kind: "toggle-fog" }
  /** Lie down (and crawl), or get back up. */
  | { readonly kind: "toggle-prone" }
  /** Crouch, or stand back up. */
  | { readonly kind: "toggle-crouch" }
  /** Throw a grenade toward a ground point. */
  | { readonly kind: "grenade"; readonly x: number; readonly z: number }
  /** Dev builds only: kill the controlled soldier. */
  | { readonly kind: "debug-kill" }

/** What the player is doing right now, independent of where it comes from (keyboard, gamepad, a test). */
export interface PlayerInput {
  /** Movement and run keys held: `KeyW`, `KeyA`, `KeyS`, `KeyD`, `ShiftLeft` as `KeyboardEvent.code` values. */
  readonly held: ReadonlySet<string>
  /** Ground point under the pointer, or null when it isn't over the battlefield. */
  pointerGround(): GroundVector | null
  /** One-off actions since the last call, oldest first. */
  takeActions(): readonly PlayerAction[]
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

export interface PlayerControlOptions {
  /** Allow dev-only actions such as killing the controlled soldier. */
  readonly debugActions?: boolean
  /** What the scenario does for the side's big orders: the whistle, a bombardment, a call for fire. */
  readonly commands?: {
    readonly whistle: () => void
    readonly bombard: () => void
    readonly callFire: (x: number, z: number) => void
    /** A gas shoot on a point; absent where the scenario allows no gas. */
    readonly callGas?: (x: number, z: number) => void
  }
  /** Turns fog of war on or off. */
  readonly toggleFog?: () => void
}

export interface PlayerControl {
  readonly squad: Squad
  /** The soldier currently under the player's control: the squad's leader, or -1 once the squad is wiped out. */
  readonly soldier: EntityId
  /** Reads input, turns it into simulation commands, and moves the camera. Call once per frame. */
  update(frameSeconds: number): void
}

/**
 * Direct control of a squad. The player steers and aims the squad's leader; switching soldier makes another member the
 * leader, and when the leader falls the simulation hands command to the next. Input only ever becomes simulation
 * commands, so the player acts through the same path as bots now and networked players later.
 */
export function createPlayerControl(
  sim: Simulation,
  squad: Squad,
  camera: ArcRotateCamera,
  input: PlayerInput,
  { debugActions = false, commands, toggleFog }: PlayerControlOptions = {}
): PlayerControl {
  let lastSoldier: EntityId = -1
  let lastSteer: GroundVector = { x: 0, z: 0 }
  let lastRun = false
  let lastAim: GroundVector | null = null
  let followedSoldier: EntityId = -1
  camera.panningSensibility = 0

  function takeCommand(soldier: EntityId): void {
    if (soldier >= 0 && soldier !== squad.leader && isAlive(sim, soldier)) {
      enqueueCommand(sim, { type: "take-command", squad: squad.id, soldier })
    }
  }

  function act(action: PlayerAction): void {
    switch (action.kind) {
      case "switch-next":
        takeCommand(nextLivingMember(sim, squad, squad.leader))
        return
      case "switch-slot":
        takeCommand(squad.members[action.slot] ?? -1)
        return
      case "order-follow":
        enqueueCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "follow" } })
        return
      case "order-hold":
        enqueueCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "hold" } })
        return
      case "order-advance":
        enqueueCommand(sim, {
          type: "squad-order",
          squad: squad.id,
          order: { kind: "advance", x: action.x, z: action.z }
        })
        return
      case "fire":
        if (squad.leader >= 0) {
          enqueueCommand(sim, { type: "fire", soldier: squad.leader })
        }
        return
      case "whistle":
        commands?.whistle()
        return
      case "bombard":
        commands?.bombard()
        return
      case "call-gas":
        commands?.callGas?.(action.x, action.z)
        return
      case "call-fire":
        commands?.callFire(action.x, action.z)
        return
      case "toggle-fog":
        toggleFog?.()
        return
      case "grenade":
        if (squad.leader >= 0) {
          enqueueCommand(sim, { type: "throw-grenade", soldier: squad.leader, x: action.x, z: action.z })
        }
        return
      case "toggle-prone":
        if (squad.leader >= 0) {
          const prone = sim.soldiers.stance.value[squad.leader] === Stance.Prone
          enqueueCommand(sim, { type: "stance", soldier: squad.leader, stance: prone ? "standing" : "prone" })
        }
        return
      case "toggle-crouch":
        if (squad.leader >= 0) {
          const crouching = sim.soldiers.stance.value[squad.leader] === Stance.Crouching
          enqueueCommand(sim, { type: "stance", soldier: squad.leader, stance: crouching ? "standing" : "crouching" })
        }
        return
      case "debug-kill":
        if (debugActions && squad.leader >= 0) {
          enqueueCommand(sim, { type: "kill", soldier: squad.leader })
        }
        return
    }
  }

  return {
    squad,
    get soldier() {
      return squad.leader
    },
    update(frameSeconds) {
      for (const action of input.takeActions()) {
        act(action)
      }
      const soldier = squad.leader
      if (soldier < 0) {
        return
      }
      if (soldier !== lastSoldier) {
        // A new soldier starts standing still; resend steering and aim for them from scratch.
        lastSoldier = soldier
        lastSteer = { x: 0, z: 0 }
        lastRun = false
        lastAim = null
      }

      const steer = steerFromKeys(input.held, camera.alpha)
      const moving = steer.x !== 0 || steer.z !== 0
      const run = moving && (input.held.has("ShiftLeft") || input.held.has("ShiftRight"))
      if (run && !lastRun && sim.soldiers.stance.value[soldier] !== Stance.Standing) {
        // Breaking into a run gets a man up off his knees or his belly.
        enqueueCommand(sim, { type: "stance", soldier, stance: "standing" })
      }
      if (steer.x !== lastSteer.x || steer.z !== lastSteer.z || run !== lastRun) {
        enqueueCommand(sim, { type: "steer", soldier, ...steer, run })
        lastSteer = steer
        lastRun = run
      }

      const x = sim.soldiers.position.x[soldier]
      const z = sim.soldiers.position.z[soldier]
      const pointer = input.pointerGround()
      const aim = pointer ? aimToward({ x, z }, pointer) : null
      if (aim && (!lastAim || (aim.x - lastAim.x) ** 2 + (aim.z - lastAim.z) ** 2 > AIM_EPSILON)) {
        enqueueCommand(sim, { type: "face", soldier, ...aim })
        lastAim = aim
      }

      const rig = cameraRigOf(camera)
      if (rig) {
        // Moving the soldier brings the camera back to them, as does switching to another.
        if (steer.x !== 0 || steer.z !== 0 || soldier !== followedSoldier) {
          rig.recenter()
        }
        followedSoldier = soldier
        // The way he's walking, not the way he faces: the pointer turns him, and a view led by his facing would slide
        // the ground under a still pointer and turn him again.
        rig.follow(x, z, steer)
        return
      }
      const blend = 1 - Math.exp(-FOLLOW_RATE * frameSeconds)
      const target = camera.target
      target.x += (x - target.x) * blend
      target.y += (heightAt(sim.map, x, z) + FOLLOW_HEIGHT - target.y) * blend
      target.z += (z - target.z) * blend
    }
  }
}
