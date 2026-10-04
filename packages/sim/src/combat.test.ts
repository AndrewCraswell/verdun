import { carveTrenches, createFlatMap, TRENCH_PROFILE, type Trench } from "@verdun/map"
import { hasComponent } from "bitecs"
import { afterEach, describe, expect, it } from "vitest"
import { BROKEN_MORALE, fireAt, hitChance, shotEvents, Weapon, WEAPONS } from "./combat.ts"
import { Side } from "./components.ts"
import { createLineOfSight, type LineOfSight } from "./line-of-sight.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { createSquad, isAlive } from "./squads.ts"

const opened: LineOfSight[] = []
afterEach(() => {
  for (const lineOfSight of opened.splice(0)) {
    lineOfSight.dispose()
  }
})

/** A 200 m square field, optionally with a north-facing French fire trench at z = 50. */
async function field(seed = 1, withTrench = false): Promise<Simulation> {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 })
  if (withTrench) {
    const trench: Trench = {
      kind: "fire",
      points: [
        [20, 50],
        [180, 50]
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

function stepFor(sim: Simulation, seconds: number, onStep?: () => void) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
    onStep?.()
  }
}

/** Fire step of the test trench: a soldier there sees, and is seen, over the parapet. */
const FIRE_STEP_Z = 50 + (TRENCH_PROFILE.floorHalfWidth + TRENCH_PROFILE.fireStepOuter) / 2

describe("combat", () => {
  it("holds fire until line of sight exists", () => {
    const sim = createSimulation({ map: createFlatMap({ name: "m", cellSize: 1, columns: 100, rows: 100 }), seed: 1 })
    const french = spawnSoldier(sim, { side: Side.French, x: 50, z: 20 })
    spawnSoldier(sim, { side: Side.German, x: 50, z: 80 })
    let shots = 0
    stepFor(sim, 10, () => (shots += shotEvents(sim.events).length))

    expect(shots).toBe(0)
    expect(sim.soldiers.target.id[french]).toBe(-1)
  })

  it("trades fire across open ground until someone falls", async () => {
    const sim = await field()
    const french = spawnSoldier(sim, { side: Side.French, x: 100, z: 60 })
    const german = spawnSoldier(sim, { side: Side.German, x: 100, z: 120 })
    let shots = 0
    let hits = 0
    stepFor(sim, 120, () => {
      shots += shotEvents(sim.events).length
      hits += shotEvents(sim.events).filter((event) => event.hit).length
    })

    expect(shots).toBeGreaterThan(5)
    expect(hits).toBeGreaterThan(0)
    expect(isAlive(sim, french) && isAlive(sim, german)).toBe(false)
  })

  it("can't target a soldier down on the trench floor, only one up on the fire step", async () => {
    const sim = await field(1, true)
    const inTrench = spawnSoldier(sim, { side: Side.French, x: 100, z: 50 })
    const german = spawnSoldier(sim, { side: Side.German, x: 100, z: 150 })
    stepFor(sim, 1)

    expect(sim.soldiers.target.id[german]).toBe(-1)
    sim.soldiers.position.z[inTrench] = FIRE_STEP_Z
    stepFor(sim, 1)
    expect(sim.soldiers.target.id[german]).toBe(inTrench)
  })

  it("makes hits less likely with range, cover, movement and suppression", async () => {
    const sim = await field(1, true)
    const shooter = spawnSoldier(sim, { side: Side.German, x: 100, z: 120 })
    const near = spawnSoldier(sim, { side: Side.French, x: 100, z: 100 })
    const far = spawnSoldier(sim, { side: Side.French, x: 102, z: 10 })
    const behindParapet = spawnSoldier(sim, { side: Side.French, x: 104, z: FIRE_STEP_Z })

    const close = hitChance(sim, shooter, near)
    expect(close).toBeGreaterThan(hitChance(sim, shooter, far))
    // The parapet hides the waist of a soldier on the fire step.
    expect(hitChance(sim, shooter, behindParapet)).toBeLessThan(
      WEAPONS[Weapon.Rifle].accuracy * Math.exp(-70 / WEAPONS[Weapon.Rifle].falloff) * 0.5
    )

    enqueueCommand(sim, { type: "steer", soldier: near, x: 1, z: 0 })
    stepSimulation(sim)
    const moving = hitChance(sim, shooter, near)
    expect(moving).toBeLessThan(close)
    sim.soldiers.suppression.value[shooter] = 1
    expect(hitChance(sim, shooter, near)).toBeLessThan(moving)
  })

  it("suppresses whoever is shot at", async () => {
    const sim = await field()
    const target = spawnSoldier(sim, { side: Side.French, x: 100, z: 20 })
    spawnSoldier(sim, { side: Side.German, x: 100, z: 190 })
    let peak = 0
    stepFor(sim, 8, () => (peak = Math.max(peak, sim.soldiers.suppression.value[target])))

    expect(peak).toBeGreaterThan(0.2)
  })

  it("lets suppression fade slowly once the firing stops, keeping men down a while", async () => {
    const sim = await field()
    const soldier = spawnSoldier(sim, { side: Side.French, x: 100, z: 20 })
    sim.soldiers.suppression.value[soldier] = 0.9
    stepFor(sim, 2)

    expect(sim.soldiers.suppression.value[soldier]).toBeCloseTo(0.66, 2)
  })

  it("pins heavily suppressed soldiers: they hold their fire", async () => {
    const sim = await field()
    const pinned = spawnSoldier(sim, { side: Side.French, x: 100, z: 60 })
    spawnSoldier(sim, { side: Side.German, x: 100, z: 120 })
    let pinnedShots = 0
    stepFor(sim, 2, () => {
      sim.soldiers.suppression.value[pinned] = 1
      pinnedShots += shotEvents(sim.events).filter((event) => event.shooter === pinned).length
    })

    expect(pinnedShots).toBe(0)
  })

  it("shakes a squad's morale when one of them falls, and broken soldiers stop advancing", async () => {
    const sim = await field()
    const members = [90, 95, 100].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 20 }))
    const squad = createSquad(sim, Side.French, members)
    enqueueCommand(sim, { type: "kill", soldier: members[0]! })
    stepSimulation(sim)

    expect(sim.soldiers.morale.value[members[1]!]).toBeLessThan(1)
    sim.soldiers.morale.value[members[2]!] = BROKEN_MORALE / 2
    enqueueCommand(sim, { type: "squad-order", squad: squad.id, order: { kind: "advance", x: 100, z: 100 } })
    // Three seconds in: morale recovers slowly, so they're still broken.
    stepFor(sim, 3)
    expect(sim.soldiers.position.z[members[1]!]).toBeGreaterThan(22)
    expect(sim.soldiers.position.z[members[2]!]).toBe(20)
    // Once morale recovers past the breaking point, they rally and follow.
    stepFor(sim, 10)
    expect(sim.soldiers.position.z[members[2]!]).toBeGreaterThan(21)
  })

  it("machine guns fire far faster than rifles", async () => {
    const sim = await field()
    const gunner = spawnSoldier(sim, { side: Side.German, x: 100, z: 190, weapon: Weapon.MachineGun })
    const rifleman = spawnSoldier(sim, { side: Side.German, x: 110, z: 190 })
    for (const x of [60, 80, 100, 120, 140]) {
      spawnSoldier(sim, { side: Side.French, x, z: 10 })
    }
    let gunnerShots = 0
    let rifleShots = 0
    stepFor(sim, 3, () => {
      gunnerShots += shotEvents(sim.events).filter((event) => event.shooter === gunner).length
      rifleShots += shotEvents(sim.events).filter((event) => event.shooter === rifleman).length
    })

    expect(gunnerShots).toBeGreaterThan(rifleShots * 5)
  })
})

describe("the player's soldier", () => {
  async function playerDuel() {
    const sim = await field()
    const player = spawnSoldier(sim, { side: Side.French, x: 100, z: 50 })
    const mate = spawnSoldier(sim, { side: Side.French, x: 60, z: 50 })
    createSquad(sim, Side.French, [player, mate], "player")
    const enemy = spawnSoldier(sim, { side: Side.German, x: 100, z: 150 })
    return { sim, player, enemy }
  }

  it("doesn't fire on their own", async () => {
    const { sim, player } = await playerDuel()
    let own = 0
    stepFor(sim, 5, () => (own += shotEvents(sim.events).filter((event) => event.shooter === player).length))

    expect(own).toBe(0)
  })

  it("fires on command at the enemy in the aim, once per reload", async () => {
    const { sim, player, enemy } = await playerDuel()
    enqueueCommand(sim, { type: "fire", soldier: player })
    enqueueCommand(sim, { type: "fire", soldier: player })
    stepSimulation(sim)
    const shots = shotEvents(sim.events).filter((event) => event.shooter === player)

    expect(shots).toHaveLength(1)
    expect(shots[0]?.target).toBe(enemy)
  })

  it("fires at nothing when no enemy is in the aim", async () => {
    const { sim, player } = await playerDuel()
    enqueueCommand(sim, { type: "face", soldier: player, x: 1, z: 0 })
    enqueueCommand(sim, { type: "fire", soldier: player })
    stepSimulation(sim)
    const shot = shotEvents(sim.events).find((event) => event.shooter === player)

    expect(shot?.target).toBe(-1)
    expect(shot?.to.x).toBeGreaterThan(150)
  })

  it("can't fire once fallen", async () => {
    const { sim, player } = await playerDuel()
    enqueueCommand(sim, { type: "kill", soldier: player })
    enqueueCommand(sim, { type: "fire", soldier: player })
    stepSimulation(sim)

    expect(shotEvents(sim.events).filter((event) => event.shooter === player)).toHaveLength(0)
    expect(hasComponent(sim.world, player, sim.soldiers.dead)).toBe(true)
  })
})

describe("combat determinism", () => {
  async function battle(seed: number) {
    const sim = await field(seed)
    for (let index = 0; index < 6; index++) {
      spawnSoldier(sim, { side: Side.French, x: 40 + index * 20, z: 40 })
      spawnSoldier(sim, {
        side: Side.German,
        x: 40 + index * 20,
        z: 160,
        weapon: index === 0 ? Weapon.MachineGun : Weapon.Rifle
      })
    }
    return sim
  }

  it("plays out identically from the same seed, and resumes identically from a snapshot", async () => {
    const first = await battle(7)
    const second = await battle(7)
    stepFor(first, 20)
    stepFor(second, 20)
    expect(takeSnapshot(second)).toEqual(takeSnapshot(first))

    const file = JSON.stringify(takeSnapshot(first))
    const restored = restoreSimulation(first.map, JSON.parse(file))
    restored.lineOfSight = first.lineOfSight
    stepFor(first, 20)
    stepFor(restored, 20)
    expect(takeSnapshot(restored)).toEqual(takeSnapshot(first))
  })

  it("lets a machine gun's misses fall among the men around its target, not on men well off its line", async () => {
    let besideHit = 0
    let wideHit = 0
    for (let trial = 0; trial < 3; trial++) {
      const sim = await field(trial + 1)
      const gun = spawnSoldier(sim, { side: Side.German, x: 100, z: 190, weapon: Weapon.MachineGun })
      const target = spawnSoldier(sim, { side: Side.French, x: 100, z: 60 })
      const behind = spawnSoldier(sim, { side: Side.French, x: 100.5, z: 52 })
      const wide = spawnSoldier(sim, { side: Side.French, x: 110, z: 60 })
      for (let round = 0; round < 400; round++) {
        sim.soldiers.health.value[target] = 1
        sim.soldiers.health.value[behind] = 1
        sim.soldiers.health.value[wide] = 1
        sim.soldiers.weapon.cooldown[gun] = 0
        fireAt(sim, gun, target)
        besideHit += sim.soldiers.health.value[behind] < 1 ? 1 : 0
        wideHit += sim.soldiers.health.value[wide] < 1 ? 1 : 0
      }
    }

    expect(besideHit).toBeGreaterThan(10)
    expect(wideHit).toBe(0)
  })
})
