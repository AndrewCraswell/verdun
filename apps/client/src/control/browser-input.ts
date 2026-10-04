import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import type { Scene } from "@babylonjs/core/scene"
import type { GroundVector, PlayerAction, PlayerInput } from "./player-control.ts"

/** Keys held to steer the soldier under control, by `KeyboardEvent.code`. */
export const MOVEMENT_KEYS: ReadonlySet<string> = new Set(["KeyW", "KeyA", "KeyS", "KeyD"])
/** Keys held to run rather than walk. */
export const RUN_KEYS: ReadonlySet<string> = new Set(["ShiftLeft", "ShiftRight"])
/** Keys that act on the ground under the pointer: a grenade, a call for fire, a gas shoot. */
export const POINTER_KEYS: ReadonlySet<string> = new Set(["KeyQ", "KeyV", "KeyX"])

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
 * Left-click fires; right-clicking the ground orders the squad there.
 */
export function createBrowserInput(scene: Scene, ground: readonly AbstractMesh[]): PlayerInput {
  const held = new Set<string>()
  const pickable = new Set(ground)
  let actions: PlayerAction[] = []

  const pointerGround = (): GroundVector | null => {
    const hit = scene.pick(scene.pointerX, scene.pointerY, (mesh) => pickable.has(mesh))
    return hit.hit && hit.pickedPoint ? { x: hit.pickedPoint.x, z: hit.pickedPoint.z } : null
  }

  window.addEventListener("keydown", (event) => {
    if (MOVEMENT_KEYS.has(event.code) || RUN_KEYS.has(event.code)) {
      held.add(event.code)
      return
    }
    if (event.code === "KeyQ" && !event.repeat) {
      // Throw a grenade at whatever is under the pointer.
      const point = pointerGround()
      if (point) {
        actions.push({ kind: "grenade", x: point.x, z: point.z })
      }
      return
    }
    if (event.code === "KeyX" && !event.repeat) {
      // Call a gas shoot onto whatever is under the pointer.
      const point = pointerGround()
      if (point) {
        actions.push({ kind: "call-gas", x: point.x, z: point.z })
      }
      return
    }
    if (event.code === "KeyV" && !event.repeat) {
      // Call for fire on whatever is under the pointer.
      const point = pointerGround()
      if (point) {
        actions.push({ kind: "call-fire", x: point.x, z: point.z })
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
  canvas?.addEventListener("contextmenu", (event) => {
    event.preventDefault()
    const point = pointerGround()
    if (point) {
      actions.push({ kind: "order-advance", x: point.x, z: point.z })
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
