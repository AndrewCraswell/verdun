import { createFlatMap, Surface, type WireBelt } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { Side } from "./components.ts"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE,
  WALKING_SPEED
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { createSquad } from "./squads.ts"
import { createWireField, wireAt, wireDetour, wirePace } from "./wire.ts"

/** A field with a belt of wire along z = 100 from x = 20 to 180, broken by a 6 m gap at x = 140. */
function wired() {
  const map = createFlatMap({ name: "wired", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
  const belts: WireBelt[] = [
    {
      points: [
        [20, 100],
        [137, 100]
      ]
    },
    {
      points: [
        [143, 100],
        [180, 100]
      ]
    }
  ]
  return {
    ...map,
    wire: belts,
    scenery: [{ kind: "knife-rest" as const, x: 50, z: 150, heading: 0, variant: 0, scale: 1 }]
  }
}

function stepFor(sim: Simulation, seconds: number) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
  }
}

describe("barbed wire", () => {
  it("is staked along each belt, about 3.4 m deep, and around knife rests", () => {
    const field = createWireField(wired())

    expect(wireAt(field, 60, 100)).toBe(1)
    expect(wireAt(field, 60, 101.2)).toBe(1)
    expect(wireAt(field, 60, 103)).toBe(0)
    expect(wireAt(field, 140, 100)).toBe(0)
    expect(wireAt(field, 50, 150)).toBe(1)
    expect(wireAt(field, -5, 100)).toBe(0)
  })

  it("all but stops a man trying to get through, and costs nothing where it's been cut", () => {
    const field = createWireField(wired())

    expect(wirePace(field, 60, 100)).toBeCloseTo(0.05)
    expect(wirePace(field, 60, 120)).toBe(1)
  })

  it("is cut away by shells, cleanly near the burst, and the cut is saved", () => {
    const sim = createSimulation({ map: wired(), seed: 1 })
    sim.artillery.shells.push({ shell: Shell.FieldHighExplosive, side: Side.French, x: 60, z: 100, landsAtTick: 0 })
    stepSimulation(sim)

    expect(wireAt(sim.wire, 60, 100)).toBe(0)
    expect(wireAt(sim.wire, 61.5, 100)).toBeGreaterThan(0)
    expect(wireAt(sim.wire, 61.5, 100)).toBeLessThan(1)
    expect(sim.events).toContainEqual({ type: "wire-cut", x: 60, z: 100, radius: 2.5 })
    const file = JSON.stringify(takeSnapshot(sim))
    const restored = restoreSimulation(sim.map, JSON.parse(file))
    expect(wireAt(restored.wire, 60, 100)).toBe(0)
    expect(takeSnapshot(restored)).toEqual(takeSnapshot(sim))
  })

  it("leaves bursts well clear of the wire unremarked", () => {
    const sim = createSimulation({ map: wired(), seed: 1 })
    sim.artillery.shells.push({ shell: Shell.FieldHighExplosive, side: Side.French, x: 60, z: 130, landsAtTick: 0 })
    stepSimulation(sim)

    expect(sim.events.some((event) => event.type === "wire-cut")).toBe(false)
  })

  it("sends men round to the nearest gap rather than through the wire", () => {
    const field = createWireField(wired())

    // The tangles reach 1.7 m past each belt's end, leaving x = 139-140 open.
    expect(wireDetour(field, 120, 80, 120, 120)).toEqual({ x: 139.5, z: 95.5 })
    expect(wireDetour(field, 139.5, 95, 139.5, 120)).toBeNull()
    expect(wireDetour(field, 120, 110, 120, 120)).toBeNull()
    // Near the end of a belt, the way round is past its end.
    expect(wireDetour(field, 30, 80, 30, 120)).toEqual({ x: 17.5, z: 95.5 })
  })

  it("lets a squad find its way through the gap faster than cutting through", () => {
    const sim = createSimulation({ map: wired(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 120, z: 80 })
    const squad = createSquad(sim, Side.French, [soldier])
    squad.order = { kind: "advance", x: 120, z: 120 }
    const walkStraight = 40 / WALKING_SPEED
    stepFor(sim, walkStraight + 40)

    expect(sim.soldiers.position.z[soldier]).toBeCloseTo(120, 0)
    expect(sim.soldiers.position.x[soldier]).toBeCloseTo(120, 0)

    const cutter = createSimulation({ map: wired(), seed: 1 })
    const alone = spawnSoldier(cutter, { side: Side.French, x: 30, z: 80 })
    enqueueCommand(cutter, { type: "move-to", soldier: alone, x: 30, z: 120 })
    stepFor(cutter, walkStraight + 40)
    expect(cutter.soldiers.position.z[alone]).toBeLessThan(110)
  })
})
