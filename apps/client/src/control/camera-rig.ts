import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"
import { type CameraRigModel, createCameraRigModel, ZOOM_RANGE } from "./camera-rig-model.ts"

export interface CameraRig {
  readonly model: CameraRigModel
  /** Where the soldier under control is now; the camera tracks them while following. Call every frame. */
  follow(x: number, z: number): void
  /** Goes back to following the soldier under control. */
  recenter(): void
  dispose(): void
}

/** The pointer within this many pixels of the screen's edge pans the view that way. */
const EDGE_PIXELS = 14
/** Middle-drag turns this many radians per pixel across, and tilts this many per pixel down. */
const DRAG_TURN = 0.006
const DRAG_TILT = 0.004
/** Wheel pixels per notch of zoom; line-mode wheels report about three lines a notch. */
const PIXELS_PER_NOTCH = 100
const LINES_PER_NOTCH = 3
/** At most this many notches from one wheel event. */
const MAX_NOTCHES = 3

/** The camera's keys, by `KeyboardEvent.code`: the arrows pan (or with Shift, turn), Space recentres. */
export const CAMERA_KEYS: ReadonlySet<string> = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"])
const ARROWS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"])

const rigs = new WeakMap<ArcRotateCamera, CameraRig>()

/** The rig driving a camera, if it has one. */
export function cameraRigOf(camera: ArcRotateCamera): CameraRig | undefined {
  return rigs.get(camera)
}

/** Whether a key event belongs to a text field rather than the game. */
function typing(event: KeyboardEvent): boolean {
  const target = event.target
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

/**
 * The battlefield camera, as tactics games do it: follows the soldier under control until the player pans away, and
 * goes back to them on Space.
 *
 * - Pan: arrow keys, the pointer at a screen edge, or Shift + middle-drag to grab the ground.
 * - Turn and tilt: middle-drag, or Shift + Left and Right.
 * - Zoom: the wheel, toward the point under the pointer when panning freely. The view tips toward overhead as it pulls
 *   back and drops toward the ground close in.
 *
 * It replaces Babylon's own camera inputs and drives the camera every frame, before rendering.
 */
export function createCameraRig(
  camera: ArcRotateCamera,
  scene: Scene,
  map: BattlefieldMap,
  ground: readonly AbstractMesh[]
): CameraRig {
  camera.lowerBetaLimit = 0.05
  camera.upperBetaLimit = 1.5
  camera.lowerRadiusLimit = ZOOM_RANGE.min
  camera.upperRadiusLimit = ZOOM_RANGE.max
  const model = createCameraRigModel(
    { width: mapWidth(map), depth: mapDepth(map) },
    {
      focusX: camera.target.x,
      focusY: camera.target.y,
      focusZ: camera.target.z,
      distance: camera.radius,
      yaw: camera.alpha,
      pitch: camera.beta
    }
  )
  const canvas = scene.getEngine().getRenderingCanvas()
  const pickable = new Set(ground)
  const arrows = new Set<string>()
  let pointer: { x: number; y: number } | null = null
  let dragging: { x: number; y: number; grab: boolean } | null = null
  let written = camera.radius

  const groundUnderPointer = () => {
    const hit = scene.pick(scene.pointerX, scene.pointerY, (mesh) => pickable.has(mesh))
    return hit.hit && hit.pickedPoint ? { x: hit.pickedPoint.x, z: hit.pickedPoint.z } : undefined
  }

  /** Arrow keys and screen edges together decide the held pan and turn. */
  function updateHeld(shift: boolean): void {
    let right = 0
    let forward = 0
    let turn = 0
    if (shift) {
      turn = (arrows.has("ArrowLeft") ? 1 : 0) - (arrows.has("ArrowRight") ? 1 : 0)
    } else {
      right = (arrows.has("ArrowRight") ? 1 : 0) - (arrows.has("ArrowLeft") ? 1 : 0)
    }
    forward = (arrows.has("ArrowUp") ? 1 : 0) - (arrows.has("ArrowDown") ? 1 : 0)
    if (pointer && canvas && !dragging && document.hasFocus()) {
      const { clientWidth: width, clientHeight: height } = canvas
      const edge = (distance: number) => Math.max(0, 1 - distance / EDGE_PIXELS)
      right += edge(width - pointer.x) - edge(pointer.x)
      forward += edge(pointer.y) - edge(height - pointer.y)
    }
    model.setPan(right, forward)
    model.setTurn(turn)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (typing(event)) {
      return
    }
    if (ARROWS.has(event.code)) {
      // Arrows would otherwise scroll the page.
      event.preventDefault()
      arrows.add(event.code)
      updateHeld(event.shiftKey)
    } else if (event.code === "Space" && !event.repeat) {
      event.preventDefault()
      model.recenter()
    }
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (ARROWS.has(event.code) || event.code === "ShiftLeft" || event.code === "ShiftRight") {
      arrows.delete(event.code)
      updateHeld(event.shiftKey)
    }
  }
  const onBlur = () => {
    arrows.clear()
    pointer = null
    dragging = null
    updateHeld(false)
  }
  const onPointerDown = (event: PointerEvent) => {
    if (event.button === 1) {
      // Middle button: no autoscroll; turn and tilt, or with Shift grab the ground.
      event.preventDefault()
      dragging = { x: event.clientX, y: event.clientY, grab: event.shiftKey }
      canvas?.setPointerCapture(event.pointerId)
      updateHeld(event.shiftKey)
    }
  }
  const onPointerMove = (event: PointerEvent) => {
    const bounds = canvas?.getBoundingClientRect()
    pointer = bounds ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top } : null
    if (dragging) {
      const dx = event.clientX - dragging.x
      const dy = event.clientY - dragging.y
      dragging = { ...dragging, x: event.clientX, y: event.clientY }
      if (dragging.grab) {
        const metresPerPixel =
          (2 * model.view.distance * Math.tan(camera.fov / 2)) / Math.max(1, canvas?.clientHeight ?? 1)
        model.drag(-dx * metresPerPixel, dy * metresPerPixel)
      } else {
        model.rotate(-dx * DRAG_TURN, -dy * DRAG_TILT)
      }
    }
    updateHeld(event.shiftKey)
  }
  const onPointerUp = (event: PointerEvent) => {
    if (event.button === 1) {
      dragging = null
      canvas?.releasePointerCapture(event.pointerId)
    }
  }
  const onPointerLeave = () => {
    pointer = null
    updateHeld(false)
  }
  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const notches = event.deltaMode === 1 ? event.deltaY / LINES_PER_NOTCH : event.deltaY / PIXELS_PER_NOTCH
    // Some mice and trackpads report huge deltas in one event; a fling shouldn't jump the whole zoom range.
    model.zoom(Math.max(-MAX_NOTCHES, Math.min(MAX_NOTCHES, notches)), groundUnderPointer())
  }
  const onMouseDown = (event: MouseEvent) => {
    if (event.button === 1) {
      event.preventDefault()
    }
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  window.addEventListener("blur", onBlur)
  canvas?.addEventListener("pointerdown", onPointerDown)
  canvas?.addEventListener("pointermove", onPointerMove)
  canvas?.addEventListener("pointerup", onPointerUp)
  canvas?.addEventListener("pointerleave", onPointerLeave)
  canvas?.addEventListener("wheel", onWheel, { passive: false })
  canvas?.addEventListener("mousedown", onMouseDown)

  const frame = scene.onBeforeRenderObservable.add(() => {
    // Something else set the zoom (a scenario framing the start, say): take it as the player's zoom.
    if (Math.abs(camera.radius - written) > 1e-6) {
      model.setDistance(camera.radius)
    }
    const seconds = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)
    const view = model.step(seconds, (x, z) => heightAt(map, x, z))
    camera.target.set(view.focusX, view.focusY, view.focusZ)
    camera.alpha = view.yaw
    camera.beta = view.pitch
    camera.radius = view.distance
    written = camera.radius
  })

  const rig: CameraRig = {
    model,
    follow(x, z) {
      model.follow(x, z)
    },
    recenter() {
      model.recenter()
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(frame)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      canvas?.removeEventListener("pointerdown", onPointerDown)
      canvas?.removeEventListener("pointermove", onPointerMove)
      canvas?.removeEventListener("pointerup", onPointerUp)
      canvas?.removeEventListener("pointerleave", onPointerLeave)
      canvas?.removeEventListener("wheel", onWheel)
      canvas?.removeEventListener("mousedown", onMouseDown)
      rigs.delete(camera)
    }
  }
  rigs.set(camera, rig)
  return rig
}
