import { carveTrenches, createFlatMap, heightAt, Surface, type Trench } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Side, Stance } from "./components.ts"
import { GRENADE_RANGE, grenadeFlight, lob, throwReach } from "./grenade.ts"
import { createSimulation, type Simulation, spawnSoldier } from "./simulation.ts"

/** A field 200 m square with a fire trench along z = 100, facing north. */
function field(): Simulation {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
  const trench: Trench = {
    kind: "fire",
    points: [
      [20, 100],
      [180, 100]
    ],
    facing: "north"
  }
  carveTrenches(map, [trench])
  return createSimulation({ map: { ...map, trenches: [trench] }, seed: 3 })
}

describe("a grenade's flight", () => {
  it("comes down where it's thrown over open ground, from a lob that rises over it", () => {
    const sim = field()
    const thrower = spawnSoldier(sim, { side: Side.French, x: 100, z: 160 })
    const flight = grenadeFlight(sim, thrower, 100, 140)
    expect(flight.struck).toBeNull()
    expect(flight.short).toBe(false)
    expect(flight.rolled).toBe(0)
    expect(flight.rest.x).toBeCloseTo(100, 5)
    expect(flight.rest.z).toBeCloseTo(140, 5)
    const top = Math.max(...flight.path.map((point) => point.y))
    expect(top).toBeGreaterThan(heightAt(sim.map, 100, 150) + 5)
    expect(flight.path[0]?.y).toBeCloseTo(heightAt(sim.map, 100, 160) + 1.9, 5)
  })

  it("takes about two seconds in the air over a long throw, as a thrown ball would", () => {
    const flat = lob({ x: 0, y: 1.9, z: 0 }, { x: 25, y: 0, z: 0 })
    expect(flat.span).toBe(25)
    expect(flat.height(0)).toBeCloseTo(1.9, 5)
    expect(flat.height(25)).toBeCloseTo(0, 5)
    expect(flat.seconds(25)).toBeGreaterThan(1.8)
    expect(flat.seconds(25)).toBeLessThan(2.6)
    expect(flat.seconds(12.5)).toBeCloseTo(flat.seconds(25) / 2, 5)
    // Onto higher ground the lob rises more steeply, to clear it: it's above the straight line up all the way.
    const uphill = lob({ x: 0, y: 1.9, z: 0 }, { x: 4, y: 6, z: 0 })
    expect(uphill.height(4)).toBeCloseTo(6, 5)
    expect(uphill.height(2)).toBeGreaterThan((1.9 + 6) / 2)
  })

  it("goes less far, from a lower hand, thrown kneeling or from cover", () => {
    const sim = field()
    const thrower = spawnSoldier(sim, { side: Side.French, x: 100, z: 160 })
    const ground = heightAt(sim.map, 100, 160)
    sim.soldiers.stance.value[thrower] = Stance.Crouching
    expect(throwReach(sim, thrower)).toBeCloseTo(GRENADE_RANGE.max * 0.85, 5)
    expect(grenadeFlight(sim, thrower, 100, 150).from.y).toBeCloseTo(ground + 1.3, 5)
    sim.soldiers.stance.value[thrower] = Stance.Sheltering
    expect(throwReach(sim, thrower)).toBeCloseTo(GRENADE_RANGE.max * 0.5, 5)
    expect(grenadeFlight(sim, thrower, 100, 150).from.y).toBeCloseTo(ground + 1, 5)
  })

  it("rolls down a bank it lands on until the ground eases off below it", () => {
    // A bank 4 m high, as steep as it is long, between z = 20 and z = 24, with gentler ground falling away below it.
    const map = createFlatMap({ name: "bank", cellSize: 0.5, columns: 100, rows: 100 }, 0, Surface.Grass)
    for (let row = 0; row < map.rows; row++) {
      const z = row * map.cellSize
      const height = z < 20 ? (z - 20) * 0.1 : Math.min(4, z - 20)
      map.heights.fill(height, row * map.columns, (row + 1) * map.columns)
    }
    expect(heightAt(map, 25, 22)).toBeCloseTo(2, 5)
    const sim = createSimulation({ map, seed: 3 })
    const thrower = spawnSoldier(sim, { side: Side.French, x: 25, z: 5 })
    const flight = grenadeFlight(sim, thrower, 25, 22)
    expect(flight.struck).toBeNull()
    expect(flight.rolled).toBeGreaterThan(1)
    // Down the bank and a little way on: it stops where the fall below eases, not at the foot's first step.
    expect(flight.rest.z).toBeLessThan(20)
    expect(flight.rest.z).toBeGreaterThan(18)
  })

  it("falls at a man's longest throw when thrown further", () => {
    const sim = field()
    const thrower = spawnSoldier(sim, { side: Side.French, x: 100, z: 190 })
    const flight = grenadeFlight(sim, thrower, 100, 110)
    expect(flight.short).toBe(true)
    expect(flight.mark.z).toBeCloseTo(190 - GRENADE_RANGE.max, 5)
  })

  it("is thrown clear of the trench by a man standing up in it", () => {
    const sim = field()
    const thrower = spawnSoldier(sim, { side: Side.French, x: 100, z: 99.6 })
    const flight = grenadeFlight(sim, thrower, 100, 118)
    expect(flight.struck).toBeNull()
    expect(flight.rest.z).toBeGreaterThan(110)
  })

  it("strikes the trench wall when thrown lying down in it, and rolls back into the bay", () => {
    const sim = field()
    const thrower = spawnSoldier(sim, { side: Side.French, x: 100, z: 99.6 })
    sim.soldiers.stance.value[thrower] = Stance.Prone
    const flight = grenadeFlight(sim, thrower, 100, 118)
    expect(flight.struck).not.toBeNull()
    expect(flight.struck?.z ?? 0).toBeLessThan(103)
    // Back down the wall, into the trench he threw from: on the fire step or the floor.
    expect(flight.rolled).toBeGreaterThan(0)
    expect(Math.abs(flight.rest.z - 100)).toBeLessThan(1.6)
    expect(heightAt(sim.map, flight.rest.x, flight.rest.z)).toBeLessThan(heightAt(sim.map, 100, 110) - 0.5)
  })

  it("rolls down a steep slope it comes down on, and stays put on level ground", () => {
    const sim = field()
    const thrower = spawnSoldier(sim, { side: Side.French, x: 100, z: 125 })
    // Onto the face of the trench's wall, from outside it.
    const onTheWall = grenadeFlight(sim, thrower, 100, 101.05)
    expect(onTheWall.rolled).toBeGreaterThan(0)
    expect(heightAt(sim.map, onTheWall.rest.x, onTheWall.rest.z)).toBeLessThan(
      heightAt(sim.map, onTheWall.mark.x, onTheWall.mark.z)
    )
    const onTheFlat = grenadeFlight(sim, thrower, 100, 140)
    expect(onTheFlat.rolled).toBe(0)
  })
})
