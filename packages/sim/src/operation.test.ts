import { createFlatMap, layOutFront, mapDepth } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { surrender } from "./capture.ts"
import { Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import {
  attackBehindBarrage,
  bombardEnemyLine,
  bombardmentAt,
  copyOperation,
  CREEPING_BARRAGE,
  judgeOperation,
  operationSystem,
  type OperationPlan,
  planOperation
} from "./operation.ts"
import {
  createSimulation,
  type SimEvent,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { createSquad } from "./squads.ts"
import { casualty } from "./wounds.ts"

const flat = createFlatMap({ name: "test", cellSize: 1, columns: 300, rows: 200 })
/** Front lines at z = 50 (French) and z = 150 (German), with a farm just behind the German line. */
const map = { ...flat, trenches: layOutFront(flat), objectives: [{ name: "Farm", x: 150, z: 165, radius: 10 }] }
const depth = mapDepth(map)

function stepFor(sim: Simulation, seconds: number): SimEvent[] {
  const events: SimEvent[] = []
  for (let step = 0; step < seconds * TICK_RATE; step++) {
    stepSimulation(sim)
    events.push(...sim.events)
  }
  return events
}

/** A squad of four at x on the given line. */
function squadAt(sim: Simulation, side: Side, x: number, z: number, controller: "player" | "ai" = "ai") {
  const members = [0, 1, 2, 3].map((slot) => spawnSoldier(sim, { side, x: x + slot * 3, z }))
  return createSquad(sim, side, members, controller)
}

const plan = (changes: Partial<OperationPlan> = {}): OperationPlan => ({
  side: Side.French,
  zeroHourIn: 140,
  bombardments: 1,
  holdSeconds: 600,
  ...changes
})

describe("fire plans", () => {
  it("send a whole side over the top behind a creeping barrage that opens just beyond its wire", () => {
    const sim = createSimulation({ map, seed: 1 })
    squadAt(sim, Side.French, 100, depth * 0.25)
    squadAt(sim, Side.German, 100, depth * 0.75)
    attackBehindBarrage(sim, Side.French)
    stepSimulation(sim)
    const [barrage] = sim.artillery.missions

    expect(barrage?.shell).toBe(Shell.FieldHighExplosive)
    // The front line averages bays and traverses, which sit a little behind it.
    expect(Math.abs((barrage?.z ?? 0) - (depth * 0.25 + CREEPING_BARRAGE.openAhead))).toBeLessThanOrEqual(3)
    expect(barrage?.creep?.lift).toBe(CREEPING_BARRAGE.lift)
    const [french, german] = sim.squads
    expect(french?.order.kind === "creep" && Math.abs(french.order.objectiveZ - depth * 0.75) <= 3).toBe(true)
    expect(german?.order.kind).not.toBe("creep")
  })

  it("bombard the enemy front line with heavy and field guns, and sweep the wire in front of it", () => {
    const sim = createSimulation({ map, seed: 1 })
    bombardEnemyLine(sim, Side.French)
    stepSimulation(sim)

    expect(sim.artillery.missions.map((mission) => mission.shell)).toEqual([
      Shell.HeavyHighExplosive,
      Shell.FieldHighExplosive,
      Shell.FieldHighExplosive
    ])
    const [heavy, field, wire] = sim.artillery.missions
    const enemyLine = depth * 0.75
    expect([heavy, field].every((mission) => Math.abs((mission?.z ?? 0) - enemyLine) <= 3)).toBe(true)
    expect(Math.abs((wire?.z ?? 0) - (enemyLine - 30))).toBeLessThanOrEqual(3)
  })

  it("do nothing without front lines to work from", () => {
    const sim = createSimulation({ map: flat, seed: 1 })
    attackBehindBarrage(sim, Side.French)
    bombardEnemyLine(sim, Side.French)

    expect(sim.pendingCommands).toHaveLength(0)
  })
})

describe("operations", () => {
  it("fire the bombardments back to back to end at zero hour, then send the attackers over", () => {
    const sim = createSimulation({ map, seed: 1 })
    const attackers = squadAt(sim, Side.French, 100, depth * 0.25)
    const operation = planOperation(sim, plan({ zeroHourIn: 270, bombardments: 2 }))

    expect(operation.zeroHourAt).toBe(270 * TICK_RATE)
    expect([bombardmentAt(operation, 0), bombardmentAt(operation, 1)]).toEqual([10 * TICK_RATE, 140 * TICK_RATE])
    expect(operation.defended).toEqual(["Farm"])
    stepFor(sim, 11)
    expect(operation.bombardmentsFired).toBe(1)
    expect(sim.artillery.missions).toHaveLength(3)
    stepFor(sim, 130)
    expect(operation.bombardmentsFired).toBe(2)
    expect(operation.wentOver).toBe(false)
    const events = stepFor(sim, 130)

    expect(operation.wentOver).toBe(true)
    expect(events).toContainEqual({ type: "zero-hour", side: Side.French })
    expect(attackers.order.kind).toBe("creep")
  })

  it("end early as repulsed once no attacker has been out beyond his own line for a minute", () => {
    const sim = createSimulation({ map, seed: 1 })
    spawnSoldier(sim, { side: Side.French, x: 100, z: depth * 0.25 })
    const operation = planOperation(sim, plan({ zeroHourIn: 0, bombardments: 0 }))
    const events = stepFor(sim, 250)

    expect(operation.result).toBe("repulsed")
    expect(operation.endedAt).toBeGreaterThanOrEqual(240 * TICK_RATE)
    expect(events).toContainEqual({ type: "operation-over", result: "repulsed" })
  })

  it("stay on while attackers are out, and judge the result when the time is up", () => {
    const sim = createSimulation({ map, seed: 1 })
    // Out in no man's land, holding still.
    spawnSoldier(sim, { side: Side.French, x: 100, z: 100 })
    const operation = planOperation(sim, plan({ zeroHourIn: 0, bombardments: 0, holdSeconds: 300 }))
    // No barrage: it would come down on him.
    stepFor(sim, 0.1)
    sim.artillery.missions.length = 0
    stepFor(sim, 298.9)
    expect(operation.result).toBeNull()
    const events = stepFor(sim, 2)

    expect(operation.result).toBe("repulsed")
    expect(operation.endedAt).toBe(operation.endsAt)
    expect(events).toContainEqual({ type: "operation-over", result: "repulsed" })
    // Once over, it stays over.
    stepFor(sim, 1)
    expect(operation.endedAt).toBe(operation.endsAt)
  })

  it("count the enemy's front line taken, a footing on his objectives, or neither", () => {
    const sim = createSimulation({ map, seed: 1 })
    const operation = planOperation(sim, plan())

    expect(judgeOperation(sim, operation)).toBe("repulsed")
    const farm = sim.objectives[0]
    if (farm) {
      farm.holder = Side.French
    }
    expect(judgeOperation(sim, operation)).toBe("footing")
    for (let index = 0; index < 8; index++) {
      spawnSoldier(sim, { side: Side.French, x: 60 + index * 10, z: depth * 0.75 })
    }
    expect(judgeOperation(sim, operation)).toBe("taken")
  })

  it("tally the losses on both sides, the gunners put down and what the player's squad did", () => {
    const sim = createSimulation({ map, seed: 1 })
    const player = squadAt(sim, Side.French, 100, depth * 0.25, "player")
    const gunner = spawnSoldier(sim, { side: Side.German, x: 100, z: depth * 0.75, weapon: Weapon.MachineGun })
    const rifleman = spawnSoldier(sim, { side: Side.German, x: 110, z: depth * 0.75 })
    const prisoner = spawnSoldier(sim, { side: Side.German, x: 120, z: depth * 0.75 })
    const operation = planOperation(sim, plan())
    const [shooter = -1, hit = -1, shelled = -1] = player.members
    expect(operation.tally.sides[Side.French].engaged).toBe(4)
    expect(operation.tally.sides[Side.German].engaged).toBe(3)

    sim.events.length = 0
    casualty(sim, gunner, 1, { kind: "machine-gun", by: Side.French, soldier: shooter })
    casualty(sim, rifleman, 0, { kind: "grenade", by: Side.French, soldier: shooter })
    casualty(sim, hit, 0, { kind: "rifle", by: Side.German, soldier: rifleman })
    casualty(sim, shelled, 1, { kind: "shell", by: Side.French })
    surrender(sim, prisoner)
    sim.events.push(
      { type: "returned-to-duty", soldier: hit },
      { type: "died-of-wounds", soldier: rifleman },
      { type: "objective-taken", name: "Farm", side: Side.French }
    )
    operationSystem(sim)
    const { tally } = operation

    expect(tally.sides[Side.German]).toEqual({ engaged: 3, killed: 2, wounded: 0, returned: 0, captured: 1 })
    expect(tally.sides[Side.French]).toEqual({ engaged: 4, killed: 1, wounded: 1, returned: 1, captured: 0 })
    expect(tally.causes).toMatchObject({ rifle: 1, own: 1, shell: 0 })
    expect(tally.gunnersDown).toBe(1)
    expect(tally.squad).toEqual({ lost: 2, downed: 2 })
    expect(tally.objectives).toEqual([{ name: "Farm", side: Side.French, at: sim.tick }])
  })

  it("copy deeply for snapshots", () => {
    const sim = createSimulation({ map, seed: 1 })
    const operation = planOperation(sim, plan())
    const copy = copyOperation(operation)
    operation.tally.sides[Side.French].killed = 5
    operation.tally.objectives.push({ name: "Farm", side: Side.French, at: 1 })

    expect(copy?.tally.sides[Side.French].killed).toBe(0)
    expect(copy?.tally.objectives).toEqual([])
    expect(copyOperation(null)).toBeNull()
  })
})
