import { createFlatMap, Surface } from "@verdun/map"
import { createSimulation, PLAYTEST_OPERATION, planOperation, Side, TICK_RATE } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { attackPlan, minutes, reportOf } from "./operation-report.ts"

function operation() {
  const map = createFlatMap({ name: "sector", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
  const sim = createSimulation({ map, seed: 1 })
  return planOperation(sim, PLAYTEST_OPERATION)
}

describe("minutes, as the player reads them", () => {
  it("rounds to the nearest half minute", () => {
    expect(minutes(480)).toBe("8 min")
    expect(minutes(90)).toBe("1½ min")
    expect(minutes(20)).toBe("½ min")
    expect(minutes(-5)).toBe("0 min")
  })
})

describe("the attack ahead", () => {
  it("counts everything in minutes from the start, never by a clock", () => {
    const planned = { ...operation(), defended: ["Ravine head"] }
    const plan = attackPlan(planned, planned.plannedAt, TICK_RATE)
    expect(plan.lines).toEqual([
      "1½ min: our guns shell the stretch of their line marked on the map.",
      "8 min: the first wave goes over, behind a creeping barrage.",
      "28 min: it's over. Hold that stretch until then."
    ])
    expect(plan.outcomes.map((outcome) => `${outcome.label} if ${outcome.means}`)).toEqual([
      "Taken if we hold that stretch at 28 min",
      "A footing if we get into it, or hold Ravine head",
      "Repulsed if neither"
    ])
  })

  it("counts from now, however long the battle has been going", () => {
    const planned = operation()
    const later = attackPlan(planned, planned.plannedAt + 60 * TICK_RATE, TICK_RATE)
    expect(later.lines[1]).toMatch(/^7 min:/)
  })
})

describe("the operation's report", () => {
  it("says nothing while the operation goes on", () => {
    expect(reportOf(operation(), TICK_RATE, Side.French)).toBeNull()
  })

  it("reports the result, both sides' losses ours first, our losses by cause, objectives and the squad", () => {
    const over = operation()
    over.result = "taken"
    over.endedAt = over.endsAt
    over.tally.sides[Side.French].killed = 40
    over.tally.sides[Side.German].captured = 12
    over.tally.causes["machine-gun"] = 30
    over.tally.causes.own = 4
    over.tally.gunnersDown = 3
    over.tally.objectives.push({ name: "Fleury", side: Side.French, at: over.zeroHourAt + 300 * TICK_RATE })
    over.tally.squad.lost = 2
    const report = reportOf(over, TICK_RATE, Side.French)
    expect(report).toMatchObject({ result: "taken", title: "Taken", lasted: "28 min", gunnersDown: 3 })
    expect(report?.sides.map((side) => [side.label, side.side, side.killed, side.captured])).toEqual([
      ["French", "ours", 40, 0],
      ["German", "theirs", 0, 12]
    ])
    expect(report?.causes).toEqual([
      { label: "Machine guns", count: 30 },
      { label: "Our own shells and grenades", count: 4 }
    ])
    expect(report?.objectives).toEqual([{ name: "Fleury", by: "ours", after: "13 min" }])
    expect(report?.squad).toEqual({ lost: 2, downed: 0 })
  })
})
