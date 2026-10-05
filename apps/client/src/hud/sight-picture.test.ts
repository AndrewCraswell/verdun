import { carveTrenches, createFlatMap, sampleIndex, Surface, type Trench } from "@verdun/map"
import {
  createSimulation,
  createSquad,
  enqueueCommand,
  hitChance,
  Side,
  spawnSoldier,
  stepSimulation
} from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createTerrainSight } from "../fog/terrain-sight.ts"
import { aimedAt, sightPicture, spreadRadius } from "./sight-picture.ts"

/**
 * A field 5 m up with a north-facing fire trench along z = 50, and a wall of earth 4 m high across x 140-160 at z = 120:
 * a man behind it is hidden from the trench by something far off.
 */
function battle() {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 600, rows: 1000 }, 5, Surface.Grass)
  const trench: Trench = {
    kind: "fire",
    points: [
      [20, 50],
      [280, 50]
    ],
    facing: "north"
  }
  carveTrenches(map, [trench])
  for (let row = 0; row <= map.rows; row++) {
    for (let column = 0; column <= map.columns; column++) {
      const x = column * map.cellSize
      const z = row * map.cellSize
      if (x >= 140 && x <= 160 && z >= 119 && z <= 121) {
        map.heights[sampleIndex(map, column, row)] = 9
      }
    }
  }
  const sim = createSimulation({ map: { ...map, trenches: [trench] }, seed: 1 })
  sim.lineOfSight = createTerrainSight(sim.map)
  return sim
}

const everyone = () => true

describe("the sight picture", () => {
  it("shows the man in his sights, steadying as he holds his aim on him", () => {
    const sim = battle()
    // Up on the open ground behind the trench, aiming north across it.
    const shooter = spawnSoldier(sim, { side: Side.French, x: 100, z: 30 })
    createSquad(sim, Side.French, [shooter], "player")
    const enemy = spawnSoldier(sim, { side: Side.German, x: 100, z: 90 })
    enqueueCommand(sim, { type: "face", soldier: shooter, x: 0, z: 1, target: enemy })
    stepSimulation(sim)
    const snap = sightPicture(sim, shooter, everyone)
    expect(snap).toMatchObject({ state: "target", man: enemy })
    expect(snap?.steadiness).toBeLessThan(0.1)
    expect(snap?.chance ?? 0).toBeLessThan(hitChance(sim, shooter, enemy) * 0.55)
    for (let step = 0; step < 40; step++) {
      stepSimulation(sim)
    }
    const steady = sightPicture(sim, shooter, everyone)
    expect(steady?.steadiness).toBe(1)
    expect(steady?.chance ?? 0).toBeCloseTo(hitChance(sim, shooter, enemy), 5)
  })

  it("says his own parapet is in the way when he aims from the trench floor", () => {
    const sim = battle()
    const shooter = spawnSoldier(sim, { side: Side.French, x: 100, z: 49.6 })
    createSquad(sim, Side.French, [shooter], "player")
    const enemy = spawnSoldier(sim, { side: Side.German, x: 100, z: 110 })
    enqueueCommand(sim, { type: "face", soldier: shooter, x: 0, z: 1, target: enemy })
    stepSimulation(sim)
    expect(sightPicture(sim, shooter, everyone)).toMatchObject({ state: "blocked", man: enemy })
  })

  it("says he can't see a man something further off hides, out of range or in the dark", () => {
    const sim = battle()
    const shooter = spawnSoldier(sim, { side: Side.French, x: 150, z: 30 })
    createSquad(sim, Side.French, [shooter], "player")
    const hidden = spawnSoldier(sim, { side: Side.German, x: 150, z: 130 })
    enqueueCommand(sim, { type: "face", soldier: shooter, x: 0, z: 1, target: hidden })
    stepSimulation(sim)
    expect(sightPicture(sim, shooter, everyone)).toMatchObject({ state: "unseen", man: hidden })

    const far = spawnSoldier(sim, { side: Side.German, x: 100, z: 290 })
    enqueueCommand(sim, { type: "face", soldier: shooter, x: -50, z: 260, target: far })
    stepSimulation(sim)
    expect(sightPicture(sim, shooter, () => true)?.state).toBe("target")
    // Thick fog comes down.
    enqueueCommand(sim, {
      type: "forecast",
      forecast: { kind: "steady", weather: { ...sim.environment.weather, visibility: 120 } }
    })
    for (let step = 0; step < 20 * 60 && sim.environment.weather.visibility > 150; step++) {
      stepSimulation(sim)
    }
    expect(sightPicture(sim, shooter, everyone)).toMatchObject({ state: "dark", man: far })

    // A rifle carries 400 m.
    const beyond = spawnSoldier(sim, { side: Side.German, x: 150, z: 445 })
    enqueueCommand(sim, { type: "face", soldier: shooter, x: 0, z: 1, target: beyond })
    stepSimulation(sim)
    expect(sightPicture(sim, shooter, everyone)?.state).toBe("range")
  })

  it("never picks out a man the fog hides, and is empty with nobody in his line", () => {
    const sim = battle()
    const shooter = spawnSoldier(sim, { side: Side.French, x: 150, z: 30 })
    createSquad(sim, Side.French, [shooter], "player")
    const hidden = spawnSoldier(sim, { side: Side.German, x: 150, z: 130 })
    stepSimulation(sim)
    // Facing north at him, without the player having picked him out.
    expect(aimedAt(sim, shooter, everyone)).toBe(hidden)
    expect(aimedAt(sim, shooter, () => false)).toBe(-1)
    expect(sightPicture(sim, shooter, () => false)).toBeNull()
  })
})

describe("the spread", () => {
  it("rings a likely shot tightly and an unlikely one widely, within bounds", () => {
    expect(spreadRadius(0.15)).toBeLessThan(spreadRadius(0.05))
    expect(spreadRadius(1)).toBe(0.9)
    expect(spreadRadius(0.001)).toBe(6)
    expect(spreadRadius(0)).toBe(6)
    // Doubling the chance, as steadying does, narrows the ring by the square root of two.
    expect(spreadRadius(0.05) / spreadRadius(0.1)).toBeCloseTo(Math.SQRT2, 5)
  })
})
