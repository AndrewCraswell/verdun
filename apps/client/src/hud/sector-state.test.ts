import {
  allotReinforcements,
  casualty,
  enqueueCommand,
  FLEURY,
  Side,
  spawnSoldier,
  stepSimulation,
  surrender,
  WeatherPattern
} from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { clockView, createLightReader, holderOf, nextSunCrossing, sectorView, strengthView } from "./sector-state.ts"
import { slot, testBattle } from "./test-battle.ts"

/** 23 June 1916, the prototype's default day, at an hour UTC. */
const june23 = (hours: number) => Date.UTC(1916, 5, 23, hours)

describe("clockView", () => {
  it("gives the hour by a French clock, the week of the war, the weather and where the wind blows from", () => {
    const { sim } = testBattle()
    const view = clockView(sim, createLightReader()(sim))
    // 06:00 UTC on 23 June 1916: French summer time ran an hour ahead from 14 June that year.
    expect(view.hour).toBe("07:00")
    expect(view.week).toBe("Week of 20 June 1916")
    expect(view.weather).toMatchObject({ sky: "fair", label: "Fair", visibility: null })
    expect(view.wind.from).toBe("W")
    expect(view.wind.speed).toBeCloseTo(Math.hypot(2, 0.5), 5)
  })

  it("calls snow snow, and short sight short", () => {
    const { sim } = testBattle()
    sim.environment.weather = {
      ...sim.environment.weather,
      pattern: WeatherPattern.Rain,
      precipitation: 2,
      snowFraction: 0.9,
      visibility: 640
    }
    expect(clockView(sim, createLightReader()(sim)).weather).toMatchObject({
      sky: "snow",
      label: "Snow",
      visibility: 640
    })
  })
})

describe("the light", () => {
  it("finds the next sunrise and sunset", () => {
    const sunrise = nextSunCrossing(june23(0), FLEURY)
    expect(sunrise?.rising).toBe(true)
    expect(new Date(sunrise?.at ?? 0).getUTCHours()).toBe(3)
    const sunset = nextSunCrossing(june23(6), FLEURY)
    expect(sunset?.rising).toBe(false)
    expect(new Date(sunset?.at ?? 0).getUTCHours()).toBe(19)
  })

  it("tells day, dawn, dusk and night, and when the light next changes", () => {
    const { sim } = testBattle()
    const light = createLightReader()
    expect(light(sim)).toMatchObject({ phase: "day", standTo: false })
    expect(light(sim).next).toMatch(/^Sunset 20:\d\d$/)
    enqueueCommand(sim, { type: "clock", at: june23(0) })
    stepSimulation(sim)
    expect(light(sim)).toMatchObject({ phase: "night", standTo: false })
    expect(light(sim).next).toMatch(/^Sunrise 04:\d\d$/)
    // Stand-to at dawn: the sun just under the horizon and climbing.
    enqueueCommand(sim, { type: "clock", at: june23(3) })
    stepSimulation(sim)
    expect(light(sim)).toMatchObject({ phase: "dawn", standTo: true })
    enqueueCommand(sim, { type: "clock", at: june23(20) })
    stepSimulation(sim)
    expect(light(sim)).toMatchObject({ phase: "dusk", standTo: true })
  })
})

describe("sectorView", () => {
  it("says who holds each objective from the player's side, and how far off it lies", () => {
    const { sim } = testBattle()
    const [crossroads, craters] = sim.objectives
    if (!crossroads || !craters) {
      throw new Error("The test map has two objectives")
    }
    crossroads.holder = Side.French
    craters.holder = Side.German
    craters.contested = true
    const view = sectorView(sim, Side.French, { x: 150, z: 70 })
    expect(view.objectives.map((objective) => [objective.name, objective.holder, objective.contested])).toEqual([
      ["Crossroads", "ours", false],
      ["The mine craters", "theirs", true]
    ])
    expect(view.objectives[0]?.distance).toBeCloseTo(30, 5)
    expect(view.control).toEqual({ ours: 0.5, theirs: 0.5 })
    expect(sectorView(sim, Side.German, null).objectives[0]).toMatchObject({ holder: "theirs", distance: null })
    expect(holderOf(-1, Side.French)).toBe("none")
  })
})

describe("strengthView", () => {
  it("counts both sides' killed, wounded and captured, and the side's reserves against its start", () => {
    const { sim, squad, members } = testBattle()
    expect(strengthView(sim, squad).reserves).toBeNull()
    allotReinforcements(sim, Side.French, 40)
    casualty(sim, slot(members, 1), 1)
    casualty(sim, slot(members, 2), 0)
    const german = spawnSoldier(sim, { side: Side.German, x: 150, z: 180 })
    surrender(sim, german)
    expect(strengthView(sim, squad)).toEqual({
      reserves: { men: 40, full: 40 },
      ours: { killed: 1, wounded: 1, captured: 0 },
      theirs: { killed: 0, wounded: 0, captured: 1 }
    })
  })
})
