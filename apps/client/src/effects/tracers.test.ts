import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap } from "@verdun/map"
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
function setup(light = 1) {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, 1, 80, new Vector3(50, 0, 60), scene)
  const sim = createSimulation({ map: createFlatMap({ name: "field", cellSize: 1, columns: 200, rows: 200 }), seed: 1 })
  const rifleman = spawnSoldier(sim, { side: Side.French, x: 50, z: 10 })
  const gunner = spawnSoldier(sim, { side: Side.French, x: 60, z: 10, weapon: Weapon.MachineGun })
  const state = { light }
  const tracers = createTracers(scene, { sim, camera, light: () => state.light })
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
    tracers.add(Array.from({ length: 10 }, () => shot(rifleman, false, 60)))
    expect(tracers.rounds).toBe(10)
    for (let frame = 0; frame < 30; frame++) {
      tracers.update(1 / 60)
    }
    expect(tracers.rounds).toBe(0)
    // Five grains a strike, from at least half of them.
    expect(tracers.dirt.manualEmitCount).toBeGreaterThanOrEqual(25)
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
})
