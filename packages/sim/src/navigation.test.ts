import { createFlatMap, type Scenery, Surface, type WireBelt } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { Side } from "./components.ts"
import { nextWaypoint } from "./navigation.ts"
import {
  createSimulation,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE,
  WALKING_SPEED
} from "./simulation.ts"
import { createSquad } from "./squads.ts"

/** A field with a belt of wire along z = 100 from x = 20 to 180, broken by a 6 m gap at x = 140, and a ruin. */
function field(scenery: readonly Scenery[] = []) {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
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
  return { ...map, wire: belts, scenery }
}

function stepFor(sim: Simulation, seconds: number) {
  for (let step = 0; step < Math.round(seconds * TICK_RATE); step++) {
    stepSimulation(sim)
  }
}

const ahead = { kind: "line" as const, z: 120, direction: 1 }

describe("navigation", () => {
  it("walks straight where nothing's in the way", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 110 })

    expect(nextWaypoint(sim, soldier, { x: 60, z: 140 }, ahead)).toEqual({ x: 60, z: 140 })
  })

  it("makes for the gap in the wire rather than cutting through", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 120, z: 80 })
    const waypoint = nextWaypoint(sim, soldier, { x: 120, z: 120 }, ahead)

    // Off toward the gap at x = 138-142, not straight up through the belt.
    expect(waypoint.x).toBeGreaterThan(125)
    expect(waypoint.z).toBeLessThan(100)
  })

  it("brings a squad through the gap and onto its line, far faster than cutting through", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 120, z: 80 })
    const squad = createSquad(sim, Side.French, [soldier])
    squad.order = { kind: "advance", x: 120, z: 120 }
    stepFor(sim, 40 / WALKING_SPEED + 30)

    expect(sim.soldiers.position.z[soldier]).toBeCloseTo(120, 0)
    expect(sim.soldiers.position.x[soldier]).toBeCloseTo(120, 0)
  })

  it("goes round a ruin", () => {
    const ruin: Scenery = { kind: "ruin", x: 60, z: 130, heading: 0, variant: 0, scale: 1.5 }
    const sim = createSimulation({ map: field([ruin]), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 110 })
    const waypoint = nextWaypoint(sim, soldier, { x: 60, z: 150 }, { kind: "point", x: 60, z: 150, radius: 4 })

    expect(Math.abs(waypoint.x - 60)).toBeGreaterThan(4)
  })

  it("finds the lanes shells cut, once the ground is next surveyed", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 80 })
    const before = nextWaypoint(sim, soldier, { x: 60, z: 120 }, ahead)
    for (const x of [58, 62]) {
      sim.artillery.shells.push({
        shell: Shell.HeavyHighExplosive,
        side: Side.French,
        x,
        z: 100,
        landsAtTick: sim.tick
      })
    }
    stepFor(sim, 11)
    const after = nextWaypoint(sim, soldier, { x: 60, z: 120 }, ahead)

    expect(Math.abs(before.x - 60)).toBeGreaterThan(5)
    expect(after).toEqual({ x: 60, z: 120 })
  })

  it("wades round a flooded shell hole, sized by its scale", () => {
    const pool: Scenery = { kind: "pool", x: 60, z: 130, heading: 0, variant: 0, scale: 5 }
    const sim = createSimulation({ map: field([pool]), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 115 })
    const waypoint = nextWaypoint(sim, soldier, { x: 60, z: 145 }, { kind: "point", x: 60, z: 145, radius: 4 })

    expect(Math.abs(waypoint.x - 60)).toBeGreaterThan(3)
  })

  it("heads straight for the target when standing where no route starts, as inside a ruin", () => {
    const ruin: Scenery = { kind: "ruin", x: 60, z: 130, heading: 0, variant: 0, scale: 2 }
    const sim = createSimulation({ map: field([ruin]), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 130 })

    expect(nextWaypoint(sim, soldier, { x: 60, z: 160 }, { kind: "point", x: 60, z: 160, radius: 4 })).toEqual({
      x: 60,
      z: 160
    })
  })

  it("stays put on the goal when already there and the way to the exact spot is blocked", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 103 })
    const waypoint = nextWaypoint(sim, soldier, { x: 60, z: 97 }, { kind: "line", z: 101, direction: 1 })

    expect(waypoint).toEqual({ x: 61, z: 103 })
  })

  it("routes along the map's edge, and keeps a dozen routes at most", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 21, z: 80 })
    const waypoints = Array.from({ length: 14 }, (_, index) =>
      nextWaypoint(sim, soldier, { x: 21, z: 110 + index * 4 }, { kind: "line", z: 110 + index * 4, direction: 1 })
    )

    // Round the west end of the belt, at x = 18.3, between it and the map's edge.
    expect(waypoints.every((waypoint) => waypoint.x < 21)).toBe(true)
    const again = nextWaypoint(sim, soldier, { x: 21, z: 110 }, { kind: "line", z: 110, direction: 1 })
    expect(again).toEqual(waypoints[0])
  })
})
