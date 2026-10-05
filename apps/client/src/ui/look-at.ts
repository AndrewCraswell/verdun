import type { CameraRigModel } from "../control/camera-rig-model.ts"

/**
 * Turns the camera to look at a point on the ground, as a click on the sector map does: the view slides there, at its
 * zoom and bearing, and stops following the soldier until the player recentres. Done with the rig's own drag, so the
 * camera eases there the way a pan does.
 */
export function lookAt(rig: Pick<CameraRigModel, "view" | "drag">, x: number, z: number): void {
  const { focusX, focusZ, yaw } = rig.view
  // The rig's axes: it sits at (cos yaw, sin yaw) from what it looks at, so it looks the opposite way.
  const forward = { x: -Math.cos(yaw), z: -Math.sin(yaw) }
  const right = { x: forward.z, z: -forward.x }
  const dx = x - focusX
  const dz = z - focusZ
  rig.drag(dx * right.x + dz * right.z, dx * forward.x + dz * forward.z)
}
