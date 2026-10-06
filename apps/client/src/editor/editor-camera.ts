import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Scene } from "@babylonjs/core/scene"

/** Where the camera is and which way it looks: kept across reloads. */
export interface CameraPose {
  readonly position: readonly [number, number, number]
  /** Radians clockwise from north, and below the horizon. */
  readonly yaw: number
  readonly pitch: number
  /** Flying speed, metres a second. */
  readonly speed: number
}

export interface EditorCamera {
  readonly camera: UniversalCamera
  pose(): CameraPose
  /** Which way the camera faces: radians clockwise from north. */
  readonly yaw: number
  /** Turns to face north, keeping where the camera is and how far it looks down. */
  faceNorth(): void
  /** Puts the camera back where a pose has it. */
  reset(pose: CameraPose): void
  /** Looks at a box of ground from above and to the south, near enough to fill the view with it. */
  frame(minX: number, minZ: number, maxX: number, maxZ: number, groundY: number): void
  /** Called each frame with the seconds since the last: flies with the keys held. */
  update(seconds: number): void
  dispose(): void
}

const LOOK_SPEED = 0.0035
const PITCH_LIMIT = Math.PI / 2 - 0.01
const SPEED = { min: 2, max: 400, initial: 40, fast: 4 } as const

/**
 * A level editor's camera, as in Unity or Unreal: hold the right button to look around and fly with WASD (Q and E down
 * and up, Shift faster, the wheel sets the speed while flying); drag with the middle button to pan; Alt and the left
 * button to orbit round the point under the cursor; the wheel alone dollies toward the point under the cursor; F frames
 * the whole sector (`onFrame`). The left button is otherwise left free, for selecting.
 */
export function createEditorCamera(
  scene: Scene,
  canvas: HTMLCanvasElement,
  pose: CameraPose,
  onFrame: () => void
): EditorCamera {
  const camera = new UniversalCamera("editor", new Vector3(...pose.position), scene)
  camera.inputs.clear()
  camera.minZ = 0.3
  camera.maxZ = 6000
  camera.fov = 0.9
  let yaw = pose.yaw
  let pitch = pose.pitch
  let speed = pose.speed
  const aim = () => {
    camera.rotation.set(pitch, yaw, 0)
  }
  aim()

  const forward = () => {
    camera.computeWorldMatrix()
    return camera.getDirection(Vector3.Forward())
  }
  /** The ground (or anything) under a point of the canvas, or a point ahead when the ray meets nothing. */
  const pointUnder = (x: number, y: number, fallback = 60): Vector3 => {
    const ray = scene.createPickingRay(x, y, Matrix.Identity(), camera)
    const hit = scene.pickWithRay(ray, (mesh) => mesh.isPickable && mesh.isEnabled())
    return hit?.pickedPoint ?? ray.origin.add(ray.direction.scale(fallback))
  }

  const held = new Set<string>()
  let drag: { mode: "look" | "pan" | "orbit"; x: number; y: number; pivot: Vector3 | null } | null = null

  const onPointerDown = (event: PointerEvent) => {
    if (event.button === 2) {
      drag = { mode: "look", x: event.clientX, y: event.clientY, pivot: null }
    } else if (event.button === 1) {
      drag = { mode: "pan", x: event.clientX, y: event.clientY, pivot: null }
    } else if (event.button === 0 && event.altKey) {
      const rect = canvas.getBoundingClientRect()
      drag = {
        mode: "orbit",
        x: event.clientX,
        y: event.clientY,
        pivot: pointUnder(event.clientX - rect.left, event.clientY - rect.top)
      }
    } else {
      return
    }
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!drag) {
      return
    }
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    drag.x = event.clientX
    drag.y = event.clientY
    if (drag.mode === "look") {
      yaw += dx * LOOK_SPEED
      pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch + dy * LOOK_SPEED))
      aim()
    } else if (drag.mode === "pan") {
      // Moves the view across, at the speed the ground ahead moves under the cursor.
      const distance = Math.max(2, Vector3.Distance(camera.position, pointUnder(canvas.width / 2, canvas.height / 2)))
      const perPixel = (2 * distance * Math.tan(camera.fov / 2)) / canvas.clientHeight
      camera.computeWorldMatrix()
      const right = camera.getDirection(Vector3.Right())
      const up = camera.getDirection(Vector3.Up())
      camera.position.addInPlace(right.scale(-dx * perPixel)).addInPlace(up.scale(dy * perPixel))
    } else if (drag.pivot) {
      // Turns the camera round the pivot, keeping it in the same place on screen.
      const pivot = drag.pivot
      const offset = camera.position.subtract(pivot)
      const turnYaw = dx * LOOK_SPEED
      const turnPitch = dy * LOOK_SPEED
      const newPitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch + turnPitch))
      const yawTurn = Matrix.RotationY(turnYaw)
      let turned = Vector3.TransformCoordinates(offset, yawTurn)
      camera.computeWorldMatrix()
      const right = Vector3.TransformNormal(camera.getDirection(Vector3.Right()), yawTurn)
      turned = Vector3.TransformCoordinates(turned, Matrix.RotationAxis(right, newPitch - pitch))
      camera.position.copyFrom(pivot.add(turned))
      yaw += turnYaw
      pitch = newPitch
      aim()
    }
  }
  const onPointerUp = (event: PointerEvent) => {
    if (drag && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    drag = null
  }
  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    if (drag?.mode === "look") {
      speed = Math.max(SPEED.min, Math.min(SPEED.max, speed * (event.deltaY < 0 ? 1.25 : 0.8)))
      return
    }
    // Dollies toward the point under the cursor, a share of the way there each notch.
    const rect = canvas.getBoundingClientRect()
    const target = pointUnder(event.clientX - rect.left, event.clientY - rect.top)
    const toward = target.subtract(camera.position)
    const share = event.deltaY < 0 ? 0.2 : -0.25
    if (share > 0 && toward.length() < 1.5) {
      return
    }
    camera.position.addInPlace(toward.scale(share))
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      return
    }
    held.add(event.code)
    if (event.code === "KeyF" && !drag) {
      onFrame()
    }
  }
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.code)
  const onBlur = () => held.clear()
  const onContextMenu = (event: MouseEvent) => event.preventDefault()

  canvas.addEventListener("pointerdown", onPointerDown)
  canvas.addEventListener("pointermove", onPointerMove)
  canvas.addEventListener("pointerup", onPointerUp)
  canvas.addEventListener("wheel", onWheel, { passive: false })
  canvas.addEventListener("contextmenu", onContextMenu)
  addEventListener("keydown", onKeyDown)
  addEventListener("keyup", onKeyUp)
  addEventListener("blur", onBlur)

  return {
    camera,
    pose() {
      const { x, y, z } = camera.position
      return { position: [x, y, z], yaw, pitch, speed }
    },
    get yaw() {
      return yaw
    },
    faceNorth() {
      yaw = 0
      aim()
    },
    reset(next) {
      camera.position.set(...next.position)
      yaw = next.yaw
      pitch = next.pitch
      speed = next.speed
      aim()
    },
    frame(minX, minZ, maxX, maxZ, groundY) {
      const size = Math.max(maxX - minX, maxZ - minZ)
      yaw = 0
      pitch = 0.9
      aim()
      const centre = new Vector3((minX + maxX) / 2, groundY, (minZ + maxZ) / 2)
      const distance = (size / 2 / Math.tan(camera.fov / 2)) * 1.1
      camera.position.copyFrom(centre.subtract(forward().scale(distance)))
    },
    update(seconds) {
      // Flies only while looking round, as in Unity and Unreal, so the keys are free otherwise.
      if (drag?.mode !== "look" || held.size === 0) {
        return
      }
      camera.computeWorldMatrix()
      const ahead = camera.getDirection(Vector3.Forward())
      const right = camera.getDirection(Vector3.Right())
      const keys: readonly (readonly [string, Vector3])[] = [
        ["KeyW", ahead],
        ["KeyS", ahead.negate()],
        ["KeyD", right],
        ["KeyA", right.negate()],
        ["KeyE", Vector3.Up()],
        ["KeyQ", Vector3.Down()]
      ]
      const move = Vector3.Zero()
      for (const [key, direction] of keys) {
        if (held.has(key)) {
          move.addInPlace(direction)
        }
      }
      if (move.lengthSquared() === 0) {
        return
      }
      const fast = held.has("ShiftLeft") || held.has("ShiftRight") ? SPEED.fast : 1
      camera.position.addInPlace(move.normalize().scale(speed * fast * seconds))
    },
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("contextmenu", onContextMenu)
      removeEventListener("keydown", onKeyDown)
      removeEventListener("keyup", onKeyUp)
      removeEventListener("blur", onBlur)
      camera.dispose()
    }
  }
}

/** Where the camera starts the first time: over the south edge, looking north across the sector. */
export function initialPose(width: number, groundY: number): CameraPose {
  return { position: [width / 2, groundY + 160, -120], yaw: 0, pitch: 0.75, speed: SPEED.initial }
}
