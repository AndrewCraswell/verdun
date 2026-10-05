import { createFlatMap, sampleIndex, type Scenery, Surface, type WireBelt } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { Side } from "./components.ts"
import { forgetRoutes, groundVersion, type NavGoal, navigationSystem, nextWaypoint } from "./navigation.ts"
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
import { typicalWeather, WeatherPattern } from "./weather.ts"

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

/** A soldier's next waypoint, letting the route search run on over as many steps' budgets as it takes. */
function waypointFor(sim: Simulation, soldier: number, target: { x: number; z: number }, goal: NavGoal) {
  for (let step = 0; step < 100; step++) {
    const waypoint = nextWaypoint(sim, soldier, target, goal)
    if (waypoint) {
      return waypoint
    }
    navigationSystem(sim)
    sim.tick += 1
  }
  throw new Error("the route never came in")
}

const ahead = { kind: "line" as const, z: 120, direction: 1 }

describe("navigation", () => {
  it("walks straight where nothing's in the way", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 110 })

    expect(waypointFor(sim, soldier, { x: 60, z: 140 }, ahead)).toEqual({ x: 60, z: 140 })
  })

  it("forgets its routes and costs when asked, and works them out again, the same, when next asked the way", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 120, z: 80 })
    const before = waypointFor(sim, soldier, { x: 120, z: 120 }, ahead)
    expect(groundVersion(sim)).toBeGreaterThanOrEqual(0)

    forgetRoutes(sim)
    expect(groundVersion(sim)).toBe(-1)
    expect(waypointFor(sim, soldier, { x: 120, z: 120 }, ahead)).toEqual(before)
  })

  it("makes for the gap in the wire rather than cutting through", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 120, z: 80 })
    const waypoint = waypointFor(sim, soldier, { x: 120, z: 120 }, ahead)

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

  it("works out a route across an unbroken belt in a moment, not seconds", () => {
    const sim = createSimulation({
      map: {
        ...field(),
        wire: [
          {
            points: [
              [20, 100],
              [180, 100]
            ]
          }
        ]
      },
      seed: 1
    })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 100, z: 60 })
    const started = performance.now()
    const waypoint = waypointFor(sim, soldier, { x: 100, z: 160 }, { kind: "point", x: 100, z: 160, radius: 5 })

    // Every way across is through the wire; the cheapest is straight at it.
    expect(waypoint.z).toBeGreaterThan(60)
    // A few milliseconds; it once took seconds, re-pushing cells over float rounding.
    expect(performance.now() - started).toBeLessThan(500)
  })

  it("wades into a belt with no gap rather than standing at its edge for good", () => {
    const sim = createSimulation({
      map: {
        ...field(),
        wire: [
          {
            points: [
              [0, 100],
              [200, 100]
            ]
          }
        ]
      },
      seed: 1
    })
    // Standing in the middle of the last 2 m route cell short of the wire.
    const soldier = spawnSoldier(sim, { side: Side.French, x: 101, z: 97 })
    const waypoint = waypointFor(sim, soldier, { x: 101, z: 130 }, ahead)

    // On into the wire, not back to where he already stands.
    expect(waypoint.z).toBeGreaterThan(98)
  })

  it("keeps to firm going when the ground is sodden, going round by a longer way through the wire", () => {
    /** Wire along z = 100 with gaps at x = 60 and x = 140, and the ground round the first gap trodden to mud. */
    const muddy = () => {
      const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
      for (let row = 150; row <= 250; row++) {
        for (let column = 80; column <= 160; column++) {
          map.surfaces[sampleIndex(map, column, row)] = Surface.Mud
        }
      }
      const belt = (from: number, to: number): WireBelt => ({
        points: [
          [from, 100],
          [to, 100]
        ]
      })
      return { ...map, wire: [belt(20, 57), belt(63, 137), belt(143, 180)] }
    }
    const route = (wetness: number) => {
      const sim = createSimulation({ map: muddy(), seed: 1 })
      const weather = { ...typicalWeather(WeatherPattern.Overcast, sim.wind), temperature: 12, wetness }
      enqueueCommand(sim, { type: "forecast", forecast: { kind: "steady", weather } })
      stepSimulation(sim)
      const soldier = spawnSoldier(sim, { side: Side.French, x: 85, z: 80 })
      return waypointFor(sim, soldier, { x: 85, z: 120 }, ahead)
    }

    // Dry, the muddy gap is the shorter way; sodden, its mud costs more than the walk round to the firm one.
    expect(route(0.3).x).toBeLessThan(85)
    expect(route(1).x).toBeGreaterThan(85)
  })

  it("goes round a ruin", () => {
    const ruin: Scenery = { kind: "ruin", x: 60, z: 130, heading: 0, variant: 0, scale: 1.5 }
    const sim = createSimulation({ map: field([ruin]), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 110 })
    const waypoint = waypointFor(sim, soldier, { x: 60, z: 150 }, { kind: "point", x: 60, z: 150, radius: 4 })

    expect(Math.abs(waypoint.x - 60)).toBeGreaterThan(4)
  })

  it("finds the lanes shells cut, once the ground is next surveyed", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 80 })
    const before = waypointFor(sim, soldier, { x: 60, z: 120 }, ahead)
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
    const after = waypointFor(sim, soldier, { x: 60, z: 120 }, ahead)

    expect(Math.abs(before.x - 60)).toBeGreaterThan(5)
    expect(after).toEqual({ x: 60, z: 120 })
  })

  it("wades round a flooded shell hole, sized by its scale", () => {
    const pool: Scenery = { kind: "pool", x: 60, z: 130, heading: 0, variant: 0, scale: 5 }
    const sim = createSimulation({ map: field([pool]), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 115 })
    const waypoint = waypointFor(sim, soldier, { x: 60, z: 145 }, { kind: "point", x: 60, z: 145, radius: 4 })

    expect(Math.abs(waypoint.x - 60)).toBeGreaterThan(3)
  })

  it("heads straight for the target when standing where no route starts, as inside a ruin", () => {
    const ruin: Scenery = { kind: "ruin", x: 60, z: 130, heading: 0, variant: 0, scale: 2 }
    const sim = createSimulation({ map: field([ruin]), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 130 })

    expect(waypointFor(sim, soldier, { x: 60, z: 160 }, { kind: "point", x: 60, z: 160, radius: 4 })).toEqual({
      x: 60,
      z: 160
    })
  })

  it("stays put on the goal when already there and the way to the exact spot is blocked", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 60, z: 103 })
    const waypoint = waypointFor(sim, soldier, { x: 60, z: 97 }, { kind: "line", z: 101, direction: 1 })

    expect(waypoint).toEqual({ x: 61, z: 103 })
  })

  it("spreads a mass order's route searches over steps, and finds the same routes as one at a time", () => {
    const goals = Array.from({ length: 12 }, (_, index) => ({
      kind: "point" as const,
      x: 10 + index * 15,
      z: 190,
      radius: 6
    }))
    const rushed = createSimulation({ map: field(), seed: 1 })
    const soldiers = goals.map((goal) => spawnSoldier(rushed, { side: Side.French, x: goal.x, z: 10 }))
    const target = (goal: { x: number; z: number }) => ({ x: goal.x, z: goal.z })
    const first = goals.map((goal, index) => nextWaypoint(rushed, soldiers[index] ?? 0, target(goal), goal))

    // Twelve searches of most of the field is more than one step's budget.
    expect(first.some((waypoint) => waypoint === null)).toBe(true)
    const rushedRoutes = goals.map((goal, index) => waypointFor(rushed, soldiers[index] ?? 0, target(goal), goal))
    const calm = createSimulation({ map: field(), seed: 1 })
    const calmRoutes = goals.map((goal) => {
      calm.tick += 1
      return waypointFor(calm, spawnSoldier(calm, { side: Side.French, x: goal.x, z: 10 }), target(goal), goal)
    })
    expect(rushedRoutes).toEqual(calmRoutes)
  })

  it("routes along the map's edge, and keeps a dozen routes at most", () => {
    const sim = createSimulation({ map: field(), seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 21, z: 80 })
    const waypoints = Array.from({ length: 14 }, (_, index) =>
      waypointFor(sim, soldier, { x: 21, z: 110 + index * 4 }, { kind: "line", z: 110 + index * 4, direction: 1 })
    )

    // Round the west end of the belt, at x = 18.3, between it and the map's edge.
    expect(waypoints.every((waypoint) => waypoint.x < 21)).toBe(true)
    const again = waypointFor(sim, soldier, { x: 21, z: 110 }, { kind: "line", z: 110, direction: 1 })
    expect(again).toEqual(waypoints[0])
  })
})
