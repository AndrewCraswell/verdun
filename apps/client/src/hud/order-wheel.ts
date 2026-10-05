import {
  isAlive,
  orderRefusal,
  type Simulation,
  type Squad,
  type SquadOrder,
  type SquadOrderKind,
  withdrawPoint
} from "@verdun/sim"
import type { KeyAction } from "../ui/keymap.ts"
import type { IconName } from "./icons.ts"

/**
 * The orders wheel (H7 in docs/design/interface.md): held, it opens round the pointer, each order a wedge; pointing
 * toward one and letting go gives it, letting go in the middle gives nothing. The orders on ground (advance, run to,
 * suppress) go to where the pointer was when the wheel opened; withdraw to the nearest trench of ours behind the squad;
 * dig in where it stands. An order the squad can't take is greyed with the reason.
 */

/** What the wheel knows when it opens: the ground under the pointer, and the squad. */
export interface WheelContext {
  readonly at: { readonly x: number; readonly z: number } | null
  readonly sim: Simulation
  readonly squad: Squad
}

export interface OrderWedge {
  readonly kind: SquadOrderKind
  readonly label: string
  readonly icon: IconName
  /** The order's own key, shown on its wedge, for the orders that have one. */
  readonly key?: KeyAction
  /** The order, given where the wheel was opened; null when it can't be given there. */
  order(context: WheelContext): SquadOrder | null
}

/** Where the squad stands: its man under control, or the first of its men standing. */
function standing(context: WheelContext): { x: number; z: number } | null {
  const { sim, squad } = context
  const man =
    squad.leader >= 0 && isAlive(sim, squad.leader) ? squad.leader : squad.members.find((m) => isAlive(sim, m))
  return man === undefined ? null : { x: sim.soldiers.position.x[man], z: sim.soldiers.position.z[man] }
}

/** The wedges, clockwise from the top: the orders on the ground ahead first, falling back and holding below. */
export const WEDGES: readonly OrderWedge[] = [
  {
    kind: "advance",
    label: "Advance",
    icon: "advance",
    key: "advance",
    order: ({ at }) => (at ? { kind: "advance", ...at } : null)
  },
  { kind: "run-to", label: "Run to", icon: "run-to", order: ({ at }) => (at ? { kind: "run-to", ...at } : null) },
  {
    kind: "suppress",
    label: "Suppress",
    icon: "suppress",
    order: ({ at }) => (at ? { kind: "suppress", ...at } : null)
  },
  {
    kind: "dig-in",
    label: "Dig in",
    icon: "dig-in",
    order: (context) => {
      const here = standing(context)
      return here ? { kind: "dig-in", ...here } : null
    }
  },
  {
    kind: "withdraw",
    label: "Withdraw",
    icon: "withdraw",
    order: ({ sim, squad }) => {
      const back = withdrawPoint(sim, squad)
      return back ? { kind: "withdraw", ...back } : null
    }
  },
  { kind: "rally", label: "Rally", icon: "pennant", order: () => ({ kind: "rally" }) },
  { kind: "hold", label: "Hold", icon: "hold", key: "hold", order: () => ({ kind: "hold" }) },
  { kind: "follow", label: "Follow", icon: "follow", key: "follow", order: () => ({ kind: "follow" }) }
]

/** The orders given on the ground under the pointer: they can't be given when the wheel opens over sky. */
const ON_GROUND: ReadonlySet<SquadOrderKind> = new Set(["advance", "run-to", "suppress"])

/** Why a wedge's order can't be given now, or null when it can. */
export function wedgeRefusal(wedge: OrderWedge, context: WheelContext): string | null {
  if (ON_GROUND.has(wedge.kind) && !context.at) {
    return "Point at the ground"
  }
  return orderRefusal(context.sim, context.squad, wedge.kind) ?? (wedge.order(context) ? null : "Can't be given here")
}

/** The pointer this close to the wheel's middle, in pixels, chooses nothing: letting go there gives no order. */
export const DEAD_ZONE = 30

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
