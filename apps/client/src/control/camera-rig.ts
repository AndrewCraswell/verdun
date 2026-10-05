import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"
import { canonicalCode, keymap } from "../ui/keymap.ts"
import { type CameraRigModel, createCameraRigModel, ZOOM_RANGE } from "./camera-rig-model.ts"
import { groundUnderPointer } from "./ground-pick.ts"

export interface CameraRig {
  readonly model: CameraRigModel
  /**
   * Where the soldier under control is now, and the way they're walking; the camera tracks them, a little ahead, while
   * following. Call every frame.
   */
  follow(x: number, z: number, moving?: { readonly x: number; readonly z: number }): void
  /** Goes back to following the soldier under control. */
  recenter(): void
  dispose(): void
}

/** The pointer within this many pixels of the screen's edge pans the view that way... */
const EDGE_PIXELS = 14
/** ...once it has rested there this many seconds: a flick across the screen to aim at a man near its edge doesn't. */
const EDGE_DWELL = 0.35
/** Middle-drag turns this many radians per pixel across, and tilts this many per pixel down. */
const DRAG_TURN = 0.006
const DRAG_TILT = 0.004
/** Wheel pixels per notch of zoom; line-mode wheels report about three lines a notch. */
const PIXELS_PER_NOTCH = 100
const LINES_PER_NOTCH = 3
/** At most this many notches from one wheel event. */
const MAX_NOTCHES = 3

/**
 * The camera's keys, by their default `KeyboardEvent.code`: the arrows pan (or with Shift, turn), Space recentres. The
 * player can move them (ui/keymap.ts); keys are read through the keymap.
 */
const ARROWS: ReadonlySet<string> = new Set(
  (["pan-forward", "pan-back", "pan-left", "pan-right"] as const).map(canonicalCode)
)
const RECENTRE = canonicalCode("recentre")
export const CAMERA_KEYS: ReadonlySet<string> = new Set([...ARROWS, RECENTRE])

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
 * - Aim: hold the right mouse button, and the view leans toward the pointer.
 * - Pan: arrow keys, the pointer resting at a screen edge (not while aiming), or Shift + middle-drag to grab the ground.
 * - Turn and tilt: middle-drag, or Shift + Left and Right.
 * - Zoom: the wheel, toward the point under the pointer when panning freely. The view tips toward overhead as it pulls
 *   back and drops toward the ground close in.
 *
 * It replaces Babylon's own camera inputs and drives the camera every frame, before rendering.
 */
export function createCameraRig(camera: ArcRotateCamera, scene: Scene, map: BattlefieldMap): CameraRig {
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
  const keys = keymap()
  // The pan keys physically down, and what they do: a key moved in the menu while held is never left stuck down.
  const down = new Set<string>()
  const arrows = new Set<string>()
  let pointer: { x: number; y: number } | null = null
  let dragging: { x: number; y: number; grab: boolean } | null = null
  let aiming = false
  let shift = false
  /** When the pointer reached a screen edge, by the frame clock, or null when it isn't at one. */
  let atEdgeSince: number | null = null
  let clock = 0
  let written = camera.radius

  const pointerGround = () => groundUnderPointer(scene, map) ?? undefined

  /** How far into each screen edge the pointer is, from 0 to 1, right and up; zero away from the edges. */
  function edgePush(): { right: number; forward: number } {
    if (!pointer || !canvas || dragging || aiming || !document.hasFocus()) {
      return { right: 0, forward: 0 }
    }
    const { clientWidth: width, clientHeight: height } = canvas
    const edge = (distance: number) => Math.max(0, 1 - distance / EDGE_PIXELS)
    return {
      right: edge(width - pointer.x) - edge(pointer.x),
      forward: edge(pointer.y) - edge(height - pointer.y)
    }
  }

  /** Arrow keys and screen edges together decide the held pan and turn. Called every frame. */
  function updateHeld(): void {
    let right = 0
    let turn = 0
    if (shift) {
      turn = (arrows.has("ArrowLeft") ? 1 : 0) - (arrows.has("ArrowRight") ? 1 : 0)
    } else {
      right = (arrows.has("ArrowRight") ? 1 : 0) - (arrows.has("ArrowLeft") ? 1 : 0)
    }
    let forward = (arrows.has("ArrowUp") ? 1 : 0) - (arrows.has("ArrowDown") ? 1 : 0)
    const push = edgePush()
    if (push.right === 0 && push.forward === 0) {
      atEdgeSince = null
    } else {
      atEdgeSince ??= clock
      if (clock - atEdgeSince >= EDGE_DWELL) {
        right += push.right
        forward += push.forward
      }
    }
    model.setPan(right, forward)
    model.setTurn(turn)
  }

  /** Where the pointer sits on the screen, -1 to 1 from the middle to the right and top edges, for aiming. */
  function aimPointer(): { right: number; up: number } | null {
    if (!aiming || !pointer || !canvas) {
      return null
    }
    const { clientWidth: width, clientHeight: height } = canvas
    return { right: (pointer.x - width / 2) / (width / 2), up: (height / 2 - pointer.y) / (height / 2) }
  }

  function arrowsAgain(): void {
    arrows.clear()
    for (const physical of down) {
      const code = keys.canonical(physical)
      if (code && ARROWS.has(code)) {
        arrows.add(code)
      }
    }
  }
  const unlistenKeys = keys.listen(arrowsAgain)

  const onKeyDown = (event: KeyboardEvent) => {
    if (typing(event)) {
      return
    }
    shift = event.shiftKey
    const code = keys.canonical(event.code)
    if (code && ARROWS.has(code)) {
      // Arrows would otherwise scroll the page.
      event.preventDefault()
      down.add(event.code)
      arrowsAgain()
    } else if (code === RECENTRE && !event.repeat) {
      event.preventDefault()
      model.recenter()
    }
  }
  const onKeyUp = (event: KeyboardEvent) => {
    shift = event.shiftKey
    down.delete(event.code)
    arrowsAgain()
  }
  const onBlur = () => {
    down.clear()
    arrows.clear()
    pointer = null
    dragging = null
    aiming = false
    shift = false
  }
  const onPointerDown = (event: PointerEvent) => {
    if (event.button === 1) {
      // Middle button: no autoscroll; turn and tilt, or with Shift grab the ground.
      event.preventDefault()
      dragging = { x: event.clientX, y: event.clientY, grab: event.shiftKey }
      canvas?.setPointerCapture(event.pointerId)
    } else if (event.button === 2) {
      aiming = true
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
    shift = event.shiftKey
  }
  const onPointerUp = (event: PointerEvent) => {
    if (event.button === 1) {
      dragging = null
      canvas?.releasePointerCapture(event.pointerId)
    } else if (event.button === 2) {
      aiming = false
    }
  }
  const onPointerLeave = () => {
    pointer = null
  }
  // The right button aims: no menu.
  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault()
  }
  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    const notches = event.deltaMode === 1 ? event.deltaY / LINES_PER_NOTCH : event.deltaY / PIXELS_PER_NOTCH
    // Some mice and trackpads report huge deltas in one event; a fling shouldn't jump the whole zoom range.
    model.zoom(Math.max(-MAX_NOTCHES, Math.min(MAX_NOTCHES, notches)), pointerGround())
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
  canvas?.addEventListener("contextmenu", onContextMenu)

  const frame = scene.onBeforeRenderObservable.add(() => {
    // Something else set the zoom (a scenario framing the start, say): take it as the player's zoom.
    if (Math.abs(camera.radius - written) > 1e-6) {
      model.setDistance(camera.radius)
    }
    const seconds = Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)
    clock += seconds
    updateHeld()
    model.setAim(aimPointer())
    const view = model.step(seconds, (x, z) => heightAt(map, x, z))
    camera.target.set(view.focusX, view.focusY, view.focusZ)
    camera.alpha = view.yaw
    camera.beta = view.pitch
    camera.radius = view.distance
    written = camera.radius
  })

  const rig: CameraRig = {
    model,
    follow(x, z, moving) {
      model.follow(x, z, moving)
    },
    recenter() {
      model.recenter()
    },
    dispose() {
      scene.onBeforeRenderObservable.remove(frame)
      unlistenKeys()
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      canvas?.removeEventListener("pointerdown", onPointerDown)
      canvas?.removeEventListener("pointermove", onPointerMove)
      canvas?.removeEventListener("pointerup", onPointerUp)
      canvas?.removeEventListener("pointerleave", onPointerLeave)
      canvas?.removeEventListener("wheel", onWheel)
      canvas?.removeEventListener("mousedown", onMouseDown)
      canvas?.removeEventListener("contextmenu", onContextMenu)
      rigs.delete(camera)
    }
  }
  rigs.set(camera, rig)
  return rig
}
