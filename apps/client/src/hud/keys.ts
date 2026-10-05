import { canonicalCode, type KeyAction, keymap } from "../ui/keymap.ts"

/**
 * The keys the HUD names (on the order plate, the artillery board, the clock and in the prompts), as the player has
 * bound them (ui/keymap.ts): a key moved in the menu moves on the HUD at its next redraw.
 */
export function keyOf(action: KeyAction): string {
  return keymap().label(action)
}

/** Whether a key event is the overview's key, wherever the player has put it. Handled by the HUD itself. */
export function isOverviewKey(code: string): boolean {
  return keymap().canonical(code) === canonicalCode("overview")
}
