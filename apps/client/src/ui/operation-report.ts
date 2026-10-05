import { bombardmentAt, type OperationResult, type OperationState, Side } from "@verdun/sim"

/**
 * The playtest operation as the player reads it (docs/design/operations.md, "The playtest operation"): what's going to
 * happen, said before going in, and the report at the end, worked out from the simulation's operation, free of the
 * DOM. Times are counted in minutes from when the player starts, never by a clock: nobody knows the server's hour.
 */

/** "8 min", "1½ min": a span in minutes, to the nearest half. */
export function minutes(seconds: number): string {
  const halves = Math.max(0, Math.round(seconds / 30))
  const whole = Math.floor(halves / 2)
  if (halves % 2 === 0) {
    return `${whole} min`
  }
  return whole === 0 ? "½ min" : `${whole}½ min`
}

/** Minutes from `from` to `to`, two steps of the simulation. */
function between(from: number, to: number, tickRate: number): string {
  return minutes((to - from) / tickRate)
}

/** "Ravine head", "Fleury and Ravine head", "Fleury, the craters and Ravine head". */
function list(names: readonly string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "ground they hold"
  }
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** The attack ahead, in three short lines and what counts as winning, from `now`, the step the player starts at. */
export interface AttackPlan {
  readonly lines: readonly string[]
  readonly outcomes: readonly { readonly result: OperationResult; readonly label: string; readonly means: string }[]
}

export function attackPlan(operation: OperationState, now: number, tickRate: number): AttackPlan {
  const guns = between(now, bombardmentAt(operation, 0), tickRate)
  const over = between(now, operation.zeroHourAt, tickRate)
  const end = between(now, operation.endsAt, tickRate)
  return {
    lines: [
      `${guns}: our guns shell the stretch of their line marked on the map.`,
      `${over}: the first wave goes over, behind a creeping barrage.`,
      `${end}: it's over. Hold that stretch until then.`
    ],
    outcomes: [
      { result: "taken", label: "Taken", means: `we hold that stretch at ${end}` },
      {
        result: "footing",
        label: "A footing",
        means: operation.defended.length > 0 ? `we get into it, or hold ${list(operation.defended)}` : "we get into it"
      },
      { result: "repulsed", label: "Repulsed", means: "neither" }
    ]
  }
}

const HEADLINES: Readonly<Record<OperationResult, { readonly title: string; readonly line: string }>> = {
  taken: { title: "Taken", line: "We took their line, and held it." },
  footing: { title: "A footing", line: "We gained ground, but couldn't hold their line." },
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
  /** How long it lasted: "28 min". */
  readonly lasted: string
  /** Each side's men in and out of the fight: ours first. */
  readonly sides: readonly SideReport[]
  /** The attackers' killed and wounded by cause, most first, leaving out none. */
  readonly causes: readonly { readonly label: string; readonly count: number }[]
  readonly gunnersDown: number
  /** Objectives as they changed hands, and how long after the start: "13 min". */
  readonly objectives: readonly { readonly name: string; readonly by: "ours" | "theirs"; readonly after: string }[]
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
    lasted: between(operation.plannedAt, operation.endedAt, tickRate),
    sides: [side(ours, true), side(theirs, false)],
    causes: CAUSES.map(([cause, label]) => ({ label, count: tally.causes[cause] }))
      .filter((each) => each.count > 0)
      .sort((a, b) => b.count - a.count),
    gunnersDown: tally.gunnersDown,
    objectives: tally.objectives.map((objective) => ({
      name: objective.name,
      by: objective.side === ours ? "ours" : "theirs",
      after: between(operation.plannedAt, objective.at, tickRate)
    })),
    squad: { ...tally.squad }
  }
}
