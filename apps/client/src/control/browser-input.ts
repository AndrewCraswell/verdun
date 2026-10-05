import type { Scene } from "@babylonjs/core/scene"
import type { BattlefieldMap } from "@verdun/map"
import { canonicalCode, type Keymap, keymap } from "../ui/keymap.ts"
import { groundUnderPointer } from "./ground-pick.ts"
import type { GroundVector, PlayerAction, PlayerInput } from "./player-control.ts"

/**
 * Keys by their default `KeyboardEvent.code`. The player can move any of them (ui/keymap.ts); a pressed key is turned
 * into its action's default code before it's looked at here, so this module never needs to know where they are.
 */

/** Keys held to steer the soldier under control. */
export const MOVEMENT_KEYS: ReadonlySet<string> = new Set(["KeyW", "KeyA", "KeyS", "KeyD"])
/** Keys held to run rather than walk. */
export const RUN_KEYS: ReadonlySet<string> = new Set(["ShiftLeft", "ShiftRight"])
/** Keys that act on the ground under the pointer: a grenade, the squad sent there, a call for fire, a gas shoot. */
export const POINTER_KEYS: ReadonlySet<string> = new Set(["KeyQ", "KeyE", "KeyV", "KeyX"])

/**
 * The grenade's key: held, the HUD shows where the throw would go (its arc, where it lands, its blast); let go, it's
 * thrown at the pointer. A quick tap throws at once, as before.
 */
export const THROW_KEY = canonicalCode("throw")

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
 * other layouts, and reads them through the player's keymap. Held keys are released when the window loses focus, so a
 * soldier never walks off on their own. Left-click fires; the right button aims (see camera-rig.ts), and E sends the
 * squad to the ground under the pointer.
 */
export function createBrowserInput(scene: Scene, map: BattlefieldMap, keys: Keymap = keymap()): PlayerInput {
  const held = new Set<string>()
  // The movement and run keys physically down, which `held` names by what they do: a key moved in the menu while held
  // moves with it, and is never left stuck down.
  const down = new Set<string>()
  let actions: PlayerAction[] = []
  // Held since its key went down: the grenade is thrown when the key comes up.
  let aimingThrow = false

  // Marched over the map's heights rather than picked against the terrain's meshes: it's asked every frame.
  const pointerGround = (): GroundVector | null => groundUnderPointer(scene, map)

  function heldAgain(): void {
    held.clear()
    for (const physical of down) {
      const code = keys.canonical(physical)
      if (code && (MOVEMENT_KEYS.has(code) || RUN_KEYS.has(code))) {
        held.add(code)
      }
    }
  }
  keys.listen(heldAgain)

  window.addEventListener("keydown", (event) => {
    const code = keys.canonical(event.code)
    if (!code) {
      return
    }
    // A key the player bound does what they bound it to, not what the browser would do with it (Tab moving focus off
    // the game, say). Chords with Ctrl, Alt or the system key stay the browser's.
    if (keys.actionOf(event.code) && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault()
    }
    if (MOVEMENT_KEYS.has(code) || RUN_KEYS.has(code)) {
      down.add(event.code)
      heldAgain()
      return
    }
    if (code === THROW_KEY) {
      aimingThrow = aimingThrow || !event.repeat
      return
    }
    if (POINTER_KEYS.has(code)) {
      const point = event.repeat ? null : pointerGround()
      const action = point ? pointerAction(code, point.x, point.z) : null
      if (action) {
        actions.push(action)
      }
      return
    }
    const action = event.repeat ? null : actionForKey(code)
    if (action) {
      // Tab would otherwise move focus off the game.
      event.preventDefault()
      actions.push(action)
    }
  })
  window.addEventListener("keyup", (event) => {
    down.delete(event.code)
    heldAgain()
    if (keys.canonical(event.code) === THROW_KEY && aimingThrow) {
      aimingThrow = false
      const point = pointerGround()
      const action = point ? pointerAction(THROW_KEY, point.x, point.z) : null
      if (action) {
        actions.push(action)
      }
    }
  })
  window.addEventListener("blur", () => {
    down.clear()
    held.clear()
    // Losing the window mid-aim puts the grenade away rather than throwing it blind.
    aimingThrow = false
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
