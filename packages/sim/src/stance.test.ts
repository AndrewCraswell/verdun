import { carveTrenches, createFlatMap, type Trench, Surface } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { Side, Stance } from "./components.ts"
import { type LineOfSight } from "./line-of-sight.ts"
import { createLineOfSight } from "./physics-sight.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE,
  WALKING_SPEED
} from "./simulation.ts"
import { createSquad } from "./squads.ts"
import { CRAWL_FACTOR, isInTrench, PRONE_EYE_HEIGHT, SHELTER_CALM, soldierEye } from "./stance.ts"

const opened: LineOfSight[] = []
afterEach(() => {
  for (const lineOfSight of opened.splice(0)) {
    lineOfSight.dispose()
  }
})

/** A flat field with a north-facing fire trench along z = 100, and sight lines attached. */
async function field(): Promise<Simulation> {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
  const trench: Trench = {
    kind: "fire",
    points: [
      [10, 100],
      [190, 100]
    ],
    facing: "north"
  }
  carveTrenches(map, [trench])
  const sim = createSimulation({ map: { ...map, trenches: [trench] }, seed: 1 })
  const lineOfSight = await createLineOfSight(sim.map)
  opened.push(lineOfSight)
  sim.lineOfSight = lineOfSight
  return sim
}

function stepFor(sim: Simulation, seconds: number) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
  }
}

/** A German garrison of four in the trench; the first, its leader, is the sentry. */
function garrison(sim: Simulation) {
  const members = [80, 90, 100, 110].map((x) => spawnSoldier(sim, { side: Side.German, x, z: 100.8 }))
  createSquad(sim, Side.German, members)
  return members
}

/** A field shell landing 20 m in front of the trench now. */
function shellNear(sim: Simulation) {
  sim.artillery.shells.push({
    shell: Shell.FieldHighExplosive,
    side: Side.French,
    x: 95,
    z: 120,
    landsAtTick: sim.tick
  })
}

describe("trenches", () => {
  it("knows which ground lies inside a trench", async () => {
    const sim = await field()

    expect(isInTrench(sim.map, 50, 100)).toBe(true)
    expect(isInTrench(sim.map, 50, 100.9)).toBe(true)
    expect(isInTrench(sim.map, 50, 104)).toBe(false)
    expect(isInTrench(sim.map, 5, 100)).toBe(false)
    expect(isInTrench(sim.map, -5, 100)).toBe(false)
  })
})

describe("stances in the open", () => {
  it("lies a squad down when it stops and gets it up to move, but leaves soldiers without a squad alone", async () => {
    const sim = await field()
    const members = [40, 44].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 40 }))
    createSquad(sim, Side.French, members)
    const loner = spawnSoldier(sim, { side: Side.French, x: 60, z: 40 })
    stepFor(sim, 1)

    expect(members.map((member) => sim.soldiers.stance.value[member])).toEqual([Stance.Prone, Stance.Prone])
    expect(sim.soldiers.stance.value[loner]).toBe(Stance.Standing)
    expect(soldierEye(sim, members[0] ?? -1).y - soldierEye(sim, loner).y).toBeCloseTo(PRONE_EYE_HEIGHT - 1.65)

    enqueueCommand(sim, { type: "move-to", soldier: members[0] ?? -1, x: 40, z: 60 })
    stepFor(sim, 1)
    expect(sim.soldiers.stance.value[members[0] ?? -1]).toBe(Stance.Standing)
  })

  it("keeps pinned soldiers on the ground until the fire slackens", async () => {
    const sim = await field()
    const soldier = spawnSoldier(sim, { side: Side.French, x: 40, z: 40 })
    createSquad(sim, Side.French, [soldier, spawnSoldier(sim, { side: Side.French, x: 30, z: 30 })])
    enqueueCommand(sim, { type: "move-to", soldier, x: 40, z: 80 })
    sim.soldiers.suppression.value[soldier] = 1
    stepFor(sim, 1)

    expect(sim.soldiers.position.z[soldier]).toBe(40)
    expect(sim.soldiers.stance.value[soldier]).toBe(Stance.Prone)
    stepFor(sim, 6)
    expect(sim.soldiers.position.z[soldier]).toBeGreaterThan(40)
  })

  it("lets a player's soldier lie down and crawl", async () => {
    const sim = await field()
    const soldier = spawnSoldier(sim, { side: Side.French, x: 40, z: 40 })
    createSquad(sim, Side.French, [soldier], "player")
    enqueueCommand(sim, { type: "stance", soldier, stance: "prone" })
    enqueueCommand(sim, { type: "steer", soldier, x: 0, z: 1 })
    stepFor(sim, 1)

    expect(sim.soldiers.stance.value[soldier]).toBe(Stance.Prone)
    expect(sim.soldiers.position.z[soldier] - 40).toBeCloseTo(WALKING_SPEED * CRAWL_FACTOR, 1)
    enqueueCommand(sim, { type: "stance", soldier, stance: "standing" })
    stepFor(sim, 1)
    expect(sim.soldiers.stance.value[soldier]).toBe(Stance.Standing)
  })
})

describe("dugouts", () => {
  it("sends a garrison down its dugouts under shellfire, leaving the sentry up", async () => {
    const sim = await field()
    const [sentry, ...men] = garrison(sim)
    shellNear(sim)
    stepFor(sim, 1)

    expect(sim.soldiers.stance.value[sentry ?? -1]).toBe(Stance.Standing)
    expect(men.map((member) => sim.soldiers.stance.value[member])).toEqual([
      Stance.Sheltering,
      Stance.Sheltering,
      Stance.Sheltering
    ])
  })

  it("brings them back up once the shelling has stopped for a while: the race to the parapet", async () => {
    const sim = await field()
    const [, ...men] = garrison(sim)
    shellNear(sim)
    stepFor(sim, SHELTER_CALM - 1)
    expect(men.every((member) => sim.soldiers.stance.value[member] === Stance.Sheltering)).toBe(true)

    // Climbing out takes up to 20 more seconds, so they come up in ones and twos.
    stepFor(sim, 22)
    expect(men.every((member) => sim.soldiers.stance.value[member] === Stance.Standing)).toBe(true)
  })

  it("keeps them down while shells keep landing, and sends climbers back down", async () => {
    const sim = await field()
    const [, ...men] = garrison(sim)
    for (let burst = 0; burst < 6; burst++) {
      shellNear(sim)
      stepFor(sim, 10)
    }

    expect(men.every((member) => sim.soldiers.stance.value[member] === Stance.Sheltering)).toBe(true)
    expect(men.every((member) => sim.soldiers.shelter.emergeAt[member] === -1)).toBe(true)
  })

  it("brings them up early when a sentry sees attackers close and the shells have just lifted", async () => {
    const sim = await field()
    const [, ...men] = garrison(sim)
    shellNear(sim)
    stepFor(sim, 1)
    const attacker = spawnSoldier(sim, { side: Side.French, x: 95, z: 130 })
    // Within a grenade's throw of the bay: without his grenades, so only the sentry's alarm decides it.
    sim.soldiers.grenades.count[attacker] = 0
    stepFor(sim, 3 + 21)

    expect(men.every((member) => sim.soldiers.stance.value[member] === Stance.Standing)).toBe(true)
  })

  it("gets men up and out when they're ordered forward, even under fire", async () => {
    const sim = await field()
    const [, soldier] = garrison(sim)
    shellNear(sim)
    stepFor(sim, 1)
    expect(sim.soldiers.stance.value[soldier ?? -1]).toBe(Stance.Sheltering)

    enqueueCommand(sim, { type: "move-to", soldier: soldier ?? -1, x: 90, z: 60 })
    for (let burst = 0; burst < 3; burst++) {
      shellNear(sim)
      stepFor(sim, 8)
    }
    expect(sim.soldiers.stance.value[soldier ?? -1]).not.toBe(Stance.Sheltering)
    expect(sim.soldiers.position.z[soldier ?? -1]).toBeLessThan(100)
  })

  it("keeps men out of the dugouts of a trench they've taken: they crouch, and stand when the enemy comes", async () => {
    const sim = await field()
    // A German line facing them at z = 200 puts the trench at z = 100 on the French side of no man's land.
    const german: Trench = {
      kind: "fire",
      points: [
        [10, 200],
        [190, 200]
      ],
      facing: "south"
    }
    const taken = createSimulation({ map: { ...sim.map, trenches: [...sim.map.trenches, german] }, seed: 1 })
    taken.lineOfSight = sim.lineOfSight
    const men = garrison(taken)
    shellNear(taken)
    stepFor(taken, 1)

    expect(men.slice(1).map((member) => taken.soldiers.stance.value[member])).toEqual([
      Stance.Crouching,
      Stance.Crouching,
      Stance.Crouching
    ])
    spawnSoldier(taken, { side: Side.French, x: 95, z: 140 })
    stepFor(taken, 5)
    expect(taken.soldiers.stance.value[men[1] ?? -1]).toBe(Stance.Standing)
  })

  it("hides men down a dugout from enemy rifles, and from all but close shells", async () => {
    const sim = await field()
    const [, sheltered] = garrison(sim)
    shellNear(sim)
    stepFor(sim, 1)
    const rifleman = spawnSoldier(sim, { side: Side.French, x: 90, z: 140 })
    stepFor(sim, 2)

    expect(sim.soldiers.target.id[rifleman]).not.toBe(sheltered)
    // A field shell 2 m away would kill an exposed man more often than not; in a dugout he lives.
    sim.artillery.shells.push({
      shell: Shell.FieldHighExplosive,
      side: Side.French,
      x: 90,
      z: 102.5,
      landsAtTick: sim.tick
    })
    stepSimulation(sim)
    expect(sim.soldiers.health.value[sheltered ?? -1]).toBe(1)
  })
})
