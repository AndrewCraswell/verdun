import type { Scene } from "@babylonjs/core/scene"
import type { BattlefieldMap } from "@verdun/map"
import { interfaceSettings } from "../hud/interface-settings.ts"
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
/**
 * The calls for fire on the pointer, by their keys: held, the HUD shows where the shells would fall (H10); let go, the
 * call goes. Right-click while holding puts it away.
 */
export const CALL_KEYS: ReadonlySet<string> = new Set([canonicalCode("fire-mission"), canonicalCode("gas")])
const RUN_KEY = canonicalCode("run")
/** The stance keys, which the player can set to work while held rather than as a press on and a press off. */
const STANCE_KEYS: ReadonlyMap<string, "crouch" | "prone"> = new Map([
  [canonicalCode("crouch"), "crouch"],
  [canonicalCode("prone"), "prone"]
])

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
  if (code === "KeyT") {
    return { kind: "take-over" }
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
  if (code === "Space") {
    return { kind: "act" }
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
  // The left button held down: a machine gun keeps firing while it is.
  let firing = false
  // Aiming since its key went down: the grenade is thrown when the key comes up, or on the next press.
  let aimingThrow = false
  // Running, by a press of the run key set to toggle.
  let runOn = false
  // The call for fire being aimed, by its key, until it's let go or put away.
  let aimingCall: string | null = null
  // Stance keys held down, set to work while held: let go, and he gets up again.
  const stancesHeld = new Set<string>()
  const presses = () => interfaceSettings().current.presses

  // Marched over the map's heights rather than picked against the terrain's meshes: it's asked every frame.
  const pointerGround = (): GroundVector | null => groundUnderPointer(scene, map)

  function heldAgain(): void {
    held.clear()
    for (const physical of down) {
      const code = keys.canonical(physical)
      // With run set to toggle, holding the key does nothing more than its press did.
      const run = code !== null && RUN_KEYS.has(code)
      if (code && (MOVEMENT_KEYS.has(code) || (run && presses().run === "hold"))) {
        held.add(code)
      }
    }
    if (runOn && presses().run === "toggle") {
      held.add(RUN_KEY)
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
      if (RUN_KEYS.has(code) && !event.repeat && presses().run === "toggle") {
        runOn = !runOn
      }
      down.add(event.code)
      heldAgain()
      return
    }
    if (code === THROW_KEY) {
      if (event.repeat) {
        return
      }
      if (aimingThrow && presses().grenade === "toggle") {
        // The second press throws.
        throwAtPointer()
      } else {
        aimingThrow = true
      }
      return
    }
    if (CALL_KEYS.has(code)) {
      if (!event.repeat) {
        aimingCall = code
      }
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
      const stance = STANCE_KEYS.get(code)
      if (stance && presses()[stance] === "hold") {
        stancesHeld.add(code)
      }
    }
  })

  function throwAtPointer(): void {
    aimingThrow = false
    const point = pointerGround()
    const action = point ? pointerAction(THROW_KEY, point.x, point.z) : null
    if (action) {
      actions.push(action)
    }
  }
  window.addEventListener("keyup", (event) => {
    down.delete(event.code)
    heldAgain()
    const code = keys.canonical(event.code)
    if (code === THROW_KEY && aimingThrow && presses().grenade === "hold") {
      throwAtPointer()
    }
    if (code !== null && code === aimingCall) {
      aimingCall = null
      const point = pointerGround()
      const action = point ? pointerAction(code, point.x, point.z) : null
      if (action) {
        actions.push(action)
      }
    }
    // A stance held: let go, and the same key's toggle takes him back.
    if (code && stancesHeld.delete(code)) {
      const action = actionForKey(code)
      if (action) {
        actions.push(action)
      }
    }
  })
  window.addEventListener("blur", () => {
    down.clear()
    held.clear()
    runOn = false
    stancesHeld.clear()
    firing = false
    // Losing the window mid-aim puts the grenade away rather than throwing it blind, and the call too.
    aimingThrow = false
    aimingCall = null
  })
  const canvas = scene.getEngine().getRenderingCanvas()
  canvas?.addEventListener("pointerdown", (event) => {
    if (event.button === 0) {
      firing = true
      actions.push({ kind: "fire" })
    } else if (event.button === 2) {
      // The right button puts away a call being aimed.
      aimingCall = null
    }
  })

  window.addEventListener("pointerup", (event) => {
    if (event.button === 0) {
      firing = false
    }
  })

  return {
    held,
    get firing() {
      return firing
    },
    pointerGround,
    takeActions() {
      const taken = actions
      actions = []
      return taken
    }
  }
}
