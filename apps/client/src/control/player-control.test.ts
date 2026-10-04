import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap } from "@verdun/map"
import { createSimulation, Side, spawnSoldier, stepSimulation } from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
import { aimToward, createPlayerControl, type GroundVector, steerFromKeys } from "./player-control.ts"
import { createSoldierMarker } from "./soldier-marker.ts"

/** The default camera: south of its target, looking north. */
const LOOKING_NORTH = -Math.PI / 2

describe("steerFromKeys", () => {
  it("walks away from the camera on W and to its right on D", () => {
    expect(steerFromKeys(new Set(["KeyW"]), LOOKING_NORTH).z).toBeCloseTo(1)
    expect(steerFromKeys(new Set(["KeyS"]), LOOKING_NORTH).z).toBeCloseTo(-1)
    expect(steerFromKeys(new Set(["KeyD"]), LOOKING_NORTH).x).toBeCloseTo(1)
    expect(steerFromKeys(new Set(["KeyA"]), LOOKING_NORTH).x).toBeCloseTo(-1)
  })

  it("turns with the camera: looking east, W walks east", () => {
    const steer = steerFromKeys(new Set(["KeyW"]), Math.PI)

    expect(steer.x).toBeCloseTo(1)
    expect(steer.z).toBeCloseTo(0)
  })

  it("normalises diagonals and cancels opposing keys", () => {
    const diagonal = steerFromKeys(new Set(["KeyW", "KeyD"]), LOOKING_NORTH)

    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1)
    expect(steerFromKeys(new Set(["KeyW", "KeyS"]), LOOKING_NORTH)).toEqual({ x: 0, z: 0 })
    expect(steerFromKeys(new Set(), LOOKING_NORTH)).toEqual({ x: 0, z: 0 })
  })
})

describe("aimToward", () => {
  it("points from the soldier to the target, ignoring targets underfoot", () => {
    expect(aimToward({ x: 0, z: 0 }, { x: 3, z: 4 })).toEqual({ x: 0.6, z: 0.8 })
    expect(aimToward({ x: 0, z: 0 }, { x: 0.1, z: 0 })).toBeNull()
  })
})

const engines: NullEngine[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function setup() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const sim = createSimulation({
    map: createFlatMap({ name: "test", cellSize: 1, columns: 100, rows: 100 }, 3),
    seed: 1
  })
  const soldier = spawnSoldier(sim, { side: Side.French, x: 50, z: 50 })
  const camera = new ArcRotateCamera("camera", LOOKING_NORTH, 0.6, 60, new Vector3(0, 0, 0), scene)
  const held = new Set<string>()
  let pointer: GroundVector | null = null
  const control = createPlayerControl(sim, soldier, camera, {
    held,
    pointerGround: () => pointer
  })
  return { scene, sim, soldier, camera, held, control, point: (value: GroundVector | null) => (pointer = value) }
}

describe("createPlayerControl", () => {
  it("steers the soldier with held keys through simulation commands", () => {
    const { sim, soldier, held, control } = setup()
    held.add("KeyW")
    for (let step = 0; step < 20; step++) {
      control.update(0.05)
      stepSimulation(sim)
    }
    held.clear()
    control.update(0.05)
    stepSimulation(sim)

    expect(sim.soldiers.position.z[soldier]).toBeCloseTo(51.4)
    expect(sim.pendingCommands).toHaveLength(0)
  })

  it("only sends steering when it changes", () => {
    const { sim, held, control } = setup()
    held.add("KeyD")
    control.update(0.05)
    control.update(0.05)

    expect(sim.pendingCommands).toHaveLength(1)
  })

  it("aims at the ground under the pointer", () => {
    const { sim, soldier, control, point } = setup()
    point({ x: 60, z: 50 })
    control.update(0.05)
    control.update(0.05)
    stepSimulation(sim)

    expect(sim.soldiers.facing.x[soldier]).toBeCloseTo(1)
    expect(sim.soldiers.facing.z[soldier]).toBeCloseTo(0)
    expect(sim.pendingCommands).toHaveLength(0)
  })

  it("keeps the camera on the soldier, easing toward them", () => {
    const { camera, control } = setup()
    control.update(0.1)
    const partway = camera.target.x

    for (let frame = 0; frame < 60; frame++) {
      control.update(0.1)
    }
    expect(partway).toBeGreaterThan(0)
    expect(partway).toBeLessThan(50)
    expect(camera.target.x).toBeCloseTo(50)
    expect(camera.target.z).toBeCloseTo(50)
    // Chest height above the 3 m ground.
    expect(camera.target.y).toBeCloseTo(4.2)
    expect(camera.panningSensibility).toBe(0)
  })
})

describe("createSoldierMarker", () => {
  it("sits at the soldier's feet and turns to their facing", () => {
    const { scene, sim, soldier } = setup()
    const marker = createSoldierMarker(scene, sim, soldier)
    sim.soldiers.facing.x[soldier] = 1
    sim.soldiers.facing.z[soldier] = 0
    marker.update()

    expect(marker.root.position.x).toBe(50)
    expect(marker.root.position.y).toBeCloseTo(3.05)
    expect(marker.root.rotation.y).toBeCloseTo(Math.PI / 2)
  })
})
