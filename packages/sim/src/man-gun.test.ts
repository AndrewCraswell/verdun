import { readFileSync } from "node:fs"
import { createFlatMap, decodeElevation, generateFleurySector, type Scenery, Surface } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { Weapon } from "./combat.ts"
import { Side } from "./components.ts"
import { gunAction, gunPartner, nestsOf, postAt, postOf } from "./man-gun.ts"
import { createSimulation, enqueueCommand, soldierIds, spawnSoldier, stepSimulation, TICK_RATE } from "./simulation.ts"
import { setupSkirmish } from "./skirmish.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { createSquad } from "./squads.ts"

function field() {
  return createSimulation({
    map: createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 200 }, 5, Surface.Grass),
    seed: 1
  })
}

describe("manning a machine gun", () => {
  it("takes over the gun beside him, the gunner takes up a rifle, and hands it back", () => {
    const sim = field()
    const gunner = spawnSoldier(sim, { side: Side.French, x: 50, z: 50, weapon: Weapon.MachineGun })
    const player = spawnSoldier(sim, { side: Side.French, x: 51.5, z: 50 })
    spawnSoldier(sim, { side: Side.French, x: 70, z: 50 })
    expect(gunPartner(sim, player)).toBe(gunner)

    enqueueCommand(sim, { type: "man-gun", soldier: player })
    stepSimulation(sim)
    expect(sim.soldiers.weapon.kind[player]).toBe(Weapon.MachineGun)
    expect(sim.soldiers.weapon.kind[gunner]).toBe(Weapon.Rifle)
    expect(sim.events).toContainEqual(expect.objectContaining({ type: "gun-manned", soldier: player }))

    enqueueCommand(sim, { type: "man-gun", soldier: player })
    stepSimulation(sim)
    expect(sim.soldiers.weapon.kind[player]).toBe(Weapon.Rifle)
    expect(sim.soldiers.weapon.kind[gunner]).toBe(Weapon.MachineGun)
  })

  it("does nothing with no gun in reach, nor an enemy's", () => {
    const sim = field()
    const player = spawnSoldier(sim, { side: Side.French, x: 50, z: 50 })
    spawnSoldier(sim, { side: Side.German, x: 51, z: 50, weapon: Weapon.MachineGun })
    spawnSoldier(sim, { side: Side.French, x: 60, z: 50, weapon: Weapon.MachineGun })
    expect(gunPartner(sim, player)).toBe(-1)

    enqueueCommand(sim, { type: "man-gun", soldier: player })
    stepSimulation(sim)
    expect(sim.soldiers.weapon.kind[player]).toBe(Weapon.Rifle)
  })
})

/** A field with a French nest at (50, 50) facing north and a German one at (50, 150) facing south. */
function withNests() {
  const nests: Scenery[] = [
    { kind: "machine-gun", x: 50, z: 50, heading: 0, variant: 0, scale: 1 },
    { kind: "machine-gun", x: 50, z: 150, heading: Math.PI, variant: 1, scale: 1 }
  ]
  return createSimulation({
    map: {
      ...createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 400 }, 5, Surface.Grass),
      scenery: nests
    },
    seed: 1
  })
}

const step = (sim: ReturnType<typeof withNests>, seconds: number) => {
  for (let tick = 0; tick < seconds * TICK_RATE; tick++) {
    stepSimulation(sim)
  }
}

describe("a machine-gun nest", () => {
  it("knows its side from its gun, and its gunner kneels behind the gun", () => {
    const sim = withNests()
    expect(nestsOf(sim.map)).toEqual([
      { x: 50, z: 49.2, side: Side.French },
      { x: expect.closeTo(50, 5), z: 150.8, side: Side.German }
    ])
  })

  it("lets a man by one nobody's on take up its gun, and leave it there", () => {
    const sim = withNests()
    const player = spawnSoldier(sim, { side: Side.French, x: 51, z: 48 })
    createSquad(sim, Side.French, [player], "player")
    expect(gunAction(sim, player)).toBe("man")

    enqueueCommand(sim, { type: "man-gun", soldier: player })
    stepSimulation(sim)
    expect(sim.soldiers.weapon.kind[player]).toBe(Weapon.MachineGun)
    expect(postOf(sim, player)).toBe(0)
    expect(gunAction(sim, player)).toBe("leave")

    enqueueCommand(sim, { type: "man-gun", soldier: player })
    stepSimulation(sim)
    expect(sim.soldiers.weapon.kind[player]).toBe(Weapon.Rifle)
    expect(postOf(sim, player)).toBe(-1)
    // Not the enemy's, nor from out of reach.
    sim.soldiers.position.z[player] = 147
    expect(gunAction(sim, player)).toBeNull()
    sim.soldiers.position.z[player] = 44
    expect(gunAction(sim, player)).toBeNull()
  })

  it("takes over the nest with its gun from the man on it, who takes up his rifle", () => {
    const sim = withNests()
    const gunner = spawnSoldier(sim, { side: Side.French, x: 0, z: 0 })
    postAt(sim, gunner, 0, true)
    const player = spawnSoldier(sim, { side: Side.French, x: 51, z: 48 })
    expect(gunAction(sim, player)).toBe("man")
    enqueueCommand(sim, { type: "man-gun", soldier: player })
    stepSimulation(sim)
    expect(postOf(sim, player)).toBe(0)
    expect(postOf(sim, gunner)).toBe(-1)
    expect(sim.soldiers.weapon.kind[gunner]).toBe(Weapon.Rifle)
  })

  it("gets a nest nobody's on manned by a rifleman holding nearby, of any squad", () => {
    const sim = withNests()
    const rifleman = spawnSoldier(sim, { side: Side.French, x: 58, z: 46 })
    const squad = createSquad(sim, Side.French, [spawnSoldier(sim, { side: Side.French, x: 70, z: 46 }), rifleman])
    squad.order = { kind: "hold" }
    // Too far off to be sent for.
    spawnSoldier(sim, { side: Side.French, x: 50, z: 20 })
    step(sim, 12)
    expect(postOf(sim, rifleman)).toBe(0)
  })

  it("keeps its gun when its gunner falls: a squadmate goes and takes it up", () => {
    const sim = withNests()
    const gunner = spawnSoldier(sim, { side: Side.French, x: 0, z: 0 })
    const mate = spawnSoldier(sim, { side: Side.French, x: 56, z: 46 })
    const squad = createSquad(sim, Side.French, [spawnSoldier(sim, { side: Side.French, x: 70, z: 40 }), gunner, mate])
    squad.order = { kind: "advance", x: 70, z: 100 }
    postAt(sim, gunner, 0, true)
    // His squad goes on without him.
    step(sim, 3)
    expect(Math.hypot(sim.soldiers.position.x[gunner] - 50, sim.soldiers.position.z[gunner] - 49.2)).toBeLessThan(0.5)

    squad.order = { kind: "hold" }
    enqueueCommand(sim, { type: "kill", soldier: gunner })
    step(sim, 20)
    expect(postOf(sim, gunner)).toBe(-1)
    expect(postOf(sim, mate)).toBe(0)
    expect(sim.soldiers.weapon.kind[mate]).toBe(Weapon.MachineGun)
  })

  it("loses its man when he walks off, and keeps him in a save", () => {
    const sim = withNests()
    const player = spawnSoldier(sim, { side: Side.French, x: 51, z: 48 })
    createSquad(sim, Side.French, [player], "player")
    enqueueCommand(sim, { type: "man-gun", soldier: player })
    stepSimulation(sim)
    expect(postOf(restoreSimulation(sim.map, takeSnapshot(sim)), player)).toBe(0)

    sim.soldiers.position.z[player] = 40
    stepSimulation(sim)
    expect(postOf(sim, player)).toBe(-1)
    expect(sim.soldiers.weapon.kind[player]).toBe(Weapon.Rifle)
  })
})

describe("setting up a skirmish", () => {
  it("puts a gunner in every nest, of its own side", () => {
    const elevation = decodeElevation(readFileSync(new URL("../../map/data/fleury-elevation.bin", import.meta.url)))
    const sim = createSimulation({ map: generateFleurySector({ seed: 1916, elevation }), seed: 1 })
    setupSkirmish(sim)
    const nests = nestsOf(sim.map)
    expect(nests.length).toBeGreaterThan(3)
    const posted = Array.from(soldierIds(sim)).filter((soldier) => postOf(sim, soldier) >= 0)
    expect(new Set(posted.map((soldier) => postOf(sim, soldier))).size).toBe(nests.length)
    for (const soldier of posted) {
      const nest = nests[postOf(sim, soldier)]
      expect(sim.soldiers.side.value[soldier]).toBe(nest?.side)
      expect(sim.soldiers.position.x[soldier]).toBeCloseTo(nest?.x ?? 0, 3)
      expect(sim.soldiers.weapon.kind[soldier]).toBe(Weapon.MachineGun)
    }
  })
})
