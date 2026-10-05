import { bombardmentAt, type OperationResult, type Side, type Simulation } from "@verdun/sim"

/**
 * The operation the battle is fought in (docs/design/operations.md, "The playtest operation"), as the HUD counts it
 * down: always from now, never by the clock, which the player can't know. Before zero hour, the time to the attack;
 * after it, the time to hold on; at the end, how it went.
 */

export type OperationPhase = "before" | "attack" | "over"

export interface OperationView {
  readonly phase: OperationPhase
  /** Whether the player's side is the one attacking. */
  readonly attacking: boolean
  /** "Attack in", "Hold", "Over". */
  readonly label: string
  /** Seconds left to count down; null once it's over. */
  readonly seconds: number | null
  /** How far through the wait or the hold, from 0 to 1. */
  readonly progress: number
  /** What's happening now, in a few words, or null: "Our guns are firing", "The enemy's guns are firing". */
  readonly note: string | null
  readonly result: OperationResult | null
}

/** How it ended, from the player's side. */
const RESULTS: Readonly<Record<OperationResult, readonly [string, string]>> = {
  taken: ["Their line taken", "Our line lost"],
  footing: ["A footing gained", "They gained a footing"],
  repulsed: ["Thrown back", "Attack thrown back"]
}

/** Seconds each preparatory bombardment lasts: two minutes and ten (packages/sim/src/operation.ts). */
const BOMBARDMENT_SECONDS = 130

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
  if (tick < operation.zeroHourAt) {
    const bombarding = Array.from({ length: operation.plan.bombardments }, (_, index) =>
      bombardmentAt(operation, index)
    ).some((opens) => tick >= opens && tick < opens + BOMBARDMENT_SECONDS * tickRate)
    let note: string | null = null
    if (bombarding) {
      note = attacking ? "Our guns are firing" : "Their guns are firing"
    }
    return {
      phase: "before",
      attacking,
      label: attacking ? "Attack in" : "Their attack in",
      seconds: (operation.zeroHourAt - tick) / tickRate,
      progress: (tick - operation.plannedAt) / Math.max(1, operation.zeroHourAt - operation.plannedAt),
      note,
      result: null
    }
  }
  return {
    phase: "attack",
    attacking,
    label: attacking ? "Hold" : "Hold out",
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
