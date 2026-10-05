import { carveTrenches, createFlatMap, Surface, type Trench } from "@verdun/map"
import { createSimulation, createSquad, enqueueCommand, Side, spawnSoldier, stepSimulation } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { joinArea, joinChoices, placeName } from "./join.ts"

/** Our front line at z = 100 facing north, our reserve line at z = 40, the enemy's at z = 180 facing south. */
function battle() {
  const map = createFlatMap({ name: "sector", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
  const line = (z: number, facing: "north" | "south"): Trench => ({
    kind: "fire",
    points: [
      [20, z],
      [180, z]
    ],
    facing
  })
  const trenches = [line(100, "north"), line(40, "north"), line(180, "south")]
  carveTrenches(map, trenches)
  const sim = createSimulation({ map: { ...map, trenches }, seed: 1 })
  const squadAt = (x: number, z: number, side: Side = Side.French, controller: "player" | "ai" = "ai", count = 8) =>
    createSquad(
      sim,
      side,
      Array.from({ length: count }, (_, slot) => spawnSoldier(sim, { side, x: x + slot * 2, z })),
      controller
    )
  return { sim, squadAt }
}

describe("the join screen's choices", () => {
  it("offers the squad held for the player, the squads in the line nearest the enemy first, and the reserves", () => {
    const { sim, squadAt } = battle()
    const player = squadAt(30, 100, Side.French, "player")
    const near = squadAt(100, 120)
    const far = squadAt(150, 100)
    const reserve = squadAt(60, 40)
    reserve.order = { kind: "reserve" }
    squadAt(100, 180, Side.German)

    const choices = joinChoices(sim, player)
    expect(choices.held).toMatchObject({ squad: player.id, name: "Squad 1", men: 8, refusal: null })
    expect(choices.line.map((choice) => choice.squad)).toEqual([near.id, far.id])
    expect(choices.line[0]?.fromEnemy).toBeCloseTo(60, 0)
    expect(choices.reserve).toMatchObject([{ squad: reserve.id, order: "In reserve, in the dugouts", refusal: null }])
  })

  it("says why a squad can't be taken: in contact, or too few men", () => {
    const { sim, squadAt } = battle()
    const player = squadAt(30, 100, Side.French, "player")
    squadAt(100, 150)
    squadAt(100, 165, Side.German, "ai", 1)
    const thin = squadAt(150, 100, Side.French, "ai", 3)
    stepSimulation(sim)

    const choices = joinChoices(sim, player)
    expect(choices.line.map((choice) => choice.refusal)).toEqual(["In contact with the enemy", "Only 3 men standing"])
    for (const soldier of thin.members) {
      enqueueCommand(sim, { type: "kill", soldier })
    }
    stepSimulation(sim)
    expect(joinChoices(sim, player).line[1]?.refusal).toBe("No men left: replacements are coming up")
  })

  it("names a place by its objective when one is near, by its square otherwise", () => {
    const { sim } = battle()
    expect(placeName(sim, 20, 190)).toBe("in square A1")
  })

  it("shows the squads and out to the enemy's nearest line, with ground round them", () => {
    const { sim, squadAt } = battle()
    const player = squadAt(30, 100, Side.French, "player")
    squadAt(150, 100)
    const choices = joinChoices(sim, player)
    const area = joinArea(sim, Side.French, [choices.held, ...choices.line])
    // From the squads at z 100 out to the enemy's line at z 180, 40 m round, within the map's 200 m.
    expect(area).toEqual({ minX: 0, maxX: 197, minZ: 60, maxZ: 200 })
  })
})
