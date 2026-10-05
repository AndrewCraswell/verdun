import { createFlatMap, Surface } from "@verdun/map"
import { createSimulation, PLAYTEST_OPERATION, planOperation, Side, TICK_RATE } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import type { JoinChoice } from "./join.ts"
import { briefingOf, operationClock, reportOf } from "./operation-report.ts"

function operation() {
  const map = createFlatMap({ name: "sector", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
  const sim = createSimulation({ map, seed: 1 })
  return planOperation(sim, PLAYTEST_OPERATION)
}

const squad: JoinChoice = {
  squad: 4,
  name: "Squad 20",
  men: 8,
  order: "Holding its stretch of trench",
  place: "near Fleury crossroads",
  fromEnemy: 85,
  refusal: null
}

describe("the playtest operation's briefing", () => {
  it("gives the plan in three lines, the squad's place, and what each result means", () => {
    const briefing = briefingOf(operation(), TICK_RATE, squad, false)
    expect(briefing.plan).toHaveLength(3)
    expect(briefing.plan[0]).toMatch(/three times over/)
    expect(briefing.plan[1]).toMatch(/^Zero hour 8:00/)
    expect(briefing.plan[2]).toMatch(/until 28:00\.$/)
    expect(briefing.squad).toBe("Squad 20, 8 men, in the front line near Fleury crossroads.")
    expect(briefing.firstWave).toBe(true)
    expect(briefing.outcomes.map((outcome) => outcome.label)).toEqual(["Taken", "A footing", "Repulsed"])
  })

  it("names the objectives that make a footing, and a reserve squad's place", () => {
    const planned = { ...operation(), defended: ["Fleury", "The mine craters", "Ravine head"] }
    const briefing = briefingOf(planned, TICK_RATE, squad, true)
    expect(briefing.outcomes[1]?.means).toBe("We hold Fleury, The mine craters and Ravine head, but not their line.")
    expect(briefing.squad).toMatch(/in reserve in the support line/)
    expect(briefing.firstWave).toBe(false)
  })
})

describe("the playtest operation's report", () => {
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
    expect(report).toMatchObject({ result: "taken", title: "Taken", endedAt: "28:00", gunnersDown: 3 })
    expect(report?.sides.map((side) => [side.label, side.side, side.killed, side.captured])).toEqual([
      ["French", "ours", 40, 0],
      ["German", "theirs", 0, 12]
    ])
    expect(report?.causes).toEqual([
      { label: "Machine guns", count: 30 },
      { label: "Our own shells and grenades", count: 4 }
    ])
    expect(report?.objectives).toEqual([{ name: "Fleury", by: "ours", at: "13:00" }])
    expect(report?.squad).toEqual({ lost: 2, downed: 0 })
  })

  it("reads the operation's clock in minutes and seconds", () => {
    const planned = operation()
    expect(operationClock(planned, planned.plannedAt + 95 * TICK_RATE, TICK_RATE)).toBe("1:35")
  })
})
