import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import type { Scene } from "@babylonjs/core/scene"
import type { GroundVector, PlayerAction, PlayerInput } from "./player-control.ts"

const MOVEMENT_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD"])

/** One-off keys, by `KeyboardEvent.code`. Digits 1-8 pick a squad slot. */
function actionForKey(code: string): PlayerAction | null {
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
  const digit = /^Digit([1-8])$/.exec(code)?.[1]
  return digit ? { kind: "switch-slot", slot: Number(digit) - 1 } : null
}

/**
 * Keyboard and mouse input from the browser. Uses `KeyboardEvent.code`, so keys stay in the same place on AZERTY and
 * other layouts. Held keys are released when the window loses focus, so a soldier never walks off on their own.
 * Right-clicking the ground orders the squad there.
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
    if (MOVEMENT_KEYS.has(event.code)) {
      held.add(event.code)
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
