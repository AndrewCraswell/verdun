import { KEY_GROUPS, type KeyAction, type Keymap, keymap } from "./keymap.ts"

/** A key or mouse binding as the player sees it in the controls list. */
export interface Binding {
  /** The keys or buttons, as written on screen: "W", "Shift + middle-drag". */
  readonly keys: string
  /** What it does, in a few words. */
  readonly action: string
  /** The keymap's action, for a binding the player can move to another key; none for the mouse and fixed keys. */
  readonly rebind?: KeyAction
}

/** A titled group of bindings in the controls list. */
export interface BindingGroup {
  readonly title: string
  readonly bindings: readonly Binding[]
  /** Shown only in development builds: debug and testing keys. */
  readonly devOnly?: boolean
}

/** The bindings that can't be moved, by the keymap group they're listed in: the mouse, the slots, the menu, debugging. */
const FIXED: Readonly<Record<string, readonly Binding[]>> = {
  "Your soldier": [
    { keys: "Mouse", action: "Face the pointer" },
    { keys: "Right mouse, held", action: "Aim over his shoulder; the mouse turns him" },
    { keys: "Left-click", action: "Fire" }
  ],
  "Your squad": [
    { keys: "Middle-click", action: "The orders wheel: point at an order and click" },
    { keys: "1 to 8", action: "Switch to a squad slot" }
  ],
  Camera: [
    { keys: "Screen edges", action: "Pan, once the view is off your man" },
    { keys: "Shift + middle-drag", action: "Grab and drag the ground" },
    { keys: "Middle-drag", action: "Turn and tilt" },
    { keys: "Mouse wheel", action: "Zoom, toward the pointer" }
  ],
  Screen: [
    { keys: "Esc", action: "Menu and controls; the battle pauses while it's open" },
    { keys: "F3", action: "Debug statistics" },
    { keys: "F4", action: "Save 5 seconds of frame timings, to open in Perfetto" }
  ]
}

const DEVELOPMENT: BindingGroup = {
  title: "Development",
  devOnly: true,
  bindings: [
    { keys: "K", action: "Kill the soldier you control" },
    { keys: "`", action: "Babylon's Inspector" }
  ]
}

/**
 * The game's own controls, the single list the menu shows: every action in the keymap on the key it's bound to now,
 * then the bindings that can't be moved. Input handlers own the keys; tests check every key they handle is listed.
 */
export function controls(keys: Keymap = keymap()): BindingGroup[] {
  return [
    ...KEY_GROUPS.map((group) => ({
      title: group.title,
      bindings: [
        ...group.actions.map((info) => ({ keys: keys.label(info.action), action: info.label, rebind: info.action })),
        ...(FIXED[group.title] ?? [])
      ]
    })),
    DEVELOPMENT
  ]
}

const registered: BindingGroup[] = []

/**
 * Adds a group of bindings to the controls list, for keys handled outside the game's own input: a tool, a debug view,
 * the weather. Returns a function that takes them out again.
 */
export function registerBindings(group: BindingGroup): () => void {
  registered.push(group)
  return () => {
    const index = registered.indexOf(group)
    if (index >= 0) {
      registered.splice(index, 1)
    }
  }
}

/** Every group of bindings to show, the game's own first, without dev-only groups outside development builds. */
export function allBindings(development: boolean, keys: Keymap = keymap()): BindingGroup[] {
  return [...controls(keys), ...registered].filter((group) => development || !group.devOnly)
}
