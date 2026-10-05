import { type OperationResult, type OperationState, Side } from "@verdun/sim"
import type { JoinChoice } from "./join.ts"

/**
 * The playtest operation as the player reads it (docs/design/operations.md, "The playtest operation"): the briefing
 * before going in, and the report at the end, worked out from the simulation's operation, free of the DOM.
 */

/** "8:00", minutes and seconds of the operation's clock, from when it was planned. */
export function operationClock(operation: OperationState, tick: number, tickRate: number): string {
  const seconds = Math.max(0, Math.round((tick - operation.plannedAt) / tickRate))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

export interface Briefing {
  /** The plan, in three lines. */
  readonly plan: readonly string[]
  /** The player's squad and its place: "Squad 20, 8 men, in the front line near Fleury crossroads." */
  readonly squad: string
  /** Whether the squad goes over in the attack, or waits in the support line. */
  readonly firstWave: boolean
  /** What each result means, in a line. */
  readonly outcomes: readonly { readonly result: OperationResult; readonly label: string; readonly means: string }[]
}

/** "Ravine head", "Fleury and Ravine head", "Fleury, the craters and Ravine head". */
function list(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "an objective they hold"
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** The briefing for leading `squad`, one of the join screen's choices; `reserve` when it waits in the support line. */
export function briefingOf(operation: OperationState, tickRate: number, squad: JoinChoice, reserve: boolean): Briefing {
  const zero = operationClock(operation, operation.zeroHourAt, tickRate)
  const end = operationClock(operation, operation.endsAt, tickRate)
  const times = ["", "once", "twice", "three times over", "four times over"][operation.plan.bombardments]
  return {
    plan: [
      `The guns bombard the German front line and its wire, ${times ?? `${operation.plan.bombardments} times over`}.`,
      `Zero hour ${zero}: whistles, and the whole French front line goes over behind a creeping barrage.`,
      `Take their front line, and hold it through their counter-attack until ${end}.`
    ],
    squad: `${squad.name}, ${squad.men} men, ${reserve ? "in reserve in the support line" : "in the front line"} ${squad.place}.`,
    firstWave: !reserve,
    outcomes: [
      { result: "taken", label: "Taken", means: `We hold the German front line at ${end}.` },
      { result: "footing", label: "A footing", means: `We hold ${list(operation.defended)}, but not their line.` },
      { result: "repulsed", label: "Repulsed", means: "Neither." }
    ]
  }
}

const HEADLINES: Readonly<Record<OperationResult, { readonly title: string; readonly line: string }>> = {
  taken: { title: "Taken", line: "The German front line is ours, and held." },
  footing: { title: "A footing", line: "We hold ground they held, but not their line." },
  repulsed: { title: "Repulsed", line: "The attack was thrown back." }
}

/** The attackers' losses by cause, in the report's words, most first. */
const CAUSES: readonly (readonly [keyof OperationState["tally"]["causes"], string])[] = [
  ["machine-gun", "Machine guns"],
  ["rifle", "Rifles"],
  ["shell", "Their shells"],
  ["grenade", "Grenades"],
  ["gas", "Gas"],
  ["own", "Our own shells and grenades"],
  ["other", "Other"]
]

/** One side's men in and out of the fight. */
export interface SideReport {
  readonly side: "ours" | "theirs"
  readonly label: string
  readonly engaged: number
  readonly killed: number
  readonly wounded: number
  readonly returned: number
  readonly captured: number
}

export interface Report {
  readonly result: OperationResult
  readonly title: string
  readonly line: string
  /** When it ended, by the operation's clock. */
  readonly endedAt: string
  /** Each side's men in and out of the fight: ours first. */
  readonly sides: readonly SideReport[]
  /** The attackers' killed and wounded by cause, most first, leaving out none. */
  readonly causes: readonly { readonly label: string; readonly count: number }[]
  readonly gunnersDown: number
  readonly objectives: readonly { readonly name: string; readonly by: "ours" | "theirs"; readonly at: string }[]
  readonly squad: { readonly lost: number; readonly downed: number }
}

/** The report of an operation that's over, from the side of `ours`; null while it's still going. */
export function reportOf(operation: OperationState, tickRate: number, ours: Side): Report | null {
  if (operation.result === null) {
    return null
  }
  const { tally } = operation
  const theirs = ours === Side.French ? Side.German : Side.French
  const side = (which: Side, mine: boolean): SideReport => ({
    side: mine ? "ours" : "theirs",
    label: which === Side.French ? "French" : "German",
    ...tally.sides[which]
  })
  return {
    result: operation.result,
    ...HEADLINES[operation.result],
    endedAt: operationClock(operation, operation.endedAt, tickRate),
    sides: [side(ours, true), side(theirs, false)],
    causes: CAUSES.map(([cause, label]) => ({ label, count: tally.causes[cause] }))
      .filter((each) => each.count > 0)
      .sort((a, b) => b.count - a.count),
    gunnersDown: tally.gunnersDown,
    objectives: tally.objectives.map((objective) => ({
      name: objective.name,
      by: objective.side === ours ? "ours" : "theirs",
      at: operationClock(operation, objective.at, tickRate)
    })),
    squad: { ...tally.squad }
  }
}
