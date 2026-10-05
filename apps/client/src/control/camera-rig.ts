import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"
import { cameraSettings } from "../settings/camera.ts"
import { canonicalCode, keymap } from "../ui/keymap.ts"
import {
  type Aim,
  type CameraRigModel,
  createCameraRigModel,
  type ScreenPoint,
  type Shoulder,
  ZOOM_RANGE
} from "./camera-rig-model.ts"
import { groundUnderPointer, pickFromCentre } from "./ground-pick.ts"

export interface CameraRig {
  readonly model: CameraRigModel
  /**
   * Where the soldier under control is now; the camera tracks them while following, leaning toward the pointer. Call
   * every frame.
   */
  follow(x: number, z: number): void
  /** The soldier under control, for the aim view to sit behind; null without one. Call every frame. */
  setShoulder(shoulder: Shoulder | null): void
  /**
   * Whether the aim view is held: the camera is behind the soldier's shoulder or swinging there, the mouse turns his
   * aim, and the ground and the men under the aim are picked from the middle of the screen rather than the pointer.
   */
  readonly aiming: boolean
  /** The aim view's aim while it's held, or null. */
  readonly aim: Aim | null
  /** How far the camera has swung into the aim view: 0 in the field view, 1 behind his shoulder. */
  readonly aimShare: number
  /** Goes back to following the soldier under control. */
  recenter(): void
  dispose(): void
}

/** Once the view is off the soldier, the pointer within this many pixels of the screen's edge pans it that way... */
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
/** In the aim view, the mouse turns the aim this many radians a pixel, divided by how much the sights magnify. */
const AIM_TURN = 0.0022
/** A single mouse movement turns the aim by no more pixels than this: some browsers throw a jump as the lock takes. */
const AIM_MOVE_LIMIT = 200
/** The right button, in `PointerEvent.button`, and its bit in `PointerEvent.buttons`. */
const RIGHT_BUTTON = 2
const RIGHT_BUTTONS = 2

/**
 * The camera's keys, by their default `KeyboardEvent.code`: the arrows pan (or with Shift, turn), Home recentres. The
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
 * goes back to them on Home or when he moves.
 *
 * - Following, the view leans toward the pointer, a third of the way from him to the ground under it.
 * - Aim: hold the right button (unless the player turned it off), and the camera swings behind his shoulder; the mouse,
 *   its pointer locked, turns his aim. Letting go swings back.
 * - Pan: arrow keys, or Shift + middle-drag to grab the ground; once panned away, the pointer resting at a screen edge.
 * - Turn and tilt: middle-drag, or Shift + Left and Right.
 * - Zoom: the wheel, toward the point under the pointer when panning freely. The view tips toward overhead as it pulls
 *   back and drops toward the ground close in.
 *
 * It replaces Babylon's own camera inputs and drives the camera every frame, before rendering.
 */
export function createCameraRig(camera: ArcRotateCamera, scene: Scene, map: BattlefieldMap): CameraRig {
  // The model keeps the view within its limits; the camera's own would clip the aim view, which looks up past level
  // from a few metres off, and a clipped zoom would read as the player's.
  camera.lowerBetaLimit = 0.01
  camera.upperBetaLimit = Math.PI - 0.01
  camera.lowerRadiusLimit = 0.01
  camera.upperRadiusLimit = ZOOM_RANGE.max
  // The field of view the aim view narrows from.
  const fov = camera.fov
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
  // The player's camera settings: edge panning, pan speed and the drag's direction, changed at once from the options.
  const settings = cameraSettings()
  const unlistenSettings = settings.listen(({ panSpeed }) => model.setPanSpeed(panSpeed))
  const canvas = scene.getEngine().getRenderingCanvas()
  const keys = keymap()
  // The pan keys physically down, and what they do: a key moved in the menu while held is never left stuck down.
  const down = new Set<string>()
  const arrows = new Set<string>()
  let pointer: { x: number; y: number } | null = null
  let dragging: { x: number; y: number; grab: boolean } | null = null
  // The right button held for the aim view, and whether the pointer is locked to the canvas for it.
  let aimHeld = false
  let shift = false
  /** When the pointer reached a screen edge, by the frame clock, or null when it isn't at one. */
  let atEdgeSince: number | null = null
  let clock = 0
  let written = camera.radius

  const pointerGround = () => groundUnderPointer(scene, map) ?? undefined

  /** How far into each screen edge the pointer is, from 0 to 1, right and up; zero away from the edges. */
  function edgePush(): { right: number; forward: number } {
    // Following the soldier, the pointer leans the view instead: an edge pans only once the player has panned away.
    if (!pointer || !canvas || dragging || model.following || !document.hasFocus() || !settings.current.edgePan) {
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
    if (aimHeld) {
      // The aim view holds the field view still behind it.
      model.setPan(0, 0)
      model.setTurn(0)
      return
    }
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

  /**
   * Where the pointer sits on the screen, -1 to 1 from the middle to the right and top edges, for the lean. It stays
   * where it last was over the battlefield while the pointer is over the HUD, or turns the view with the middle
   * button.
   */
  let leanPointer: ScreenPoint | null = null
  function updateLean(): void {
    if (pointer && canvas && !dragging && !aimHeld) {
      const { clientWidth: width, clientHeight: height } = canvas
      leanPointer = { right: (pointer.x - width / 2) / (width / 2), up: (height / 2 - pointer.y) / (height / 2) }
    }
    model.setPointer(leanPointer)
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
  /** Swings into the aim view, with the pointer locked to the canvas while the browser allows it. */
  function startAim(): void {
    if (aimHeld || !settings.current.aimView) {
      return
    }
    aimHeld = true
    model.holdAim(true)
    dragging = null
    try {
      // A browser may refuse, as Chrome does just after the player pressed Esc to leave a lock: the mouse still turns
      // the aim, only the pointer stays in sight.
      void Promise.resolve(canvas?.requestPointerLock()).catch(() => undefined)
    } catch {
      // As above.
    }
  }
  /** Swings back out to the field view, and lets the pointer go. */
  function stopAim(): void {
    if (!aimHeld) {
      return
    }
    aimHeld = false
    model.holdAim(false)
    if (canvas && document.pointerLockElement === canvas) {
      document.exitPointerLock()
    }
  }
  /**
   * The right button going down or up. A button pressed or let go while another is held comes as a pointer move, not
   * a press: the left button held on a machine gun, say.
   */
  function rightButton(event: PointerEvent): void {
    if (event.button === RIGHT_BUTTON) {
      if ((event.buttons & RIGHT_BUTTONS) !== 0) {
        startAim()
      } else {
        stopAim()
      }
    } else if (aimHeld && (event.buttons & RIGHT_BUTTONS) === 0) {
      // Let go somewhere the canvas didn't hear it, over a menu say.
      stopAim()
    }
  }

  const onBlur = () => {
    down.clear()
    arrows.clear()
    pointer = null
    leanPointer = null
    dragging = null
    shift = false
    stopAim()
  }
  const onPointerDown = (event: PointerEvent) => {
    if (event.button === RIGHT_BUTTON) {
      rightButton(event)
    } else if (event.button === 1 && !aimHeld) {
      // Middle button: no autoscroll; turn and tilt, or with Shift grab the ground.
      event.preventDefault()
      dragging = { x: event.clientX, y: event.clientY, grab: event.shiftKey }
      canvas?.setPointerCapture(event.pointerId)
    }
  }
  const onPointerMove = (event: PointerEvent) => {
    rightButton(event)
    const bounds = canvas?.getBoundingClientRect()
    pointer = bounds ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top } : null
    if (aimHeld) {
      const limit = (pixels: number) => Math.max(-AIM_MOVE_LIMIT, Math.min(AIM_MOVE_LIMIT, pixels))
      const turn = AIM_TURN / model.magnification
      model.turnAim(limit(event.movementX) * turn, -limit(event.movementY) * turn)
    } else if (dragging) {
      const dx = event.clientX - dragging.x
      const dy = event.clientY - dragging.y
      dragging = { ...dragging, x: event.clientX, y: event.clientY }
      if (dragging.grab) {
        const metresPerPixel =
          (2 * model.view.distance * Math.tan(camera.fov / 2)) / Math.max(1, canvas?.clientHeight ?? 1)
        model.drag(-dx * metresPerPixel, dy * metresPerPixel)
      } else {
        const invert = settings.current.invertDrag ? -1 : 1
        model.rotate(-dx * DRAG_TURN * invert, -dy * DRAG_TILT * invert)
      }
    }
    shift = event.shiftKey
  }
  const onPointerUp = (event: PointerEvent) => {
    if (event.button === 1) {
      dragging = null
      canvas?.releasePointerCapture(event.pointerId)
    }
  }
  // Heard anywhere on the page: the button may come up over the menu or the HUD.
  const onWindowPointerUp = (event: PointerEvent) => {
    if (event.button === RIGHT_BUTTON) {
      stopAim()
    }
  }
  const onPointerLeave = () => {
    pointer = null
  }
  // The right button is the game's: no menu.
  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault()
  }
  const onWheel = (event: WheelEvent) => {
    event.preventDefault()
    if (aimHeld) {
      return
    }
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
  window.addEventListener("pointerup", onWindowPointerUp)
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
    if (aimHeld && !settings.current.aimView) {
      stopAim()
    }
    updateHeld()
    updateLean()
    model.setLens({ fov, aspect: scene.getEngine().getAspectRatio(camera) })
    const view = model.step(seconds, (x, z) => heightAt(map, x, z))
    camera.target.set(view.focusX, view.focusY, view.focusZ)
    camera.alpha = view.yaw
    camera.beta = view.pitch
    camera.radius = view.distance
    camera.fov = 2 * Math.atan(Math.tan(fov / 2) / model.magnification)
    written = camera.radius
    pickFromCentre(scene, model.aim !== null)
  })

  const rig: CameraRig = {
    model,
    follow(x, z) {
      model.follow(x, z)
    },
    setShoulder(shoulder) {
      model.setShoulder(shoulder)
    },
    get aiming() {
      return model.aim !== null
    },
    get aim() {
      return model.aim
    },
    get aimShare() {
      return model.aimShare
    },
    recenter() {
      model.recenter()
    },
    dispose() {
      stopAim()
      pickFromCentre(scene, false)
      scene.onBeforeRenderObservable.remove(frame)
      unlistenKeys()
      unlistenSettings()
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      canvas?.removeEventListener("pointerdown", onPointerDown)
      canvas?.removeEventListener("pointermove", onPointerMove)
      canvas?.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointerup", onWindowPointerUp)
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
