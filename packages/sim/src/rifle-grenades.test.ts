import { carveTrenches, createFlatMap, Surface, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { Shell } from "./artillery.ts"
import { shotEvents, toWeapon, Weapon } from "./combat.ts"
import { Side, Stance } from "./components.ts"
import { type LineOfSight } from "./line-of-sight.ts"
import { createLineOfSight } from "./physics-sight.ts"
import { RIFLE_GRENADES_CARRIED } from "./rifle-grenades.ts"
import {
  createSimulation,
  type SimEvent,
  type Simulation,
  spawnSoldier,
  stepSimulation,
  TICK_RATE
} from "./simulation.ts"
import { restoreSimulation, takeSnapshot } from "./snapshot.ts"
import { createSquad } from "./squads.ts"

const opened: LineOfSight[] = []
afterEach(() => {
  for (const lineOfSight of opened.splice(0)) {
    lineOfSight.dispose()
  }
})

async function field(): Promise<Simulation> {
  const sim = createSimulation({
    map: createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 800 }, 5, Surface.Grass),
    seed: 1
  })
  sim.lineOfSight = await createLineOfSight(sim.map)
  opened.push(sim.lineOfSight)
  return sim
}

function stepFor(sim: Simulation, seconds: number): SimEvent[] {
  const events: SimEvent[] = []
  for (let step = 0; step < seconds * TICK_RATE; step++) {
    stepSimulation(sim)
    events.push(...sim.events)
  }
  return events
}

/** Tells a side's spotting that an enemy gun has just fired from where its gunner stands, seen. */
function spotted(sim: Simulation, gunner: number): void {
  sim.spotting.sightings.push({
    soldier: gunner,
    side: sim.soldiers.side.value[gunner] === Side.German ? Side.German : Side.French,
    x: sim.soldiers.position.x[gunner],
    z: sim.soldiers.position.z[gunner],
    lastFired: sim.tick,
    spotted: true,
    seen: true,
    checkedAt: sim.tick,
    shelledAt: sim.tick
  })
}

describe("rifle grenades", () => {
  it("are lobbed into a spotted machine-gun nest within reach, one every few seconds", async () => {
    const sim = await field()
    const grenadier = spawnSoldier(sim, { side: Side.French, x: 100, z: 50, weapon: Weapon.RifleGrenadier })
    const gunner = spawnSoldier(sim, { side: Side.German, x: 100, z: 150, weapon: Weapon.MachineGun })
    spotted(sim, gunner)
    expect(sim.soldiers.rifleGrenades.count[grenadier]).toBe(RIFLE_GRENADES_CARRIED)
    const events = stepFor(sim, 0.5)

    const fired = events.filter((event) => event.type === "rifle-grenade")
    expect(fired).toHaveLength(1)
    expect(sim.soldiers.rifleGrenades.count[grenadier]).toBe(RIFLE_GRENADES_CARRIED - 1)
    const shell = sim.artillery.shells.find((inFlight) => inFlight.shell === Shell.Grenade)
    expect(shell?.side).toBe(Side.French)
    expect(Math.abs((shell?.z ?? 0) - 150)).toBeLessThan(40)
  })

  it("aren't wasted on a gun beyond the discharger's reach, nor carried by ordinary riflemen", async () => {
    const sim = await field()
    const grenadier = spawnSoldier(sim, { side: Side.French, x: 100, z: 50, weapon: Weapon.RifleGrenadier })
    const rifleman = spawnSoldier(sim, { side: Side.French, x: 110, z: 50 })
    const gunner = spawnSoldier(sim, { side: Side.German, x: 100, z: 300, weapon: Weapon.MachineGun })
    spotted(sim, gunner)
    const events = stepFor(sim, 3)

    expect(events.some((event) => event.type === "rifle-grenade")).toBe(false)
    expect(sim.soldiers.rifleGrenades.count[grenadier]).toBe(RIFLE_GRENADES_CARRIED)
    expect(sim.soldiers.rifleGrenades.count[rifleman]).toBe(0)
  })

  it("keep their count through a save and restore", async () => {
    const sim = await field()
    const grenadier = spawnSoldier(sim, { side: Side.French, x: 100, z: 50, weapon: Weapon.RifleGrenadier })
    const gunner = spawnSoldier(sim, { side: Side.German, x: 100, z: 150, weapon: Weapon.MachineGun })
    spotted(sim, gunner)
    stepFor(sim, 0.5)

    const restored = restoreSimulation(sim.map, takeSnapshot(sim))
    expect(restored.soldiers.rifleGrenades.count[grenadier]).toBe(RIFLE_GRENADES_CARRIED - 1)
    expect(restored.soldiers.weapon.kind[grenadier]).toBe(Weapon.RifleGrenadier)
  })
})

describe("snipers", () => {
  it("go for a spotted machine gunner before a nearer rifleman", async () => {
    const sim = await field()
    const sniper = spawnSoldier(sim, { side: Side.French, x: 100, z: 50, weapon: Weapon.Sniper })
    spawnSoldier(sim, { side: Side.German, x: 100, z: 200 })
    const gunner = spawnSoldier(sim, { side: Side.German, x: 120, z: 320, weapon: Weapon.MachineGun })
    spotted(sim, gunner)
    const shots = shotEvents(stepFor(sim, 3)).filter((shot) => shot.shooter === sniper)

    expect(shots.length).toBeGreaterThan(0)
    expect(shots[0]?.target).toBe(gunner)
  })

  it("pick off a squad leader before the men around him", async () => {
    const sim = await field()
    // Lying in his hide: beyond 100 m nobody wastes a shot on a man flat on the ground.
    const sniper = spawnSoldier(sim, { side: Side.French, x: 100, z: 50, weapon: Weapon.Sniper })
    sim.soldiers.stance.value[sniper] = Stance.Prone
    const men = [90, 100, 110].map((x) => spawnSoldier(sim, { side: Side.German, x, z: 250 }))
    const leader = spawnSoldier(sim, { side: Side.German, x: 100, z: 300 })
    // On the move, so every man is up and in sight.
    const squad = createSquad(sim, Side.German, [leader, ...men])
    squad.order = { kind: "advance", x: 100, z: 390 }
    const shots = shotEvents(stepFor(sim, 3)).filter((shot) => shot.shooter === sniper)

    expect(shots.length).toBeGreaterThan(0)
    expect(shots[0]?.target).toBe(leader)
  })
})

describe("rifle grenadiers and snipers at the edges", () => {
  it("lob into a trench where they can see men a rifle can't reach, on either side", async () => {
    const flat = createFlatMap({ name: "lines", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass)
    const trench: Trench = {
      kind: "fire",
      points: [
        [20, 50],
        [180, 50]
      ],
      facing: "north"
    }
    carveTrenches(flat, [trench])
    const sim = createSimulation({ map: { ...flat, trenches: [trench] }, seed: 1 })
    sim.lineOfSight = await createLineOfSight(sim.map)
    opened.push(sim.lineOfSight)
    const grenadier = spawnSoldier(sim, { side: Side.German, x: 100, z: 160, weapon: Weapon.RifleGrenadier })
    spawnSoldier(sim, { side: Side.French, x: 100, z: 50.8 })
    const events = stepFor(sim, 0.5)

    expect(events.filter((event) => event.type === "rifle-grenade")).toHaveLength(1)
    expect(sim.artillery.shells.find((inFlight) => inFlight.shell === Shell.Grenade)?.side).toBe(Side.German)
    expect(sim.soldiers.rifleGrenades.count[grenadier]).toBe(RIFLE_GRENADES_CARRIED - 1)
  })

  it("hold their grenades without sight lines, and when the player has the grenadier", async () => {
    const blind = createSimulation({
      map: createFlatMap({ name: "field", cellSize: 0.5, columns: 400, rows: 400 }, 5, Surface.Grass),
      seed: 1
    })
    spawnSoldier(blind, { side: Side.French, x: 100, z: 50, weapon: Weapon.RifleGrenadier })
    spawnSoldier(blind, { side: Side.German, x: 100, z: 150 })
    expect(stepFor(blind, 2).some((event) => event.type === "rifle-grenade")).toBe(false)

    const sim = await field()
    const grenadier = spawnSoldier(sim, { side: Side.French, x: 100, z: 50, weapon: Weapon.RifleGrenadier })
    createSquad(sim, Side.French, [grenadier], "player")
    const gunner = spawnSoldier(sim, { side: Side.German, x: 100, z: 150, weapon: Weapon.MachineGun })
    spotted(sim, gunner)
    expect(stepFor(sim, 2).some((event) => event.type === "rifle-grenade")).toBe(false)
  })

  it("read an unknown stored weapon as a rifle", () => {
    expect(toWeapon(99)).toBe(Weapon.Rifle)
    expect(toWeapon(Weapon.Sniper)).toBe(Weapon.Sniper)
  })

  it("let a German sniper with no gunner or leader in sight shoot like any rifleman", async () => {
    const sim = await field()
    const sniper = spawnSoldier(sim, { side: Side.German, x: 100, z: 300, weapon: Weapon.Sniper })
    sim.soldiers.stance.value[sniper] = Stance.Prone
    const target = spawnSoldier(sim, { side: Side.French, x: 100, z: 220 })
    const first = shotEvents(stepFor(sim, 3)).find((shot) => shot.shooter === sniper)

    expect(first?.target).toBe(target)
  })
})
