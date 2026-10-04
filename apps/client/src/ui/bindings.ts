/** A key or mouse binding as the player sees it in the controls list. */
export interface Binding {
  /** The keys or buttons, as written on screen: "W A S D", "Shift + middle-drag". */
  readonly keys: string
  /** What it does, in a few words. */
  readonly action: string
}

/** A titled group of bindings in the controls list. */
export interface BindingGroup {
  readonly title: string
  readonly bindings: readonly Binding[]
  /** Shown only in development builds: debug and testing keys. */
  readonly devOnly?: boolean
}

/**
 * The game's own controls, the single list the menu shows. Input handlers own the keys; tests check every key they
 * handle is listed here, so the list can't drift from what the keys really do.
 */
export const CONTROLS: readonly BindingGroup[] = [
  {
    title: "Your soldier",
    bindings: [
      { keys: "W A S D", action: "Move, relative to the camera" },
      { keys: "Shift", action: "Run, while you have the breath" },
      { keys: "Mouse", action: "Aim" },
      { keys: "Left-click", action: "Fire" },
      { keys: "Q", action: "Throw a grenade at the pointer" },
      { keys: "C", action: "Crouch: below the parapet on a fire step, or get back up" },
      { keys: "Z", action: "Lie down and crawl, or get back up" }
    ]
  },
  {
    title: "Your squad",
    bindings: [
      { keys: "Tab", action: "Switch to the next soldier" },
      { keys: "1 to 8", action: "Switch to a squad slot" },
      { keys: "F", action: "Squad order: follow me" },
      { keys: "H", action: "Squad order: hold" },
      { keys: "Right-click", action: "Squad order: advance to that point" }
    ]
  },
  {
    title: "Artillery and the attack",
    bindings: [
      { keys: "B", action: "Bombard the enemy line and cut its wire, for two minutes" },
      { keys: "V", action: "Call artillery onto the point under the pointer" },
      { keys: "X", action: "Call a gas shoot onto the point under the pointer" },
      { keys: "G", action: "Whistle: every squad attacks behind a creeping barrage" }
    ]
  },
  {
    title: "Camera",
    bindings: [
      { keys: "Arrow keys, screen edges", action: "Pan" },
      { keys: "Shift + middle-drag", action: "Grab and drag the ground" },
      { keys: "Middle-drag, Shift + Left and Right", action: "Turn and tilt" },
      { keys: "Mouse wheel", action: "Zoom, toward the pointer" },
      { keys: "Space", action: "Back to the soldier you control" }
    ]
  },
  {
    title: "Screen",
    bindings: [
      { keys: "Esc", action: "Menu and controls; the battle pauses while it's open" },
      { keys: "P", action: "Pause or carry on" },
      { keys: "O", action: "Fog of war on or off" },
      { keys: "F3", action: "Debug statistics" },
      { keys: "F4", action: "Save 5 seconds of frame timings, to open in Perfetto" }
    ]
  },
  {
    title: "Development",
    devOnly: true,
    bindings: [
      { keys: "K", action: "Kill the soldier you control" },
      { keys: "`", action: "Babylon's Inspector" }
    ]
  }
]

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
export function allBindings(development: boolean): BindingGroup[] {
  return [...CONTROLS, ...registered].filter((group) => development || !group.devOnly)
}
