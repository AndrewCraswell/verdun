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
  readonly outcomes: readonly {
    readonly result: OperationResult
    readonly label: string
    readonly means: string
    /** Whether it's good news for the player's side, bad, or between. */
    readonly tone: "good" | "mixed" | "bad"
  }[]
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
      { result: "taken", label: "Taken", means: `we hold that stretch at ${end}`, tone: "good" },
      {
        result: "footing",
        label: "A footing",
        means: operation.defended.length > 0 ? `we get into it, or hold ${list(operation.defended)}` : "we get into it",
        tone: "mixed"
      },
      { result: "repulsed", label: "Repulsed", means: "neither", tone: "bad" }
    ]
  }
}

/**
 * The orders of a player defending against the attack: hold, with no hour given, since the defender wasn't told when
 * the attack would come (docs/design/interface.md#principles, "show what a soldier of 1916 could know").
 */
export function defencePlan(operation: OperationState): AttackPlan {
  return {
    lines: [
      "The French are expected to attack today. The hour isn't known.",
      "Their guns will open first: keep your men down while the shells fall.",
      "When they come over, stop them at the wire, and throw them out of any trench they take."
    ],
    outcomes: [
      { result: "repulsed", label: "Held", means: "they hold none of our line when it's over", tone: "good" },
      {
        result: "footing",
        label: "A footing lost",
        means:
          operation.defended.length > 0 ? `they get into it, or take ${list(operation.defended)}` : "they get into it",
        tone: "mixed"
      },
      { result: "taken", label: "Line lost", means: "they hold the stretch they attack", tone: "bad" }
    ]
  }
}

/** The report's headline for the side that defended: the same result, told from the other trench. */
const DEFENCE_HEADLINES: Readonly<Record<OperationResult, { readonly title: string; readonly line: string }>> = {
  taken: { title: "Line lost", line: "They took our line, and held it." },
  footing: { title: "A footing lost", line: "They gained ground, but couldn't take our line." },
  repulsed: { title: "Held", line: "We threw them back." }
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

/** The causes worded for the defender, who reads the attackers' losses as theirs. */
const DEFENDING_CAUSES: Partial<Record<keyof OperationState["tally"]["causes"], string>> = {
  shell: "Our shells",
  own: "Their own shells and grenades"
}

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
  /** Whether the player's side defended: the report tells it from their trench. */
  readonly defending: boolean
  readonly title: string
  readonly line: string
  /** How long it lasted: "28 min". */
  readonly lasted: string
  /** Each side's men in and out of the fight: ours first. */
  readonly sides: readonly SideReport[]
  /** The attackers' killed and wounded by cause, most first, leaving out none: ours attacking, theirs defending. */
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
  const defending = operation.plan.side !== ours
  const side = (which: Side, mine: boolean): SideReport => ({
    side: mine ? "ours" : "theirs",
    label: which === Side.French ? "French" : "German",
    ...tally.sides[which]
  })
  return {
    result: operation.result,
    defending,
    ...(defending ? DEFENCE_HEADLINES : HEADLINES)[operation.result],
    lasted: between(operation.plannedAt, operation.endedAt, tickRate),
    sides: [side(ours, true), side(theirs, false)],
    causes: CAUSES.map(([cause, label]) => ({
      label: defending ? (DEFENDING_CAUSES[cause] ?? label) : label,
      count: tally.causes[cause]
    }))
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
