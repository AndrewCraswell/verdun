import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Scene } from "@babylonjs/core/scene"
import { carveTrenches, createFlatMap, type Trench } from "@verdun/map"
import { createSimulation, type ShotEvent, Side, spawnSoldier, Weapon } from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
import { createTracers } from "./tracers.ts"

const engines: NullEngine[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

/** A level field at 0 m with a rifleman and a machine gunner at the south end, the camera looking on. */
function setup(light = 1, quality: "low" | "high" = "high") {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, 1, 80, new Vector3(50, 0, 60), scene)
  const sim = createSimulation({ map: createFlatMap({ name: "field", cellSize: 1, columns: 200, rows: 200 }), seed: 1 })
  const rifleman = spawnSoldier(sim, { side: Side.French, x: 50, z: 10 })
  const gunner = spawnSoldier(sim, { side: Side.French, x: 60, z: 10, weapon: Weapon.MachineGun })
  const state = { light }
  const tracers = createTracers(scene, { sim, camera, light: () => state.light, quality })
  return { scene, sim, tracers, rifleman, gunner, state }
}

const shot = (shooter: number, hit: boolean, toZ = 110): ShotEvent => ({
  type: "shot",
  shooter,
  target: 2,
  hit,
  from: { x: 50, y: 1.6, z: 10 },
  to: { x: 50, y: 1.3, z: toZ }
})

describe("gunfire", () => {
  it("flies each round out at a bullet's speed as a short streak, stopping at its man", () => {
    const { tracers, rifleman } = setup()
    tracers.add([shot(rifleman, true)])
    tracers.update(0.04)
    const [first] = tracers.instances.matrices()
    // 30 m flown in 0.04 s: a 4 m streak ending 30 m out from the muzzle.
    expect(first?.getTranslation().z).toBeGreaterThan(36)
    expect(first?.getTranslation().z).toBeLessThan(42)
    tracers.update(0.05)
    expect(tracers.instances.matrices()[0]?.getTranslation().z).toBeGreaterThan(first?.getTranslation().z ?? 0)
    // 100 m away, it has landed by 0.2 s.
    tracers.update(0.11)
    expect(tracers.rounds).toBe(0)
  })

  it("sends misses on past their man, most of them into the ground near him, kicking up dirt", () => {
    const { tracers, rifleman } = setup()
    const strikes: number[] = []
    tracers.onStrike.add((strike) => strikes.push(strike.time))
    tracers.add(Array.from({ length: 10 }, () => shot(rifleman, false, 60)))
    expect(tracers.rounds).toBe(10)
    // Smoke and dirt fade into fog like the level's own.
    expect(tracers.dirt.applyFog && tracers.smoke.applyFog).toBe(true)
    for (let frame = 0; frame < 30; frame++) {
      tracers.update(1 / 60)
    }
    expect(tracers.rounds).toBe(0)
    // Five grains a strike, from at least half of them, each strike told as the dirt flies: about 50-100 m out, 0.07-0.13 s.
    expect(tracers.dirt.manualEmitCount).toBeGreaterThanOrEqual(25)
    expect(strikes.length * 5).toBe(tracers.dirt.manualEmitCount)
    expect(strikes.every((time) => time > 0.03 && time < 0.2)).toBe(true)
  })

  it("makes every fourth machine-gun round a bright tracer, and flashes at the muzzle", () => {
    const { tracers, gunner, scene } = setup()
    tracers.add(Array.from({ length: 8 }, () => shot(gunner, true)))
    tracers.update(0.01)
    expect(tracers.tracers.thinInstanceCount).toBeGreaterThanOrEqual(2)
    expect(tracers.flashes.thinInstanceCount).toBeGreaterThanOrEqual(8)
    const flashMaterial = scene.getMaterialByName("muzzle-flashes")
    expect(flashMaterial instanceof StandardMaterial).toBe(true)
  })

  it("kicks up no muzzle smoke and less dirt on the low setting", () => {
    const { tracers, rifleman } = setup(1, "low")
    tracers.add(Array.from({ length: 10 }, () => shot(rifleman, false, 60)))
    for (let frame = 0; frame < 30; frame++) {
      tracers.update(1 / 60)
    }
    expect(tracers.smoke.manualEmitCount).toBe(0)
    expect(tracers.dirt.manualEmitCount % 2).toBe(0)
    expect(tracers.dirt.manualEmitCount).toBeGreaterThan(0)
  })

  it("burns brighter at night, bright enough to bloom", () => {
    const { tracers, gunner, scene, state } = setup(1)
    tracers.add(Array.from({ length: 4 }, () => shot(gunner, true)))
    tracers.update(0.01)
    const material = scene.getMaterialByName("tracer-rounds")
    const day = material instanceof StandardMaterial ? material.emissiveColor.r : 0
    state.light = 0
    tracers.update(0.01)
    const night = material instanceof StandardMaterial ? material.emissiveColor.r : 0
    expect(night).toBeGreaterThan(day * 2)
    expect(night).toBeGreaterThan(1.05)
  })

  it("keeps streaks a couple of pixels wide however far off, and copes with a shot at its own feet", () => {
    const { tracers, rifleman } = setup()
    tracers.add([{ ...shot(rifleman, true), to: { x: 50, y: 1.6, z: 10.2 } }, shot(rifleman, true, 190)])
    tracers.update(0.05)
    const matrices = tracers.instances.matrices()
    expect(matrices.length).toBeGreaterThanOrEqual(1)
    const [streak] = matrices
    const width = Math.hypot(streak?.m[0] ?? 0, streak?.m[1] ?? 0, streak?.m[2] ?? 0)
    expect(width).toBeGreaterThan(0.03)
    expect(matrices.every((matrix) => matrix.m.every((value) => Number.isFinite(value)))).toBe(true)
    tracers.dispose()
  })

  it("throws sparks off wire, dust off a parapet, and earth in the open, and says which", () => {
    const engine = new NullEngine()
    engines.push(engine)
    const scene = new Scene(engine)
    const camera = new ArcRotateCamera("camera", -Math.PI / 2, 1, 80, new Vector3(100, 0, 100), scene)
    const flat = createFlatMap({ name: "field", cellSize: 1, columns: 200, rows: 200 })
    const trench: Trench = {
      kind: "fire",
      points: [
        [20, 150],
        [180, 150]
      ],
      facing: "south"
    }
    carveTrenches(flat, [trench])
    const belt = { points: [[20, 100] as const, [180, 100] as const] }
    const sim = createSimulation({ map: { ...flat, trenches: [trench], wire: [belt] }, seed: 1 })
    const rifleman = spawnSoldier(sim, { side: Side.French, x: 100, z: 40 })
    const tracers = createTracers(scene, { sim, camera, light: () => 1 })
    const struck: string[] = []
    tracers.onStrike.add((strike) => struck.push(strike.on))
    const at = (z: number, fromZ = 40): ShotEvent => ({
      type: "shot",
      shooter: rifleman,
      target: -1,
      hit: false,
      from: { x: 100, y: 1.6, z: fromZ },
      to: { x: 100, y: 0.2, z }
    })
    const fly = () => {
      for (let frame = 0; frame < 40; frame++) {
        tracers.update(1 / 60)
      }
    }
    // Aimed at a man just behind the belt: low misses come down through the wire.
    tracers.add(Array.from({ length: 8 }, () => at(104)))
    fly()
    expect(struck).toContain("wire")
    expect(tracers.sparks.manualEmitCount).toBeGreaterThan(0)
    struck.length = 0
    // Fired from past the wire, so nothing's in the way: low misses come down round the trench's edge.
    tracers.add(Array.from({ length: 8 }, () => at(155, 115)))
    fly()
    expect(struck).toContain("parapet")
    expect(tracers.dust.manualEmitCount).toBeGreaterThan(0)
    struck.length = 0
    // Well short of the wire, so even a miss that flies on past its man comes down in open ground.
    tracers.add(Array.from({ length: 8 }, () => at(60)))
    fly()
    expect(struck).toEqual(struck.map(() => "ground"))
  })

  it("steams a German machine gun that has fired hard, smokes a French one, and lets both cool", () => {
    const { tracers, sim } = setup()
    const german = spawnSoldier(sim, { side: Side.German, x: 70, z: 100, weapon: Weapon.MachineGun })
    const french = spawnSoldier(sim, { side: Side.French, x: 40, z: 20, weapon: Weapon.MachineGun })
    const burst = (gunner: number, z: number) =>
      Array.from({ length: 80 }, (): ShotEvent => ({
        type: "shot",
        shooter: gunner,
        target: -1,
        hit: true,
        from: { x: 50, y: 1.6, z },
        to: { x: 50, y: 1.3, z: z + 60 }
      }))
    tracers.add([...burst(german, 100), ...burst(french, 20)])
    const smokeBefore = tracers.smoke.manualEmitCount
    tracers.update(1)
    expect(tracers.heat.get(german)).toBeGreaterThan(60)
    expect(tracers.steam.manualEmitCount).toBeGreaterThan(0)
    expect(tracers.smoke.manualEmitCount).toBeGreaterThan(smokeBefore)
    for (let second = 0; second < 25; second++) {
      tracers.update(1)
    }
    expect(tracers.heat.has(german)).toBe(false)
  })
})
