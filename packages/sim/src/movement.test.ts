import { carveTrenches, createFlatMap, Surface, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { hitChance } from "./combat.ts"
import { Side, Stance } from "./components.ts"
import { createLineOfSight, type LineOfSight } from "./line-of-sight.ts"
import {
  createSimulation,
  enqueueCommand,
  FULL_STAMINA,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE,
  WALKING_SPEED
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { isInTrench, seesOverParapet, soldierEye } from "./stance.ts"
import { canRun, WINDED } from "./systems/movement.ts"

const opened: LineOfSight[] = []
afterEach(() => {
  for (const lineOfSight of opened.splice(0)) {
    lineOfSight.dispose()
  }
})

/** A 100 m square of firm ground, with a north-facing fire trench along z = 50 if asked. */
function field(withTrench = false): Simulation {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass)
  if (!withTrench) {
    return createSimulation({ map, seed: 1 })
  }
  const trench: Trench = {
    kind: "fire",
    points: [
      [10, 50],
      [90, 50]
    ],
    facing: "north"
  }
  carveTrenches(map, [trench])
  return createSimulation({ map: { ...map, trenches: [trench] }, seed: 1 })
}

function run(sim: Simulation, seconds: number, onStep?: () => boolean | void): number {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
    if (onStep?.() === true) {
      return (step + 1) / TICK_RATE
    }
  }
  return seconds
}

/** A soldier the player steers north, at a stance, running or not. */
function steered(sim: Simulation, x: number, z: number, stance: "standing" | "crouching" | "prone", running = false) {
  const soldier = spawnSoldier(sim, { side: Side.French, x, z })
  enqueueCommand(sim, { type: "stance", soldier, stance })
  enqueueCommand(sim, { type: "steer", soldier, x: 0, z: 1, run: running })
  return soldier
}

describe("moving at each stance", () => {
  it("runs at twice walking pace, crouch-walks at 0.6 and crawls at a quarter", () => {
    const sim = field()
    const walker = steered(sim, 10, 10, "standing")
    const runner = steered(sim, 20, 10, "standing", true)
    const croucher = steered(sim, 30, 10, "crouching")
    const crawler = steered(sim, 40, 10, "prone")
    run(sim, 5)
    const covered = (soldier: number) => sim.soldiers.position.z[soldier] - 10

    expect(covered(walker)).toBeCloseTo(5 * WALKING_SPEED, 0)
    expect(covered(runner)).toBeCloseTo(2 * covered(walker), 0)
    expect(covered(croucher) / covered(walker)).toBeCloseTo(0.6, 1)
    expect(covered(crawler) / covered(walker)).toBeCloseTo(0.25, 1)
  })

  it("can't run crouching or prone: the run key only lengthens a standing man's stride", () => {
    const sim = field()
    const croucher = steered(sim, 30, 10, "crouching", true)
    const walker = steered(sim, 40, 10, "crouching")
    run(sim, 3)

    expect(sim.soldiers.position.z[croucher]).toBeCloseTo(sim.soldiers.position.z[walker], 3)
  })
})

describe("stamina", () => {
  it("runs out after about 70 m of running, then he walks, and gets his breath back standing still", () => {
    const sim = field()
    const soldier = steered(sim, 50, 5, "standing", true)
    const winded = run(sim, 40, () => !canRun(sim, soldier))
    const ran = sim.soldiers.position.z[soldier] - 5

    expect(winded).toBeGreaterThan(17)
    expect(winded).toBeLessThan(21)
    expect(ran).toBeGreaterThan(48)
    expect(ran).toBeLessThan(60)
    expect(sim.soldiers.stamina.value[soldier]).toBeLessThan(WINDED)

    enqueueCommand(sim, { type: "steer", soldier, x: 0, z: 0 })
    run(sim, 10)
    expect(sim.soldiers.stamina.value[soldier]).toBeGreaterThan(70)
    expect(canRun(sim, soldier)).toBe(true)
  })

  it("leaves a man run right out walking slowly until he has his breath back", () => {
    const sim = field()
    const spent = steered(sim, 30, 10, "standing")
    const fresh = steered(sim, 40, 10, "standing")
    sim.soldiers.stamina.value[spent] = 0
    sim.soldiers.stamina.spent[spent] = 1
    run(sim, 1)

    expect(sim.soldiers.stamina.spent[spent]).toBe(1)
    expect((sim.soldiers.position.z[spent] - 10) / (sim.soldiers.position.z[fresh] - 10)).toBeCloseTo(0.75, 1)
    run(sim, 13)
    expect(sim.soldiers.stamina.spent[spent]).toBe(0)
    expect(sim.soldiers.stamina.value[fresh]).toBe(FULL_STAMINA)
  })

  it("won't let broken men run", () => {
    const sim = field()
    const soldier = spawnSoldier(sim, { side: Side.French, x: 50, z: 10 })
    sim.soldiers.morale.value[soldier] = 0.1

    expect(canRun(sim, soldier)).toBe(false)
  })

  it("recovers more slowly in a gas mask or when shaken", () => {
    const sim = field()
    const calm = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const masked = spawnSoldier(sim, { side: Side.French, x: 20, z: 10 })
    const shaken = spawnSoldier(sim, { side: Side.French, x: 30, z: 10 })
    for (const soldier of [calm, masked, shaken]) {
      sim.soldiers.stamina.value[soldier] = 0
    }
    sim.soldiers.mask.state[masked] = 2
    sim.soldiers.morale.value[shaken] = 0.4
    run(sim, 4)

    expect(sim.soldiers.stamina.value[calm]).toBeCloseTo(20, 0)
    expect(sim.soldiers.stamina.value[masked]).toBeCloseTo(10, 0)
    expect(sim.soldiers.stamina.value[shaken]).toBeLessThan(11)
  })
})

describe("climbing", () => {
  it("takes a few seconds to scramble out of a trench, running or not, and costs breath", () => {
    const outOf = (running: boolean) => {
      const sim = field(true)
      const soldier = steered(sim, 50, 50, "standing", running)
      const seconds = run(sim, 20, () => !isInTrench(sim.map, sim.soldiers.position.x[soldier], 55))
      const left = run(
        sim,
        20,
        () => !isInTrench(sim.map, sim.soldiers.position.x[soldier], sim.soldiers.position.z[soldier])
      )
      return { seconds: seconds + left, stamina: sim.soldiers.stamina.value[soldier] }
    }
    const walking = outOf(false)
    const running = outOf(true)

    expect(walking.seconds).toBeGreaterThan(2)
    expect(walking.seconds).toBeLessThan(7)
    // Running at a wall gets a man up it no faster.
    expect(running.seconds).toBeGreaterThan(walking.seconds * 0.6)
    expect(walking.stamina).toBeLessThan(FULL_STAMINA - 10)
  })
})

describe("the fire step", () => {
  it("puts a standing man's head over the parapet, and a crouching man's below it", async () => {
    const sim = field(true)
    const onStep = spawnSoldier(sim, { side: Side.French, x: 50, z: 50.7 })
    const onFloor = spawnSoldier(sim, { side: Side.French, x: 52, z: 49.8 })
    const inOpen = spawnSoldier(sim, { side: Side.French, x: 50, z: 20 })

    expect(seesOverParapet(sim, onStep)).toBe(true)
    expect(seesOverParapet(sim, onFloor)).toBe(false)
    expect(seesOverParapet(sim, inOpen)).toBe(false)
    sim.soldiers.stance.value[onStep] = Stance.Crouching
    expect(seesOverParapet(sim, onStep)).toBe(false)

    // Watched from no man's land, the crouched man's head is hidden and the standing man's shows.
    const lineOfSight = await createLineOfSight(sim.map)
    opened.push(lineOfSight)
    const german = spawnSoldier(sim, { side: Side.German, x: 50, z: 90 })
    const seen = () => lineOfSight.isClear(soldierEye(sim, german), soldierEye(sim, onStep))
    expect(seen()).toBe(false)
    sim.soldiers.stance.value[onStep] = Stance.Standing
    expect(seen()).toBe(true)
  })

  it("makes a crouching man in the open harder to hit than a standing one", async () => {
    const sim = field()
    const lineOfSight = await createLineOfSight(sim.map)
    opened.push(lineOfSight)
    sim.lineOfSight = lineOfSight
    const german = spawnSoldier(sim, { side: Side.German, x: 50, z: 90 })
    const target = spawnSoldier(sim, { side: Side.French, x: 50, z: 40 })
    const standing = hitChance(sim, german, target)
    sim.soldiers.stance.value[target] = Stance.Crouching

    expect(hitChance(sim, german, target) / standing).toBeCloseTo(0.6)
  })
})

describe("movement state", () => {
  it("resumes exactly from a snapshot, mid-run and out of breath", () => {
    const sim = field()
    steered(sim, 30, 10, "standing", true)
    steered(sim, 40, 10, "crouching")
    run(sim, 20)
    const file = JSON.stringify(takeSnapshot(sim))
    const restored = restoreSimulation(sim.map, JSON.parse(file))
    run(sim, 5)
    run(restored, 5)

    expect(takeSnapshot(restored)).toEqual(takeSnapshot(sim))
  })
})
