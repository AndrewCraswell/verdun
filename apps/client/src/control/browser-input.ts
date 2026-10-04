import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import type { Scene } from "@babylonjs/core/scene"
import type { GroundVector, PlayerInput } from "./player-control.ts"

const MOVEMENT_KEYS = new Set(["KeyW", "KeyA", "KeyS", "KeyD"])

/**
 * Keyboard and mouse input from the browser. Uses `KeyboardEvent.code`, so WASD stays in the same place on AZERTY and
 * other layouts. Held keys are released when the window loses focus, so a soldier never walks off on their own.
 */
export function createBrowserInput(scene: Scene, ground: readonly AbstractMesh[]): PlayerInput {
  const held = new Set<string>()
  const pickable = new Set(ground)

  window.addEventListener("keydown", (event) => {
    if (MOVEMENT_KEYS.has(event.code)) {
      held.add(event.code)
    }
  })
  window.addEventListener("keyup", (event) => {
    held.delete(event.code)
  })
  window.addEventListener("blur", () => {
    held.clear()
  })

  return {
    held,
    pointerGround(): GroundVector | null {
      const hit = scene.pick(scene.pointerX, scene.pointerY, (mesh) => pickable.has(mesh))
      return hit.hit && hit.pickedPoint ? { x: hit.pickedPoint.x, z: hit.pickedPoint.z } : null
    }
  }
}
