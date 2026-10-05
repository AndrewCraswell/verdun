import { createFlatMap, Surface, type WireBelt } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { Side } from "./components.ts"
import { createSimulation, stepSimulation } from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { createWireField, cutLane, wireAt, wirePace } from "./wire.ts"

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

describe("barbed wire", () => {
  it("cuts a lane through a belt, just the lane's width, and says where so the wire can be torn away", () => {
    const sim = createSimulation({ map: wired(), seed: 1 })
    sim.events.length = 0
    const cuts = sim.wire.cuts

    expect(cutLane(sim, 60, 90, 110, 3)).toBe(true)
    expect(wireAt(sim.wire, 60, 100)).toBe(0)
    expect(wireAt(sim.wire, 57.5, 101)).toBe(0)
    expect(wireAt(sim.wire, 65, 100)).toBe(1)
    expect(sim.wire.cuts).toBe(cuts + 1)
    const torn = sim.events.filter((event) => event.type === "wire-cut")
    expect(torn.length).toBeGreaterThan(0)
    expect(torn.every((event) => event.type === "wire-cut" && event.x === 60)).toBe(true)
    // Where there's no wire, there's nothing to cut.
    expect(cutLane(sim, 60, 120, 140, 3)).toBe(false)
  })

  it("is staked along each belt, about 3.4 m deep, and nowhere else: a wooden fence in a gap has none", () => {
    const field = createWireField(wired())

    expect(wireAt(field, 60, 100)).toBe(1)
    expect(wireAt(field, 60, 101.2)).toBe(1)
    expect(wireAt(field, 60, 103)).toBe(0)
    expect(wireAt(field, 140, 100)).toBe(0)
    expect(wireAt(field, 50, 150)).toBe(0)
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
})
