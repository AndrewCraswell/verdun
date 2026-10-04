import { CONTROLS } from "../ui/bindings.ts"

/**
 * The keys the HUD names (on the order plate, the artillery board and in the prompts), read from the controls list in
 * ui/bindings.ts so they follow the game's own bindings. Each is found by how its action is written there; a test
 * checks every one is still found.
 */

/** The start of each action as the controls list writes it, and the key to show if it can't be found. */
const ACTIONS = {
  follow: ["Squad order: follow", "F"],
  hold: ["Squad order: hold", "H"],
  advance: ["Squad order: advance", "E"],
  bombard: ["Bombard", "B"],
  fire: ["Call artillery", "V"],
  gas: ["Call a gas shoot", "X"],
  whistle: ["Whistle", "G"],
  grenade: ["Throw a grenade", "Q"],
  prone: ["Lie down", "Z"],
  switch: ["Switch to the next soldier", "Tab"]
} as const

export type HudAction = keyof typeof ACTIONS

/** The binding written for an action, or null if the controls list has no action starting so. */
export function boundKeys(start: string): string | null {
  for (const group of CONTROLS) {
    const binding = group.bindings.find((candidate) => candidate.action.startsWith(start))
    if (binding) {
      return binding.keys
    }
  }
  return null
}

/** The key for one of the HUD's actions, as the player presses it. */
export function keyOf(action: HudAction): string {
  const [start, fallback] = ACTIONS[action]
  return boundKeys(start) ?? fallback
}

/** Every action the HUD names, for the test that checks each is still bound. */
export const HUD_ACTIONS: readonly HudAction[] = Object.keys(ACTIONS).filter((key): key is HudAction => key in ACTIONS)

/** The overview: held, it brings up the sector's state; tapped, it keeps it up. Handled by the HUD itself. */
export const OVERVIEW_KEY = { code: "KeyI", label: "I" } as const
