import { bombardmentAt, type OperationResult, type OperationState, Side, type Simulation } from "@verdun/sim"

/**
 * The operation the battle is fought in (docs/design/operations.md, "The playtest operation"), as the HUD counts it
 * down: always from now, never by the clock, which the player can't know. Before zero hour, the time to the attack;
 * after it, the time to hold on; at the end, how it went. The defenders are told only that an attack is expected, as
 * defenders were: no zero hour, and no end to count to.
 */

export type OperationPhase = "before" | "attack" | "over"

export interface OperationView {
  readonly phase: OperationPhase
  /** Whether the player's side is the one attacking. */
  readonly attacking: boolean
  /** "Attack in", "Hold", "French attack expected", "Over". */
  readonly label: string
  /** Seconds left to count down; null once it's over, and for defenders, who aren't told. */
  readonly seconds: number | null
  /** How far through the wait or the hold, from 0 to 1; null when there's nothing to count. */
  readonly progress: number | null
  /** What's happening now, in a few words, or null: "Our guns are firing", "The enemy's guns are firing". */
  readonly note: string | null
  readonly result: OperationResult | null
}

/** How it ended, from the player's side. */
const RESULTS: Readonly<Record<OperationResult, readonly [string, string]>> = {
  taken: ["Their line taken", "Line lost"],
  footing: ["A footing gained", "A footing lost"],
  repulsed: ["Thrown back", "Held"]
}

const SIDE_NAMES: Readonly<Record<Side, string>> = { [Side.French]: "French", [Side.German]: "German" }

/** Seconds each preparatory bombardment lasts: two minutes and ten (packages/sim/src/operation.ts). */
const BOMBARDMENT_SECONDS = 130

/** Whether one of the operation's preparatory bombardments is firing now. */
function bombardingAt(sim: Simulation, operation: OperationState, tickRate: number): boolean {
  return Array.from({ length: operation.plan.bombardments }, (_, index) => bombardmentAt(operation, index)).some(
    (opens) => sim.tick >= opens && sim.tick < opens + BOMBARDMENT_SECONDS * tickRate
  )
}

/** The operation's countdown for the player's side, or null when the battle isn't fought in one. */
export function operationView(sim: Simulation, side: Side, tickRate: number): OperationView | null {
  const operation = sim.operation
  if (!operation) {
    return null
  }
  const attacking = operation.plan.side === side
  if (operation.result) {
    const [ours, theirs] = RESULTS[operation.result]
    return {
      phase: "over",
      attacking,
      label: "Over",
      seconds: null,
      progress: 1,
      note: attacking ? ours : theirs,
      result: operation.result
    }
  }
  const tick = sim.tick
  if (!attacking) {
    const coming = !operation.wentOver && tick < operation.zeroHourAt
    return {
      phase: coming ? "before" : "attack",
      attacking,
      label: coming ? `${SIDE_NAMES[operation.plan.side]} attack expected` : "Hold the line",
      seconds: null,
      progress: null,
      note: coming && bombardingAt(sim, operation, tickRate) ? "Their guns are firing" : null,
      result: null
    }
  }
  if (tick < operation.zeroHourAt) {
    return {
      phase: "before",
      attacking,
      label: "Attack in",
      seconds: (operation.zeroHourAt - tick) / tickRate,
      progress: (tick - operation.plannedAt) / Math.max(1, operation.zeroHourAt - operation.plannedAt),
      note: bombardingAt(sim, operation, tickRate) ? "Our guns are firing" : null,
      result: null
    }
  }
  return {
    phase: "attack",
    attacking,
    label: "Hold",
    seconds: Math.max(0, (operation.endsAt - tick) / tickRate),
    progress: (tick - operation.zeroHourAt) / Math.max(1, operation.endsAt - operation.zeroHourAt),
    note: null,
    result: null
  }
}

/**
 * Whether an operation's plan is running the battle's big guns and its zero hour: until it's over, the whistle and the
 * bombardment are the plan's to give, not the player's. A whistle blown early would send the side over, and the plan
 * would fire a second barrage at zero hour.
 */
export function planFires(sim: Simulation): boolean {
  return sim.operation !== null && sim.operation.result === null
}
