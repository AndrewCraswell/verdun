import type { EntityId, Simulation, Squad } from "@verdun/sim"
import type { HudState } from "../hud/hud-state.ts"

/** The parts of the running battle the menus' battle pages read and act through, once the battle is up. */
export interface BattleParts {
  readonly sim: Simulation
  readonly squad: Squad
  readonly tickRate: number
  /** What the HUD last worked out: the roster, the order, the objectives and fire missions, the man under control. */
  readonly hud: { readonly state: HudState | null }
  /** Whether the player's side can see a soldier now: the fog of war's rule, for the enemy on the map. */
  readonly seen: (soldier: EntityId) => boolean
  /** Turns the camera to look at a point on the ground. */
  readonly look: (x: number, z: number) => void
}
