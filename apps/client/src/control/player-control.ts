import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { Matrix } from "@babylonjs/core/Maths/math.vector"
import { heightAt } from "@verdun/map"
import {
  canCut,
  enqueueCommand,
  type EntityId,
  gunPartner,
  isAlive,
  isCutting,
  nextLivingMember,
  type Simulation,
  type Squad,
  Stance,
  soldierEye,
  soldierIds,
  takeOverCandidates,
  Weapon
} from "@verdun/sim"
import { type CallKind, callEndangers } from "../hud/fire-preview.ts"
import { interfaceSettings } from "../hud/interface-settings.ts"
import { planFires } from "../hud/operation-state.ts"
import { actionHeading, noteActionHeading } from "./action-heading.ts"
import { cameraRigOf } from "./camera-rig.ts"
import { type OnScreen, PICK_RADIUS, pickOnScreen } from "./target-pick.ts"

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
  /** Climb the fence or wall ahead, or man (or leave) the machine gun beside the controlled soldier. */
  | { readonly kind: "act" }
  /** Reload the controlled soldier's weapon before it's empty. It reloads by itself when it is. */
  | { readonly kind: "reload" }
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
  /**
   * With the squad wiped out, take over the men of a bot squad that can be handed over: the one with id `squad` if it's
   * one of `takeOverCandidates`, otherwise the nearest.
   */
  | { readonly kind: "take-over"; readonly squad?: number }

/** What the player is doing right now, independent of where it comes from (keyboard, gamepad, a test). */
export interface PlayerInput {
  /** Movement and run keys held: `KeyW`, `KeyA`, `KeyS`, `KeyD`, `ShiftLeft` as `KeyboardEvent.code` values. */
  readonly held: ReadonlySet<string>
  /** Whether the trigger is held down: a machine gun keeps firing while it is. */
  readonly firing?: boolean
  /** Ground point under the pointer, or null when it isn't over the battlefield. */
  pointerGround(): GroundVector | null
  /**
   * Where the game picks from on the canvas, in CSS pixels from its top left: the pointer, or the middle of the screen
   * in the aim view.
   */
  pointerScreen?(): { readonly x: number; readonly y: number }
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

/** The keys `steerFromKeys` reads, in a fixed order. */
const STEER_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD"] as const

/** How many times a weapon's sights magnify in the aim view: a scoped rifle's five, a machine gun's one and a half. */
/**
 * What the action key does for a man, as the HUD's prompt says it (hud/soldier-state.ts): take over or hand back a
 * machine gun beside him; stop cutting wire; down at the wire, crouched or prone, cut a lane through it, as wire
 * cutters went up to it; else climb the fence or wall ahead.
 */
function actionCommand(sim: Simulation, soldier: EntityId): "man-gun" | "vault" | "cut-wire" {
  if (gunPartner(sim, soldier) >= 0) {
    return "man-gun"
  }
  const down = sim.soldiers.stance.value[soldier] !== Stance.Standing
  return isCutting(sim, soldier) || (down && canCut(sim, soldier, actionHeading(sim))) ? "cut-wire" : "vault"
}

function sightsMagnify(weapon: number): number {
  switch (weapon) {
    case Weapon.Sniper:
      return 5
    case Weapon.MachineGun:
      return 1.5
    default:
      return 2
  }
}

/**
 * Out of the aim view he keeps the aim he had until the pointer moves this many pixels: it comes back where it was
 * locked, over whatever ground the view now shows.
 */
const POINTER_STILL = 3
/** A man is picked out by his chest, this far below his eye, in metres. */
const CHEST_BELOW_EYE = 0.3
/** In the aim view, men are picked out from the reticle only once the camera is this far behind his shoulder. */
const AIM_PICKS_FROM = 0.9

/** A call that would hit our own men needs calling again within this many milliseconds. */
const CONFIRM_MS = 3000
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
  /** Whether a soldier is drawn (the fog of war's say): only men the player can see are picked out under the pointer. */
  readonly shown?: (soldier: EntityId) => boolean
}

export interface PlayerControl {
  readonly squad: Squad
  /** The soldier currently under the player's control: the squad's leader, or -1 once the squad is wiped out. */
  readonly soldier: EntityId
  /**
   * The way the page last turned him, a unit vector on the ground, or null before it has: ahead of the simulation's
   * facing, which comes back from its worker a step or two later.
   */
  readonly facing: GroundVector | null
  /**
   * The enemy picked out under the pointer (in the aim view, under the reticle), whom the soldier faces and his aimed
   * shot goes at: the nearest drawn on the screen near it, kept until another is clearly nearer. -1 for nobody.
   */
  readonly aimedSoldier: EntityId
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
  { debugActions = false, commands, toggleFog, shown }: PlayerControlOptions = {}
): PlayerControl {
  let lastSoldier: EntityId = -1
  // The enemy picked out, and the one the last face command named.
  let picked: EntityId = -1
  let lastPicked: EntityId = -1
  let lastSteer: GroundVector = { x: 0, z: 0 }
  let lastRun = false
  let lastAim: GroundVector | null = null
  let followedSoldier: EntityId = -1
  // The movement keys held, and the camera's bearing when they last changed: what WASD steers by.
  let steerChord = ""
  let steerBearing = camera.alpha
  // In the aim view last frame, and where the pick point was as it was left, until the pointer moves on.
  let wasAiming = false
  let leftAimAt: { readonly x: number; readonly y: number } | null = null
  camera.panningSensibility = 0

  const viewProjection = new Matrix()
  /** Each enemy drawn in front of the camera, where his chest is on the screen. */
  function enemiesOnScreen(): OnScreen[] {
    const engine = camera.getEngine()
    const scale = engine.getHardwareScalingLevel()
    const width = engine.getRenderWidth() * scale
    const height = engine.getRenderHeight() * scale
    camera.getViewMatrix().multiplyToRef(camera.getProjectionMatrix(), viewProjection)
    const m = viewProjection.m
    const men: OnScreen[] = []
    for (const id of soldierIds(sim)) {
      if (sim.soldiers.side.value[id] === squad.side || (shown && !shown(id))) {
        continue
      }
      const eye = soldierEye(sim, id)
      const y = eye.y - CHEST_BELOW_EYE
      const w = eye.x * m[3] + y * m[7] + eye.z * m[11] + m[15]
      if (!(w > camera.minZ)) {
        // Behind the camera.
        continue
      }
      const across = (eye.x * m[0] + y * m[4] + eye.z * m[8] + m[12]) / w
      const up = (eye.x * m[1] + y * m[5] + eye.z * m[9] + m[13]) / w
      men.push({ id, x: ((across + 1) / 2) * width, y: ((1 - up) / 2) * height })
    }
    return men
  }

  function takeCommand(soldier: EntityId): void {
    if (soldier >= 0 && soldier !== squad.leader && isAlive(sim, soldier)) {
      enqueueCommand(sim, { type: "take-command", squad: squad.id, soldier })
    }
  }

  // A call that would put our own men under it goes only on a second call of the same kind within a few seconds.
  let warned: { readonly kind: CallKind; readonly at: number } | null = null

  /** Whether a call can go: nobody of ours under it, or the player has called it again to say so. */
  function confirmed(kind: CallKind, x: number, z: number): boolean {
    const now = performance.now()
    if (!callEndangers(sim, squad.side, kind, { x, z })) {
      return true
    }
    if (warned && warned.kind === kind && now - warned.at <= CONFIRM_MS) {
      warned = null
      return true
    }
    warned = { kind, at: now }
    return false
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
      case "reload":
        if (squad.leader >= 0) {
          enqueueCommand(sim, { type: "reload", soldier: squad.leader })
        }
        return
      case "act":
        // A gun beside him (or his own, to hand back) before a fence: a man at a gun post is rarely at one.
        if (squad.leader >= 0) {
          enqueueCommand(sim, { type: actionCommand(sim, squad.leader), soldier: squad.leader, ...actionHeading(sim) })
        }
        return
      // In an operation the plan blows the whistle and fires the bombardments: early, they'd send the side over before
      // its barrage, and the plan would fire another at zero hour.
      case "whistle":
        if (!planFires(sim)) {
          commands?.whistle()
        }
        return
      case "bombard":
        if (!planFires(sim)) {
          commands?.bombard()
        }
        return
      case "call-gas":
        if (confirmed("gas", action.x, action.z)) {
          commands?.callGas?.(action.x, action.z)
        }
        return
      case "call-fire":
        if (confirmed("fire", action.x, action.z)) {
          commands?.callFire(action.x, action.z)
        }
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
      case "take-over": {
        const candidates = takeOverCandidates(sim, squad)
        const chosen = candidates.find((candidate) => candidate.id === action.squad) ?? candidates[0]
        if (chosen) {
          enqueueCommand(sim, { type: "take-over-squad", squad: squad.id, from: chosen.id })
        }
        return
      }
    }
  }

  return {
    squad,
    get soldier() {
      return squad.leader
    },
    get facing() {
      return squad.leader >= 0 && squad.leader === lastSoldier ? lastAim : null
    },
    get aimedSoldier() {
      return squad.leader >= 0 && squad.leader === lastSoldier ? picked : -1
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
        picked = -1
        lastPicked = -1
      }

      const x = sim.soldiers.position.x[soldier]
      const z = sim.soldiers.position.z[soldier]
      const rig = cameraRigOf(camera)
      const aimView = rig?.aim ?? null

      // WASD keeps the bearing the camera had when the keys went down until the keys held change, as a third-person
      // game holds the stick's direction across a camera cut: turning the view mid-stride doesn't swing him round. In
      // the aim view it goes by his aim, and keeps the last of it once he's out until the keys change.
      const chord = STEER_KEYS.filter((code) => input.held.has(code)).join(" ")
      if (aimView) {
        steerChord = chord
        steerBearing = aimView.yaw
      } else if (chord !== steerChord) {
        steerChord = chord
        steerBearing = camera.alpha
      }
      const steer = steerFromKeys(input.held, steerBearing)
      const moving = steer.x !== 0 || steer.z !== 0
      // The action key climbs or cuts the way he walks, or else the way the view looks: never by his aim alone.
      const looking = aimView ? aimView.yaw : camera.alpha
      noteActionHeading(sim, moving ? steer : { x: -Math.cos(looking), z: -Math.sin(looking) })
      // Aiming over his shoulder, he walks.
      const run = moving && !aimView && (input.held.has("ShiftLeft") || input.held.has("ShiftRight"))
      if (run && !lastRun && sim.soldiers.stance.value[soldier] !== Stance.Standing) {
        // Breaking into a run gets a man up off his knees or his belly.
        enqueueCommand(sim, { type: "stance", soldier, stance: "standing" })
      }
      if (steer.x !== lastSteer.x || steer.z !== lastSteer.z || run !== lastRun) {
        enqueueCommand(sim, { type: "steer", soldier, ...steer, run })
        lastSteer = steer
        lastRun = run
      }

      const screen = input.pointerScreen?.() ?? null
      if (wasAiming && !aimView) {
        leftAimAt = screen
      }
      wasAiming = aimView !== null
      // Just out of the aim view, with the pointer still where it was locked, he holds his aim and his man.
      const holding =
        !aimView &&
        leftAimAt !== null &&
        screen !== null &&
        Math.hypot(screen.x - leftAimAt.x, screen.y - leftAimAt.y) <= POINTER_STILL
      if (!holding) {
        leftAimAt = null
        // The man nearest the pointer on the screen, or the reticle once the aim view is behind his shoulder.
        const radius = (aimView ? PICK_RADIUS.aim : PICK_RADIUS.field) * interfaceSettings().current.markers
        const picking = screen !== null && (!aimView || (rig?.aimShare ?? 0) >= AIM_PICKS_FROM)
        picked = picking ? pickOnScreen(enemiesOnScreen(), screen, radius, picked) : -1
      }
      if (picked >= 0 && !isAlive(sim, picked)) {
        picked = -1
      }
      let aim: GroundVector | null = null
      if (picked >= 0) {
        // A man picked out is faced exactly, wherever the pointer is on him.
        aim = aimToward({ x, z }, { x: sim.soldiers.position.x[picked], z: sim.soldiers.position.z[picked] })
      } else if (aimView) {
        aim = { x: -Math.cos(aimView.yaw), z: -Math.sin(aimView.yaw) }
      } else if (!holding) {
        const pointer = input.pointerGround()
        aim = pointer ? aimToward({ x, z }, pointer) : null
      }
      // Letting go of a man with nowhere new to face still tells the simulation he's let go.
      aim ??= picked !== lastPicked ? lastAim : null
      if (
        aim &&
        (!lastAim || picked !== lastPicked || (aim.x - lastAim.x) ** 2 + (aim.z - lastAim.z) ** 2 > AIM_EPSILON)
      ) {
        enqueueCommand(
          sim,
          picked >= 0 ? { type: "face", soldier, ...aim, target: picked } : { type: "face", soldier, ...aim }
        )
        lastAim = aim
        lastPicked = picked
      }

      // The aim view sits behind him, and starts from the way the page last turned him.
      rig?.setShoulder({
        eye: soldierEye(sim, soldier),
        facing: lastAim ?? { x: sim.soldiers.facing.x[soldier], z: sim.soldiers.facing.z[soldier] },
        magnification: sightsMagnify(sim.soldiers.weapon.kind[soldier])
      })

      const manning = sim.soldiers.weapon.kind[soldier] === Weapon.MachineGun
      if (manning && input.firing) {
        // A machine gun fires as long as the trigger's held; the gun's own rate sets how often it hits.
        enqueueCommand(sim, { type: "fire", soldier })
      }

      if (rig) {
        rig.model.setGunView(manning)
        // Moving the soldier brings the camera back to them, as does switching to another.
        if (steer.x !== 0 || steer.z !== 0 || soldier !== followedSoldier) {
          rig.recenter()
        }
        followedSoldier = soldier
        rig.follow(x, z)
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
