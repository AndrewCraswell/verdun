import type { Scene } from "@babylonjs/core/scene"
import type { BattlefieldMap } from "@verdun/map"
import { groundUnderPointer } from "./ground-pick.ts"
import type { GroundVector, PlayerAction, PlayerInput } from "./player-control.ts"

/** Keys held to steer the soldier under control, by `KeyboardEvent.code`. */
export const MOVEMENT_KEYS: ReadonlySet<string> = new Set(["KeyW", "KeyA", "KeyS", "KeyD"])
/** Keys held to run rather than walk. */
export const RUN_KEYS: ReadonlySet<string> = new Set(["ShiftLeft", "ShiftRight"])
/** Keys that act on the ground under the pointer: a grenade, the squad sent there, a call for fire, a gas shoot. */
export const POINTER_KEYS: ReadonlySet<string> = new Set(["KeyQ", "KeyE", "KeyV", "KeyX"])

/** What each pointer key does to the ground point under the pointer. */
function pointerAction(code: string, x: number, z: number): PlayerAction | null {
  switch (code) {
    case "KeyQ":
      return { kind: "grenade", x, z }
    case "KeyE":
      return { kind: "order-advance", x, z }
    case "KeyV":
      return { kind: "call-fire", x, z }
    case "KeyX":
      return { kind: "call-gas", x, z }
    default:
      return null
  }
}

/** One-off keys, by `KeyboardEvent.code`. Digits 1-8 pick a squad slot. */
export function actionForKey(code: string): PlayerAction | null {
  if (code === "Tab") {
    return { kind: "switch-next" }
  }
  if (code === "KeyF") {
    return { kind: "order-follow" }
  }
  if (code === "KeyH") {
    return { kind: "order-hold" }
  }
  if (code === "KeyK") {
    return { kind: "debug-kill" }
  }
  if (code === "KeyG") {
    return { kind: "whistle" }
  }
  if (code === "KeyB") {
    return { kind: "bombard" }
  }
  if (code === "KeyO") {
    return { kind: "toggle-fog" }
  }
  if (code === "KeyZ") {
    return { kind: "toggle-prone" }
  }
  if (code === "KeyC") {
    return { kind: "toggle-crouch" }
  }
  const digit = /^Digit([1-8])$/.exec(code)?.[1]
  return digit ? { kind: "switch-slot", slot: Number(digit) - 1 } : null
}

/**
 * Keyboard and mouse input from the browser. Uses `KeyboardEvent.code`, so keys stay in the same place on AZERTY and
 * other layouts. Held keys are released when the window loses focus, so a soldier never walks off on their own.
 * Left-click fires; the right button aims (see camera-rig.ts), and E sends the squad to the ground under the pointer.
 */
export function createBrowserInput(scene: Scene, map: BattlefieldMap): PlayerInput {
  const held = new Set<string>()
  let actions: PlayerAction[] = []

  // Marched over the map's heights rather than picked against the terrain's meshes: it's asked every frame.
  const pointerGround = (): GroundVector | null => groundUnderPointer(scene, map)

  window.addEventListener("keydown", (event) => {
    if (MOVEMENT_KEYS.has(event.code) || RUN_KEYS.has(event.code)) {
      held.add(event.code)
      return
    }
    if (POINTER_KEYS.has(event.code)) {
      const point = event.repeat ? null : pointerGround()
      const action = point ? pointerAction(event.code, point.x, point.z) : null
      if (action) {
        actions.push(action)
      }
      return
    }
    const action = event.repeat ? null : actionForKey(event.code)
    if (action) {
      // Tab would otherwise move focus off the game.
      event.preventDefault()
      actions.push(action)
    }
  })
  window.addEventListener("keyup", (event) => {
    held.delete(event.code)
  })
  window.addEventListener("blur", () => {
    held.clear()
  })
  const canvas = scene.getEngine().getRenderingCanvas()
  canvas?.addEventListener("pointerdown", (event) => {
    if (event.button === 0) {
      actions.push({ kind: "fire" })
    }
  })

  return {
    held,
    pointerGround,
    takeActions() {
      const taken = actions
      actions = []
      return taken
    }
  }
}
