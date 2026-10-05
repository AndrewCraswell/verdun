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
  /**
   * The stretch of the enemy's front line the attack goes in on, as lines over the ground (x east, z north): for the
   * attackers only, until it's over. The defenders aren't told where it will fall.
   */
  readonly stretch: readonly (readonly GroundPoint[])[] | null
}

type GroundPoint = readonly [number, number]

/** Each polyline's run between two eastings, cut where it crosses them. */
export function clipToEastings(
  lines: readonly (readonly GroundPoint[])[],
  fromX: number,
  toX: number
): GroundPoint[][] {
  const runs: GroundPoint[][] = []
  for (const line of lines) {
    let run: GroundPoint[] = []
    const inside = (point: GroundPoint) => point[0] >= fromX && point[0] <= toX
    const cut = (a: GroundPoint, b: GroundPoint, x: number): GroundPoint => {
      const t = (x - a[0]) / (b[0] - a[0])
      return [x, a[1] + (b[1] - a[1]) * t]
    }
    line.forEach((point, index) => {
      const before = line[index - 1]
      if (before) {
        for (const edge of [fromX, toX]) {
          // Crossing an edge: where it crosses starts or ends the run.
          if ((before[0] - edge) * (point[0] - edge) < 0) {
            const crossing = cut(before, point, edge)
            if (run.length > 0) {
              run.push(crossing)
              runs.push(run)
              run = []
            } else {
              run = [crossing]
            }
          }
        }
      }
      if (inside(point)) {
        run.push(point)
      } else if (run.length > 0) {
        runs.push(run)
        run = []
      }
    })
    if (run.length > 1) {
      runs.push(run)
    }
  }
  return runs.filter((line) => line.length > 1)
}

/** How deep a front line's own bays and traverses run, in metres: lines further back are its support and reserve. */
const FRONT_LINE_DEPTH = 20

/** The enemy's front line over an operation's stretch, kept for as long as the stretch stays the same. */
let stretchKey = ""
let stretchLines: readonly (readonly GroundPoint[])[] = []

function stretchOf(sim: Simulation, operation: OperationState, side: Side): readonly (readonly GroundPoint[])[] {
  const key = `${operation.fromX}:${operation.toX}:${side}`
  if (key !== stretchKey) {
    // The enemy's fire trenches face the attackers: the Germans' south, the French north.
    const facing = side === Side.French ? "south" : "north"
    const trenches = sim.map.trenches.filter((trench) => trench.kind === "fire" && trench.facing === facing)
    const runs = clipToEastings(
      trenches.map((trench) => trench.points),
      operation.fromX,
      operation.toX
    )
    // Their front line only, not the support and reserve lines behind it: the runs nearest the attackers, who come
    // from the south when the French attack and from the north when the Germans do.
    const middleZ = (run: readonly GroundPoint[]) => run.reduce((sum, point) => sum + point[1], 0) / run.length
    const toward = side === Side.French ? -1 : 1
    const nearest = Math.max(...runs.map((run) => toward * middleZ(run)))
    stretchKey = key
    stretchLines = runs.filter((run) => toward * middleZ(run) >= nearest - FRONT_LINE_DEPTH)
  }
  return stretchLines
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
      result: operation.result,
      stretch: null
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
      result: null,
      stretch: null
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
      result: null,
      stretch: stretchOf(sim, operation, side)
    }
  }
  return {
    phase: "attack",
    attacking,
    label: "Hold",
    seconds: Math.max(0, (operation.endsAt - tick) / tickRate),
    progress: (tick - operation.zeroHourAt) / Math.max(1, operation.endsAt - operation.zeroHourAt),
    note: null,
    result: null,
    stretch: stretchOf(sim, operation, side)
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
