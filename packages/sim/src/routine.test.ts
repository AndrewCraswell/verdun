import { carveTrenches, createFlatMap, TRENCH_PROFILE, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { gasWeather } from "./commander.ts"
import { Side, Stance } from "./components.ts"
import { clockAt } from "./environment.ts"
import { createLineOfSight, type LineOfSight } from "./line-of-sight.ts"
import { isNight, isStandTo, restsTonight } from "./routine.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { createSquad, raidGoal, type Squad } from "./squads.ts"
import { typicalWeather, WeatherPattern } from "./weather.ts"
import { cutWire, mendWire, wireAt, wiringPartyCanReach } from "./wire.ts"

const MOONLESS = Date.UTC(1916, 5, 30, 23)
const NOON = Date.UTC(1916, 5, 30, 11)
/** Sunrise at Fleury on 1 July 1916 is about 03:35 UTC: stand-to is the hour before it. */
const DAWN = Date.UTC(1916, 6, 1, 3, 0)
const FRENCH_LINE = 50
const GERMAN_LINE = 200
const fireStep = (line: number, facing: 1 | -1) =>
  line + facing * ((TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2)

const opened: LineOfSight[] = []
afterEach(() => {
  for (const lineOfSight of opened.splice(0)) {
    lineOfSight.dispose()
  }
})

/** Two fire trenches 150 m apart, and with `wired`, a belt of wire 20 m in front of the French one. */
async function lines(utc: number, seed = 1, wired = false): Promise<Simulation> {
  const trenches: Trench[] = [
    {
      kind: "fire",
      points: [
        [20, FRENCH_LINE],
        [180, FRENCH_LINE]
      ],
      facing: "north"
    },
    {
      kind: "fire",
      points: [
        [20, GERMAN_LINE],
        [180, GERMAN_LINE]
      ],
      facing: "south"
    }
  ]
  const map = {
    ...createFlatMap({ name: "lines", cellSize: 0.5, columns: 400, rows: 500 }),
    trenches,
    wire: wired
      ? [
          {
            points: [
              [20, 70],
              [180, 70]
            ] as [number, number][]
          }
        ]
      : []
  }
  carveTrenches(map, trenches)
  const sim = createSimulation({ map, seed, wind: { x: 0, z: 0 }, environment: clockAt(utc) })
  const lineOfSight = await createLineOfSight(map)
  opened.push(lineOfSight)
  sim.lineOfSight = lineOfSight
  return sim
}

function garrison(sim: Simulation, side: Side, x: number, men = 6, controller: Squad["controller"] = "ai"): Squad {
  const z = side === Side.French ? fireStep(FRENCH_LINE, 1) : fireStep(GERMAN_LINE, -1)
  const members = Array.from({ length: men }, (_, slot) => spawnSoldier(sim, { side, x: x + slot * 3, z }))
  return createSquad(sim, side, members, controller)
}

function run(sim: Simulation, seconds: number): void {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
  }
}

describe("the trench routine", () => {
  it("stands to at dawn and dusk, and calls the hours between them night", async () => {
    const dawn = await lines(DAWN)
    expect(isStandTo(dawn)).toBe(true)
    expect(isNight(dawn)).toBe(false)
    const night = await lines(MOONLESS)
    expect(isStandTo(night)).toBe(false)
    expect(isNight(night)).toBe(true)
    expect(isNight(await lines(NOON))).toBe(false)
  })

  it("sends all but the sentry and one other below to sleep at night, and brings them up for stand-to", async () => {
    const sim = await lines(MOONLESS)
    const squad = garrison(sim, Side.French, 60)
    const sleepers = squad.members.slice(2)
    expect(sleepers.every((member) => restsTonight(sim, member))).toBe(true)
    expect(restsTonight(sim, squad.leader)).toBe(false)
    run(sim, 2)
    expect(sleepers.every((member) => sim.soldiers.stance.value[member] === Stance.Sheltering)).toBe(true)
    expect(sim.soldiers.stance.value[squad.leader]).not.toBe(Stance.Sheltering)

    enqueueCommand(sim, { type: "clock", at: DAWN })
    run(sim, 60)
    expect(sleepers.every((member) => sim.soldiers.stance.value[member] !== Stance.Sheltering)).toBe(true)
  })

  it("keeps a player's squad awake", async () => {
    const sim = await lines(MOONLESS)
    const members = [0, 1, 2, 3].map((slot) => spawnSoldier(sim, { side: Side.French, x: 60 + slot * 3, z: 51 }))
    createSquad(sim, Side.French, members, "player")
    expect(members.some((member) => restsTonight(sim, member))).toBe(false)
  })
})

describe("raids", () => {
  it("go out once a night from the garrison nearest the enemy, crawling, then rush in and come home", async () => {
    const sim = await lines(MOONLESS, 3)
    const near = garrison(sim, Side.French, 90)
    garrison(sim, Side.German, 40, 4)
    const phases = new Set<string>()
    let crawled = false
    for (let second = 0; second < 1800 && !phases.has("home"); second++) {
      run(sim, 1)
      if (near.order.kind === "raid") {
        phases.add(near.order.phase)
        crawled ||= near.order.phase === "out" && sim.soldiers.stance.value[near.leader] === Stance.Prone
      }
    }
    expect([...phases]).toContain("out")
    expect({ crawled, phases: [...phases] }).toMatchObject({ crawled: true })
    expect([...phases]).toContain("home")
    const raid = sim.commanders[Side.French]
    expect(raid.lastRaidAt).toBeGreaterThan(0)
  })

  it("head for the enemy's wire, then his trench, then home", () => {
    const order = { kind: "raid" as const, x: 100, z: 200, homeX: 90, homeZ: 50, phase: "out" as const }
    expect(raidGoal(order)).toEqual({ x: 100, z: 175 })
    expect(raidGoal({ ...order, phase: "in" })).toEqual({ x: 100, z: 200 })
    expect(raidGoal({ ...order, phase: "home" })).toEqual({ x: 90, z: 50 })
  })

  it("don't go out by day", async () => {
    const sim = await lines(NOON, 3)
    const squad = garrison(sim, Side.French, 90)
    run(sim, 600)
    expect(squad.order.kind).toBe("hold")
  })
})

describe("gas by night", () => {
  it("waits for a steady wind toward the enemy, and no rain", async () => {
    const sim = await lines(MOONLESS)
    const hold = (wind: { x: number; z: number }, pattern: WeatherPattern = WeatherPattern.Clear) =>
      enqueueCommand(sim, { type: "forecast", forecast: { kind: "steady", weather: typicalWeather(pattern, wind) } })
    hold({ x: 0, z: 2 })
    stepSimulation(sim)
    expect(gasWeather(sim, Side.French)).toBe(true)
    expect(gasWeather(sim, Side.German)).toBe(false)
    hold({ x: 0, z: 8 })
    stepSimulation(sim)
    expect(gasWeather(sim, Side.French)).toBe(false)
    hold({ x: 0, z: 2 }, WeatherPattern.Rain)
    stepSimulation(sim)
    expect(gasWeather(sim, Side.French)).toBe(false)
  })
})

describe("wiring parties", () => {
  it("mend cut wire near their own line at night, where no enemy is close", async () => {
    const sim = await lines(MOONLESS, 1, true)
    garrison(sim, Side.French, 90, 6, "player")
    expect(wireAt(sim.wire, 100, 70)).toBeGreaterThan(0.9)
    cutWire(sim, 100, 70, 6)
    expect(wireAt(sim.wire, 100, 70)).toBeLessThan(0.2)
    run(sim, 300)
    expect(wireAt(sim.wire, 100, 70)).toBeGreaterThan(0.9)
  })

  it("stay in when the enemy is close, or there's no one near to go out", async () => {
    const sim = await lines(MOONLESS, 1, true)
    expect(wiringPartyCanReach(sim, Side.French, 100, 70)).toBe(false)
    garrison(sim, Side.French, 90, 6, "player")
    stepSimulation(sim)
    expect(wiringPartyCanReach(sim, Side.French, 100, 70)).toBe(true)
    spawnSoldier(sim, { side: Side.German, x: 100, z: 80 })
    stepSimulation(sim)
    expect(wiringPartyCanReach(sim, Side.French, 100, 70)).toBe(false)
    expect(mendWire(sim, FRENCH_LINE, 125, () => false)).toBe(0)
  })

  it("don't go out by day", async () => {
    const sim = await lines(NOON, 1, true)
    garrison(sim, Side.French, 90, 6, "player")
    cutWire(sim, 100, 70, 6)
    run(sim, 120)
    expect(wireAt(sim.wire, 100, 70)).toBeLessThan(0.2)
  })
})
