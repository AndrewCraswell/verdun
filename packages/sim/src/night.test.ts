import { carveTrenches, createFlatMap, TRENCH_PROFILE, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { hitChance, shotEvents } from "./combat.ts"
import { Side } from "./components.ts"
import { clockAt } from "./environment.ts"
import { FLARE, type Flare, flareLight, flarePosition, isDark } from "./flares.ts"
import { createLineOfSight, type LineOfSight } from "./line-of-sight.ts"
import { aimInLight, canMakeOut, sightReach } from "./sight.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { createSquad } from "./squads.ts"
import { soldierEye } from "./stance.ts"

/** A moonless night: 30 June 1916, 23:00 UTC. */
const MOONLESS = Date.UTC(1916, 5, 30, 23)
const NOON = Date.UTC(1916, 5, 30, 11)
/** Fire step of the French trench at z = 50. */
const FIRE_STEP_Z = 50 + (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2

const opened: LineOfSight[] = []
afterEach(() => {
  for (const lineOfSight of opened.splice(0)) {
    lineOfSight.dispose()
  }
})

/** A 200 m by 300 m field at a given moment, with a north-facing French fire trench at z = 50. */
async function field(utc: number, seed = 1): Promise<Simulation> {
  const trench: Trench = {
    kind: "fire",
    points: [
      [20, 50],
      [180, 50]
    ],
    facing: "north"
  }
  const map = { ...createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 600 }), trenches: [trench] }
  carveTrenches(map, [trench])
  const sim = createSimulation({ map, seed, wind: { x: 0, z: 0 }, environment: clockAt(utc) })
  const lineOfSight = await createLineOfSight(map)
  opened.push(lineOfSight)
  sim.lineOfSight = lineOfSight
  return sim
}

function run(sim: Simulation, seconds: number, onStep?: () => void): void {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
    onStep?.()
  }
}

function flareOver(sim: Simulation, x: number, z: number): Flare {
  const flare: Flare = {
    side: Side.French,
    fromX: x,
    fromZ: z - 100,
    x,
    z,
    vx: 0,
    vz: 0,
    firedAt: sim.tick - 2 * TICK_RATE,
    burnsOutAt: sim.tick + 5 * TICK_RATE
  }
  sim.flares.push(flare)
  return flare
}

describe("flares", () => {
  it("rise in a second and a half, then sink and drift as they burn", () => {
    const flare: Flare = {
      side: Side.German,
      fromX: 0,
      fromZ: 0,
      x: 0,
      z: 100,
      vx: 2,
      vz: 0,
      firedAt: 0,
      burnsOutAt: 160
    }
    expect(flarePosition(flare, 0)).toEqual({ x: 0, y: 0, z: 0 })
    expect(flarePosition(flare, 15).z).toBeCloseTo(50)
    const up = flarePosition(flare, FLARE.riseSeconds * TICK_RATE)
    expect(up.y).toBeCloseTo(FLARE.height)
    expect(up.z).toBeCloseTo(100)
    const later = flarePosition(flare, FLARE.riseSeconds * TICK_RATE + 2 * TICK_RATE)
    expect(later.y).toBeCloseTo(FLARE.height - 2 * FLARE.sinkRate)
    expect(later.x).toBeCloseTo(4)
  })

  it("light the ground beneath them and nowhere else", async () => {
    const sim = await field(MOONLESS)
    expect(flareLight(sim, 100, 200)).toBe(0)
    flareOver(sim, 100, 200)
    expect(flareLight(sim, 100, 200)).toBeCloseTo(FLARE.peakLux)
    expect(flareLight(sim, 100, 200 + FLARE.radius / 2)).toBeGreaterThan(0)
    expect(flareLight(sim, 100, 200 + FLARE.radius + 1)).toBe(0)
  })

  it("go up over men heard moving in front of the wire, and burn out", async () => {
    const sim = await field(MOONLESS)
    const sentry = spawnSoldier(sim, { side: Side.French, x: 100, z: FIRE_STEP_Z })
    createSquad(sim, Side.French, [sentry])
    const raider = spawnSoldier(sim, { side: Side.German, x: 100, z: 160 })
    createSquad(sim, Side.German, [raider])
    enqueueCommand(sim, { type: "move-to", soldier: raider, x: 100, z: 120 })
    let fired = 0
    run(sim, 2, () => (fired += sim.events.filter((event) => event.type === "flare").length))
    expect(fired).toBeGreaterThan(0)
    const flare = sim.flares[0]!
    expect(flare.side).toBe(Side.French)
    expect(Math.abs(flare.z - sim.soldiers.position.z[raider])).toBeLessThan(10)
    run(sim, FLARE.burnSeconds + 1)
    expect(sim.flares.every((each) => each.firedAt > flare.firedAt)).toBe(true)
  })

  it("go up now and then over a quiet line at night, and never by day", async () => {
    const quiet = async (utc: number) => {
      const sim = await field(utc)
      const sentries = [60, 100, 140].map((x) => spawnSoldier(sim, { side: Side.French, x, z: FIRE_STEP_Z }))
      sentries.forEach((sentry) => createSquad(sim, Side.French, [sentry]))
      const rngBefore = sim.rng.state
      let fired = 0
      run(sim, 600, () => (fired += sim.events.filter((event) => event.type === "flare").length))
      return { fired, drew: sim.rng.state !== rngBefore, dark: isDark(sim) }
    }
    const night = await quiet(MOONLESS)
    expect(night.dark).toBe(true)
    expect(night.fired).toBeGreaterThan(2)
    const day = await quiet(NOON)
    expect(day.fired).toBe(0)
    expect(day.drew).toBe(false)
  })
})

describe("seeing at night", () => {
  it("makes men out at tens of metres, or under a flare, or by their muzzle flash", async () => {
    const sim = await field(MOONLESS)
    const watcher = spawnSoldier(sim, { side: Side.French, x: 100, z: 60 })
    const near = spawnSoldier(sim, { side: Side.German, x: 100, z: 85 })
    const far = spawnSoldier(sim, { side: Side.German, x: 100, z: 260 })
    stepSimulation(sim)
    const eye = soldierEye(sim, watcher)
    expect(canMakeOut(sim, eye, near)).toBe(true)
    expect(canMakeOut(sim, eye, far)).toBe(false)

    flareOver(sim, 100, 260)
    expect(sightReach(sim, far)).toBeGreaterThan(250)
    expect(canMakeOut(sim, eye, far)).toBe(true)
    sim.flares.length = 0

    sim.soldiers.weapon.firedAt[far] = sim.tick
    expect(canMakeOut(sim, eye, far)).toBe(true)
    run(sim, 2)
    expect(canMakeOut(sim, eye, far)).toBe(false)
  })

  it("lets a rifleman fire back at a muzzle flash, though not well", async () => {
    const sim = await field(MOONLESS)
    const french = spawnSoldier(sim, { side: Side.French, x: 100, z: 60 })
    const german = spawnSoldier(sim, { side: Side.German, x: 100, z: 200 })
    run(sim, 3)
    expect(sim.soldiers.target.id[french]).toBe(-1)
    sim.soldiers.weapon.firedAt[german] = sim.tick
    let shots = 0
    run(sim, 1, () => (shots += shotEvents(sim.events).filter((shot) => shot.shooter === french).length))
    expect(shots).toBeGreaterThan(0)
    expect(aimInLight(sim, german)).toBeCloseTo(0.3)
  })

  it("aims by daylight as well as ever, and by a flare nearly so", async () => {
    const day = await field(NOON)
    const shooter = spawnSoldier(day, { side: Side.German, x: 100, z: 200 })
    const target = spawnSoldier(day, { side: Side.French, x: 100, z: 120 })
    expect(aimInLight(day, target)).toBe(1)
    const byDay = hitChance(day, shooter, target)

    const night = await field(MOONLESS)
    const nightShooter = spawnSoldier(night, { side: Side.German, x: 100, z: 200 })
    const nightTarget = spawnSoldier(night, { side: Side.French, x: 100, z: 120 })
    const inTheDark = hitChance(night, nightShooter, nightTarget)
    flareOver(night, 100, 120)
    const underFlare = hitChance(night, nightShooter, nightTarget)
    expect(inTheDark).toBeLessThan(byDay * 0.35)
    expect(underFlare).toBeGreaterThan(inTheDark * 2)
  })

  it("saves flares and muzzle flashes with the world", async () => {
    const sim = await field(MOONLESS)
    const french = spawnSoldier(sim, { side: Side.French, x: 100, z: 60 })
    flareOver(sim, 100, 200)
    sim.soldiers.weapon.firedAt[french] = sim.tick
    const file = JSON.stringify(takeSnapshot(sim))
    const restored = restoreSimulation(sim.map, JSON.parse(file))
    expect(restored.flares).toEqual(sim.flares)
    expect(restored.soldiers.weapon.firedAt[french]).toBe(sim.tick)
  })
})
