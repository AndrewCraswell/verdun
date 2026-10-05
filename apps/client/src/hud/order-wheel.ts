import type { SquadOrder } from "@verdun/sim"
import type { KeyAction } from "../ui/keymap.ts"
import type { IconName } from "./icons.ts"

/**
 * The orders wheel (H7 in docs/design/interface.md): held, it opens round the pointer, each order a wedge; pointing
 * toward one and letting go gives it, letting go in the middle gives nothing. Advance goes to the ground that was under
 * the pointer when the wheel opened.
 */

export interface OrderWedge {
  readonly id: "follow" | "hold" | "advance"
  readonly label: string
  readonly icon: IconName
  /** The order's own key, shown on its wedge. */
  readonly key: KeyAction
  /** The order, given where the wheel was opened. */
  order(at: { readonly x: number; readonly z: number } | null): SquadOrder | null
}

/** The wedges, clockwise from the top. */
export const WEDGES: readonly OrderWedge[] = [
  {
    id: "advance",
    label: "Advance",
    icon: "advance",
    key: "advance",
    order: (at) => (at ? { kind: "advance", ...at } : null)
  },
  { id: "hold", label: "Hold", icon: "hold", key: "hold", order: () => ({ kind: "hold" }) },
  { id: "follow", label: "Follow", icon: "follow", key: "follow", order: () => ({ kind: "follow" }) }
]

/** The pointer this close to the wheel's middle, in pixels, chooses nothing: letting go there gives no order. */
export const DEAD_ZONE = 26

/**
 * The wedge a pointer offset from the wheel's middle points at, counting clockwise from the one at the top, or null in
 * the dead middle. Screen offsets: x to the right, y down.
 */
export function wedgeAt(dx: number, dy: number, count: number, deadZone = DEAD_ZONE): number | null {
  if (count <= 0 || Math.hypot(dx, dy) < deadZone) {
    return null
  }
  // Clockwise from straight up, in turns from 0 to 1, shifted half a wedge so each wedge's middle is its own angle.
  const turns = (Math.atan2(dx, -dy) / (2 * Math.PI) + 1 + 0.5 / count) % 1
  return Math.floor(turns * count) % count
}
