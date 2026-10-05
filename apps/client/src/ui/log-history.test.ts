import { describe, expect, it } from "vitest"
import type { LogMessage } from "../hud/battle-log.ts"
import { createLogHistory } from "./log-history.ts"

const RATE = 10

function line(id: number, text: string, tick: number): LogMessage {
  return { id, text, tick, kind: "sector", alarm: false, quiet: false }
}

describe("the battle log's history", () => {
  it("keeps lines after the log lets them go, newest first, with the hour they were said", () => {
    const history = createLogHistory(RATE)
    history.observe([line(1, "Fleury crossroads taken", 10)], 10, "07:00")
    history.observe([line(2, "Gas! Masks on", 50)], 50, "07:04")
    history.observe([], 60, "07:05")
    expect(history.lines.map((each) => [each.message.text, each.hour])).toEqual([
      ["Gas! Masks on", "07:04"],
      ["Fleury crossroads taken", "07:00"]
    ])
  })

  it("moves a merged line up to when it was last said", () => {
    const history = createLogHistory(RATE)
    history.observe([line(1, "Prisoner taken", 10), line(2, "Gas! Masks on", 20)], 20, "07:01")
    history.observe([line(2, "Gas! Masks on", 20), line(1, "4 prisoners taken", 90)], 90, "07:09")
    expect(history.lines[0]).toMatchObject({ hour: "07:09", message: { text: "4 prisoners taken" } })
    expect(history.lines).toHaveLength(2)
  })

  it("forgets lines more than an hour of battle old, and starts afresh with a new battle", () => {
    const history = createLogHistory(RATE)
    history.observe([line(1, "Old news", 0)], 0, "06:00")
    history.observe([line(2, "News", 3700 * RATE)], 3700 * RATE, "07:01")
    expect(history.lines.map((each) => each.message.text)).toEqual(["News"])
    history.observe([], 5, "06:00")
    expect(history.lines).toEqual([])
  })
})
