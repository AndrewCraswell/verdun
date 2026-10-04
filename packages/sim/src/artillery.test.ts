import { carveTrenches, createFlatMap, heightAt, layOutFront, mapDepth, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import {
  addAmmunition,
  DEFENSIVE_BARRAGE_DELAY,
  defensiveBarrageDelay,
  frontLineZ,
  observation,
  Shell,
  SHELLS,
  UNLIMITED
} from "./artillery.ts"
import { Side } from "./components.ts"
import { createLineOfSight, type LineOfSight } from "./line-of-sight.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  type SimEvent,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { createSquad, isAlive } from "./squads.ts"
import { typicalWeather, WeatherPattern } from "./weather.ts"

const opened: LineOfSight[] = []
afterEach(() => {
  for (const lineOfSight of opened.splice(0)) {
    lineOfSight.dispose()
  }
})

/** A flat 200 m field, optionally with a north-facing trench at z = 100, with sight lines attached. */
async function field(seed = 1, withTrench = false): Promise<Simulation> {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5)
  if (withTrench) {
    const trench: Trench = {
      kind: "fire",
      points: [
        [10, 100],
        [190, 100]
      ],
      facing: "north"
    }
    carveTrenches(map, [trench])
  }
  const sim = createSimulation({ map, seed })
  const lineOfSight = await createLineOfSight(map)
  opened.push(lineOfSight)
  sim.lineOfSight = lineOfSight
  return sim
}

function stepFor(sim: Simulation, seconds: number, onStep?: (events: readonly SimEvent[]) => void) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
    onStep?.(sim.events)
  }
}

function bursts(events: readonly SimEvent[]) {
  return events.filter((event) => event.type === "burst")
}

/** Drops one shell of a kind exactly on a point, landing during the next step. */
function drop(sim: Simulation, shell: Shell, x: number, z: number, side: Side = Side.French) {
  sim.artillery.shells.push({ shell, side, x, z, landsAtTick: sim.tick })
}

describe("fire missions", () => {
  it("disperse rounds around the aim, far more in range than in deflection", async () => {
    const sim = await field()
    enqueueCommand(sim, {
      type: "fire-mission",
      plan: {
        side: Side.French,
        shell: Shell.FieldHighExplosive,
        fromX: 100,
        toX: 100,
        z: 100,
        band: 0,
        roundsPerMinute: 600,
        delay: 0,
        duration: 30
      }
    })
    const landings: { x: number; z: number }[] = []
    stepFor(sim, 50, (events) => landings.push(...bursts(events).map((burst) => burst.at)))

    expect(landings.length).toBeGreaterThan(280)
    const within = (values: number[], limit: number) =>
      values.filter((value) => Math.abs(value) <= limit).length / values.length
    const xs = landings.map((landing) => landing.x - 100)
    const zs = landings.map((landing) => landing.z - 100)
    const stats = SHELLS[Shell.FieldHighExplosive]
    // About half within the probable error, as the term means.
    expect(within(zs, stats.rangeError)).toBeGreaterThan(0.4)
    expect(within(zs, stats.rangeError)).toBeLessThan(0.6)
    expect(within(xs, stats.deflectionError)).toBeGreaterThan(0.4)
    expect(within(xs, stats.deflectionError)).toBeLessThan(0.6)
  })

  it("misses the same way every round of an observed shoot in fog, and is corrected where observers can see", async () => {
    /** The mean landing of six observed missions' rounds, off their aim, in metres along z. */
    const missedBy = async (pattern: WeatherPattern) => {
      const sim = await field()
      enqueueCommand(sim, {
        type: "forecast",
        forecast: { kind: "steady", weather: typicalWeather(pattern, sim.wind) }
      })
      stepSimulation(sim)
      const offsets: number[] = []
      for (let mission = 0; mission < 6; mission++) {
        enqueueCommand(sim, {
          type: "fire-mission",
          plan: {
            side: Side.French,
            shell: Shell.FieldHighExplosive,
            fromX: 100,
            toX: 100,
            z: 100,
            band: 0,
            roundsPerMinute: 600,
            delay: 0,
            duration: 6,
            observed: true
          }
        })
        const landings: number[] = []
        stepFor(sim, 26, (events) => landings.push(...bursts(events).map((burst) => burst.at.z - 100)))
        offsets.push(landings.reduce((sum, z) => sum + z, 0) / landings.length)
      }
      return offsets.reduce((sum, offset) => sum + Math.abs(offset), 0) / offsets.length
    }
    const clear = await missedBy(WeatherPattern.Clear)
    const fog = await missedBy(WeatherPattern.Fog)
    expect(fog).toBeGreaterThan(clear * 2)
    expect(fog).toBeGreaterThan(20)
  })

  it("lands after the ordered delay plus the shells' flight time from batteries far behind the lines", async () => {
    const sim = await field()
    enqueueCommand(sim, {
      type: "fire-mission",
      plan: {
        side: Side.French,
        shell: Shell.HeavyHighExplosive,
        fromX: 100,
        toX: 100,
        z: 100,
        band: 0,
        roundsPerMinute: 60,
        delay: 20,
        duration: 1
      }
    })
    let firstBurst = -1
    stepFor(sim, 60, (events) => {
      if (firstBurst < 0 && bursts(events).length > 0) {
        firstBurst = sim.tick / TICK_RATE
      }
    })
    // 20 s delay, then about 4.1 km at 300 m/s.
    expect(firstBurst).toBeGreaterThan(30)
    expect(firstBurst).toBeLessThan(40)
    expect(sim.artillery.missions[0]?.finished).toBe(true)
  })
})

describe("high-explosive bursts", () => {
  /** Casualty rate for a man at (100, 100), from shells landing `distance` metres away: east, or north of a trench. */
  async function casualtyRate(shell: Shell, distance: number, inTrench: boolean, trials = 60) {
    let casualties = 0
    for (let trial = 0; trial < trials; trial++) {
      const sim = await field(trial + 1, inTrench)
      const soldier = spawnSoldier(sim, { side: Side.German, x: 100, z: 100 })
      if (inTrench) {
        drop(sim, shell, 100, 100 + distance)
      } else {
        drop(sim, shell, 100 + distance, 100)
      }
      stepSimulation(sim)
      if (sim.soldiers.health.value[soldier] < 1) {
        casualties += 1
      }
    }
    return casualties / trials
  }

  it("cause about half casualties at the half-lethal distance in the open, fewer further out", async () => {
    const atHalf = await casualtyRate(Shell.FieldHighExplosive, SHELLS[Shell.FieldHighExplosive].lethalExposed, false)
    const further = await casualtyRate(Shell.FieldHighExplosive, 15, false)

    expect(atHalf).toBeGreaterThan(0.3)
    expect(atHalf).toBeLessThan(0.7)
    expect(further).toBeLessThan(atHalf)
  })

  it("rarely hurt men in a trench from a shell landing outside it", async () => {
    // A field shell 4 m out in front of the trench: the parapet and trench wall take the fragments.
    expect(await casualtyRate(Shell.FieldHighExplosive, 4, true)).toBeLessThan(0.1)
  })

  it("are lethal along a straight trench: the reason trenches were dug with traverses", async () => {
    let casualties = 0
    for (let trial = 0; trial < 30; trial++) {
      const sim = await field(trial + 1, true)
      const soldier = spawnSoldier(sim, { side: Side.German, x: 100, z: 100 })
      drop(sim, Shell.FieldHighExplosive, 104, 100)
      stepSimulation(sim)
      casualties += sim.soldiers.health.value[soldier] < 1 ? 1 : 0
    }
    expect(casualties / 30).toBeGreaterThan(0.5)
  })

  it("dig craters, suppress and shake everyone nearby, and update sight lines soon after", async () => {
    const sim = await field()
    const near = spawnSoldier(sim, { side: Side.German, x: 100, z: 130 })
    const far = spawnSoldier(sim, { side: Side.German, x: 100, z: 195 })
    // Step once first: sight lines rebuild on every tenth tick, and this lands on tick 1.
    stepSimulation(sim)
    const before = heightAt(sim.map, 100, 100)
    drop(sim, Shell.HeavyHighExplosive, 100, 100)
    stepSimulation(sim)

    expect(heightAt(sim.map, 100, 100)).toBeLessThan(before - 1)
    expect(sim.soldiers.suppression.value[near]).toBeGreaterThan(0.3)
    expect(sim.soldiers.morale.value[near]).toBeLessThan(1)
    expect(sim.soldiers.suppression.value[far]).toBe(0)
    expect(sim.artillery.pendingSightRebuild).not.toBeNull()
    stepFor(sim, 2.1)
    expect(sim.artillery.pendingSightRebuild).toBeNull()
  })

  it("kill or wound regardless of side: crowding your own barrage is deadly", async () => {
    const sim = await field(3)
    const french = spawnSoldier(sim, { side: Side.French, x: 100, z: 100 })
    drop(sim, Shell.HeavyHighExplosive, 100.5, 100, Side.French)
    stepSimulation(sim)

    expect(isAlive(sim, french)).toBe(false)
  })
})

describe("shrapnel", () => {
  it("bursts in the air short of its aim and sprays the ground ahead, not behind", async () => {
    let ahead = 0
    let behind = 0
    for (let trial = 0; trial < 40; trial++) {
      const sim = await field(trial + 1)
      const target = spawnSoldier(sim, { side: Side.German, x: 100, z: 110 })
      const rear = spawnSoldier(sim, { side: Side.German, x: 100, z: 60 })
      drop(sim, Shell.FieldShrapnel, 100, 100, Side.French)
      stepSimulation(sim)
      const [burst] = bursts(sim.events)
      expect(burst?.crater).toBeNull()
      expect(burst?.at.y).toBeGreaterThan(5 + 5)
      ahead += sim.soldiers.health.value[target] < 1 ? 1 : 0
      behind += sim.soldiers.health.value[rear] < 1 ? 1 : 0
    }

    expect(ahead).toBeGreaterThan(5)
    expect(behind).toBe(0)
  })
})

describe("creeping barrage attack", () => {
  async function attack() {
    const sim = await field()
    const members = [90, 95, 100, 105].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 20 }))
    const squad = createSquad(sim, Side.French, members)
    enqueueCommand(sim, {
      type: "barrage-attack",
      side: Side.French,
      fromX: 60,
      toX: 140,
      startZ: 60,
      objectiveZ: 120,
      roundsPerMinute: 30,
      lift: 25,
      interval: 20,
      standoff: 50,
      delay: 0
    })
    stepSimulation(sim)
    return { sim, squad, members }
  }

  it("lifts its line forward in steps and stops past the objective", async () => {
    const { sim } = await attack()
    const mission = sim.artillery.missions[0]

    expect(mission?.lineZ).toBe(60)
    stepFor(sim, 21)
    expect(mission?.lineZ).toBe(85)
    stepFor(sim, 200)
    expect(mission?.finished).toBe(true)
  })

  it("keeps the infantry behind the barrage, then sends them onto the objective once it lifts past", async () => {
    const { sim, squad, members } = await attack()
    expect(squad.order.kind).toBe("creep")

    stepFor(sim, 30)
    const line = sim.artillery.missions[0]?.lineZ ?? 0
    for (const member of members.filter((soldier) => isAlive(sim, soldier))) {
      expect(sim.soldiers.position.z[member]).toBeLessThanOrEqual(line - 50 + 0.5)
    }

    stepFor(sim, 200)
    const survivors = members.filter((member) => isAlive(sim, member))
    expect(survivors.length).toBeGreaterThan(0)
    for (const member of survivors) {
      expect(sim.soldiers.position.z[member]).toBeCloseTo(120, 0)
    }
  })
})

describe("protective barrage", () => {
  it("lifts a full lift beyond the objective, then jumps to a protective line beyond it and holds", async () => {
    const sim = await field()
    enqueueCommand(sim, {
      type: "barrage-attack",
      side: Side.French,
      fromX: 60,
      toX: 140,
      startZ: 60,
      objectiveZ: 110,
      roundsPerMinute: 30,
      lift: 20,
      interval: 10,
      standoff: 40,
      delay: 0
    })
    stepSimulation(sim)
    const mission = sim.artillery.missions[0]
    const linesSeen = new Set<number>()
    for (let step = 0; step < 150 * TICK_RATE && !mission?.finished; step++) {
      stepSimulation(sim)
      linesSeen.add(Math.round(mission?.lineZ ?? 0))
    }

    expect([...linesSeen]).toEqual([60, 80, 100, 130, 260])
    expect(mission?.finished).toBe(true)
  })
})

describe("standing barrage", () => {
  it("holds on the objective while the creeping barrage approaches, and lifts as it arrives", async () => {
    const sim = await field()
    enqueueCommand(sim, {
      type: "barrage-attack",
      side: Side.French,
      fromX: 60,
      toX: 140,
      startZ: 60,
      objectiveZ: 160,
      roundsPerMinute: 30,
      lift: 25,
      interval: 20,
      standoff: 50,
      delay: 0,
      standingRoundsPerMinute: 50
    })
    stepSimulation(sim)
    const [creeping, fieldGuns, heavy] = sim.artillery.missions

    expect(creeping?.creep).toBeDefined()
    expect([fieldGuns?.shell, heavy?.shell]).toEqual([Shell.FieldHighExplosive, Shell.HeavyHighExplosive])
    expect([fieldGuns?.z, heavy?.z]).toEqual([160, 160])
    expect(heavy?.roundsPerMinute).toBe(10)
    // Three lifts bring the creeping barrage to 135, one lift short of the objective: the standing barrage lifts then.
    expect(fieldGuns?.duration).toBe(3 * 20)
  })
})

describe("defensive barrage", () => {
  it("is called when defenders see attackers in no man's land, and lands after the historical delay", async () => {
    const flat = createFlatMap({ name: "sector", cellSize: 0.5, columns: 600, rows: 400 }, 5)
    const map = { ...flat, trenches: layOutFront(flat) }
    const sim = createSimulation({ map, seed: 1 })
    const lineOfSight = await createLineOfSight(map)
    opened.push(lineOfSight)
    sim.lineOfSight = lineOfSight
    const germanLine = frontLineZ(map.trenches, Side.German) ?? 0
    const frenchLine = frontLineZ(map.trenches, Side.French) ?? 0
    spawnSoldier(sim, { side: Side.German, x: 150, z: germanLine })
    spawnSoldier(sim, { side: Side.French, x: 150, z: (germanLine + frenchLine) / 2 })
    stepFor(sim, 2)

    expect(sim.artillery.sosCalledAt[Side.German]).toBeGreaterThanOrEqual(0)
    expect(sim.artillery.sosCalledAt[Side.French]).toBe(-1)
    const [explosive, shrapnel] = sim.artillery.missions
    expect(explosive?.side).toBe(Side.German)
    expect(shrapnel?.shell).toBe(Shell.FieldShrapnel)
    expect((explosive?.startTick ?? 0) - sim.artillery.sosCalledAt[Side.German]).toBe(
      DEFENSIVE_BARRAGE_DELAY * TICK_RATE
    )
    // In front of the German wire, between the lines.
    expect(explosive?.z).toBeLessThan(germanLine)
    expect(explosive?.z).toBeGreaterThan(frenchLine)
    expect(frontLineZ([], Side.French)).toBeNull()
    expect(mapDepth(map)).toBe(200)
  })
})

describe("observation", () => {
  it("is good on a clear day, poor at night and in fog, and slows the SOS barrage in fog", async () => {
    const sim = await field()
    const hold = (pattern: WeatherPattern) => {
      enqueueCommand(sim, {
        type: "forecast",
        forecast: { kind: "steady", weather: typicalWeather(pattern, sim.wind) }
      })
      stepSimulation(sim)
    }
    hold(WeatherPattern.Clear)
    expect(observation(sim)).toBeGreaterThan(0.9)
    expect(defensiveBarrageDelay(sim)).toBe(DEFENSIVE_BARRAGE_DELAY)
    hold(WeatherPattern.Fog)
    expect(observation(sim)).toBeLessThan(0.1)
    expect(defensiveBarrageDelay(sim)).toBeGreaterThan(DEFENSIVE_BARRAGE_DELAY * 2)
    hold(WeatherPattern.Clear)
    enqueueCommand(sim, { type: "clock", at: Date.UTC(1916, 5, 23, 23) })
    stepSimulation(sim)
    expect(observation(sim)).toBeLessThan(0.35)
  })
})

describe("artillery state", () => {
  it("saves and restores missions and shells in flight, then plays on identically", async () => {
    const sim = await field(5)
    for (const x of [80, 100, 120]) {
      spawnSoldier(sim, { side: Side.German, x, z: 150 })
    }
    enqueueCommand(sim, {
      type: "fire-mission",
      plan: {
        side: Side.French,
        shell: Shell.FieldHighExplosive,
        fromX: 70,
        toX: 130,
        z: 150,
        band: 20,
        roundsPerMinute: 120,
        delay: 0,
        duration: 30
      }
    })
    stepFor(sim, 15)
    expect(sim.artillery.shells.length).toBeGreaterThan(0)

    const file = JSON.stringify(takeSnapshot(sim))
    // The map saves separately: give the restored simulation its own copy, with its own sight lines.
    const map = { ...sim.map, heights: sim.map.heights.slice(), surfaces: sim.map.surfaces.slice() }
    const restored = restoreSimulation(map, JSON.parse(file))
    const lineOfSight = await createLineOfSight(map)
    opened.push(lineOfSight)
    restored.lineOfSight = lineOfSight
    stepFor(sim, 5)
    stepFor(restored, 5)
    expect(takeSnapshot(restored)).toEqual(takeSnapshot(sim))
  })
})

describe("ammunition", () => {
  it("is unlimited unless a scenario sets it, and runs out round by round", async () => {
    const sim = await field()
    expect(sim.artillery.ammunition[Side.French][Shell.FieldHighExplosive]).toBe(UNLIMITED)
    enqueueCommand(sim, { type: "ammunition", side: Side.French, shell: Shell.FieldHighExplosive, rounds: 5 })
    enqueueCommand(sim, {
      type: "fire-mission",
      plan: {
        side: Side.French,
        shell: Shell.FieldHighExplosive,
        fromX: 60,
        toX: 140,
        z: 150,
        band: 20,
        roundsPerMinute: 120,
        delay: 0,
        duration: 60
      }
    })
    const outOfShells: unknown[] = []
    stepFor(sim, 10, (events) => outOfShells.push(...events.filter((event) => event.type === "out-of-shells")))

    expect(sim.artillery.ammunition[Side.French][Shell.FieldHighExplosive]).toBe(0)
    expect(sim.artillery.missions[0]?.finished).toBe(true)
    expect(outOfShells).toEqual([{ type: "out-of-shells", side: Side.French, shell: Shell.FieldHighExplosive }])
    expect(sim.artillery.shells.length + bursts(sim.events).length).toBeLessThanOrEqual(5)
  })

  it("is topped up by allotments, never below none nor above unlimited, and ignores nonsense", async () => {
    const sim = await field()
    enqueueCommand(sim, { type: "ammunition", side: Side.German, shell: Shell.FieldGas, rounds: 10 })
    enqueueCommand(sim, { type: "ammunition", side: Side.German, shell: Shell.FieldGas, rounds: -3 })
    stepSimulation(sim)
    addAmmunition(sim, Side.German, Shell.FieldGas, 40)
    expect(sim.artillery.ammunition[Side.German][Shell.FieldGas]).toBe(50)
    addAmmunition(sim, Side.German, Shell.FieldGas, -100)
    expect(sim.artillery.ammunition[Side.German][Shell.FieldGas]).toBe(0)
    addAmmunition(sim, Side.German, Shell.HeavyHighExplosive, 5)
    expect(sim.artillery.ammunition[Side.German][Shell.HeavyHighExplosive]).toBe(UNLIMITED)
  })
})
