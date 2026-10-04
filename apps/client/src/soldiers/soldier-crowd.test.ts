import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import { generateRollingTerrain, heightAt } from "@verdun/map"
import {
  createSimulation,
  enqueueCommand,
  MaskState,
  Side,
  type Simulation,
  spawnSoldier,
  Stance,
  STEP_SECONDS,
  stepSimulation,
  surrender,
  Weapon
} from "@verdun/sim"
import { afterEach, describe, expect, it, vi } from "vitest"
import { type BakedClip, CLIPS, type ClipName, deathClip } from "./soldier-animation.ts"
import { createSoldierCrowd, type SoldierCrowd } from "./soldier-crowd.ts"
import type { SoldierKit } from "./soldier-kit.ts"

const map = generateRollingTerrain({
  name: "test",
  widthMeters: 120,
  depthMeters: 80,
  cellSize: 0.5,
  seed: 3,
  amplitude: 8
})

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

/** Every clip ten frames long at ten a second, one after another. */
const CLIP_FRAMES = 10
const clips = new Map<ClipName, BakedClip>(
  CLIPS.map((name, index) => [name, { start: index * CLIP_FRAMES, frames: CLIP_FRAMES, fps: 10 }])
)

/** Every death carries the hips half a metre further along +x each frame; nothing else drifts. */
const drift = new Float32Array(CLIPS.length * CLIP_FRAMES * 2)
for (const [index, name] of CLIPS.entries()) {
  if (name.startsWith("death_")) {
    for (let frame = 0; frame < CLIP_FRAMES; frame++) {
      drift[(index * CLIP_FRAMES + frame) * 2] = frame * 0.5
    }
  }
}

function clipAt(row: number | undefined): ClipName | undefined {
  return row === undefined ? undefined : CLIPS[Math.floor(row / CLIP_FRAMES)]
}

interface Harness {
  readonly sim: Simulation
  readonly scene: Scene
  readonly kit: SoldierKit
  readonly crowd: SoldierCrowd
  /** Moves the crowd's clock on. */
  tick(seconds: number): void
  /** The baked-animation row each instance of a mesh shows. */
  rows(mesh: Mesh): number[]
  /** Each instance's world matrix, as last written. */
  matrices(mesh: Mesh): Matrix[]
}

function harness(sim: Simulation): Harness {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const box = (name: string) => CreateBox(name, { size: 0.5 }, scene)
  const kit: SoldierKit = {
    bodies: { [Side.French]: box("french"), [Side.German]: box("german") },
    rifle: box("rifle"),
    mask: box("mask"),
    guns: { [Side.French]: box("french-gun"), [Side.German]: box("german-gun") },
    drift,
    clips,
    materials: []
  }
  const settings = new Map<Mesh, Float32Array>()
  const transforms = new Map<Mesh, Float32Array>()
  for (const mesh of [kit.bodies[Side.French], kit.bodies[Side.German], kit.rifle, kit.mask, kit.guns[Side.French]]) {
    const set = mesh.thinInstanceSetBuffer.bind(mesh)
    vi.spyOn(mesh, "thinInstanceSetBuffer").mockImplementation((kind, buffer, stride, staticBuffer) => {
      if (kind === "bakedVertexAnimationSettingsInstanced" && buffer instanceof Float32Array) {
        settings.set(mesh, buffer)
      }
      if (kind === "matrix" && buffer instanceof Float32Array) {
        transforms.set(mesh, buffer)
      }
      set(kind, buffer, stride, staticBuffer)
    })
  }
  let now = 0
  const crowd = createSoldierCrowd(scene, sim, kit, { clock: () => now })
  return {
    sim,
    scene,
    kit,
    crowd,
    tick(seconds) {
      now += seconds
    },
    rows(mesh) {
      const buffer = settings.get(mesh)
      return Array.from({ length: mesh.thinInstanceCount }, (_, index) => buffer?.[index * 4] ?? -1)
    },
    matrices(mesh) {
      const buffer = transforms.get(mesh) ?? new Float32Array(0)
      return Array.from({ length: mesh.thinInstanceCount }, (_, index) => Matrix.FromArray(buffer, index * 16))
    }
  }
}

function step(sim: Simulation, steps: number): void {
  for (let index = 0; index < steps; index++) {
    stepSimulation(sim)
  }
}

describe("createSoldierCrowd", () => {
  it("draws each side's men standing on the ground, with rifles, and a machine gun before a still gunner", () => {
    const sim = createSimulation({ map, seed: 1 })
    spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    spawnSoldier(sim, { side: Side.French, x: 14, z: 10, weapon: Weapon.MachineGun })
    spawnSoldier(sim, { side: Side.German, x: 50, z: 70, facing: { x: 1, z: 0 } })
    const { crowd, kit, matrices } = harness(sim)
    crowd.sync()
    crowd.update()

    expect(kit.bodies[Side.French].thinInstanceCount).toBe(2)
    expect(kit.bodies[Side.German].thinInstanceCount).toBe(1)
    expect(kit.rifle.thinInstanceCount).toBe(2)
    expect(kit.guns[Side.French].thinInstanceCount).toBe(1)
    // The gun stands on the ground a metre ahead of its gunner, who faces north.
    expect(matrices(kit.guns[Side.French])[0]?.getTranslation().y).toBeCloseTo(heightAt(map, 14, 11), 4)
    expect(kit.guns[Side.German].thinInstanceCount).toBe(0)
    expect(kit.mask.thinInstanceCount).toBe(0)
    expect(crowd.stats.drawn).toBe(3)

    const [german] = matrices(kit.bodies[Side.German])
    expect(german?.getTranslation().y).toBeCloseTo(heightAt(map, 50, 70), 4)
    // Facing east: the model's forward, +z, turned onto +x.
    const forward = german ? Vector3.TransformNormal(Vector3.Forward(), german) : Vector3.Zero()
    expect(forward.x).toBeCloseTo(1)
  })

  it("leaves out enemies out of sight and men down a dugout, but not the fallen or prisoners", () => {
    const sim = createSimulation({ map, seed: 1 })
    const seen = spawnSoldier(sim, { side: Side.German, x: 50, z: 70 })
    spawnSoldier(sim, { side: Side.German, x: 60, z: 70 })
    const sheltering = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const fallen = spawnSoldier(sim, { side: Side.German, x: 30, z: 30 })
    const prisoner = spawnSoldier(sim, { side: Side.French, x: 40, z: 30 })
    sim.soldiers.stance.value[sheltering] = Stance.Sheltering
    surrender(sim, prisoner)
    enqueueCommand(sim, { type: "kill", soldier: fallen })
    step(sim, 1)
    const { crowd, kit } = harness(sim)
    crowd.sync((soldier) => soldier === seen || soldier === prisoner)
    crowd.update()

    expect(kit.bodies[Side.German].thinInstanceCount).toBe(2)
    // The prisoner walks to the rear without his rifle.
    expect(kit.bodies[Side.French].thinInstanceCount).toBe(1)
    expect(kit.rifle.thinInstanceCount).toBe(2)
  })

  it("glides between simulation steps instead of jumping", () => {
    const sim = createSimulation({ map, seed: 1 })
    const walker = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const { crowd, kit, tick, rows, matrices } = harness(sim)
    crowd.sync()
    enqueueCommand(sim, { type: "move-to", soldier: walker, x: 10, z: 40 })
    for (let index = 0; index < 4; index++) {
      step(sim, 1)
      tick(STEP_SECONDS)
      crowd.sync()
    }
    const before = sim.soldiers.position.z[walker]
    step(sim, 1)
    const after = sim.soldiers.position.z[walker]
    tick(STEP_SECONDS)
    crowd.sync()
    tick(STEP_SECONDS / 2)
    crowd.update()

    const [matrix] = matrices(kit.bodies[Side.French])
    expect(matrix?.getTranslation().z).toBeCloseTo((before + after) / 2, 4)
    expect(clipAt(rows(kit.bodies[Side.French])[0])).toBe("walk_forward")

    tick(STEP_SECONDS)
    crowd.update()
    expect(matrices(kit.bodies[Side.French])[0]?.getTranslation().z).toBeCloseTo(after, 4)
  })

  it("snaps a soldier who jumps further than anyone could walk", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const { crowd, kit, tick, matrices } = harness(sim)
    crowd.sync()
    step(sim, 1)
    sim.soldiers.position.x[soldier] = 60
    crowd.sync()
    tick(0.001)
    crowd.update()

    expect(matrices(kit.bodies[Side.French])[0]?.getTranslation().x).toBeCloseTo(60)
  })

  it("turns smoothly toward a new facing", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const { crowd, kit, tick, matrices } = harness(sim)
    crowd.sync()
    sim.soldiers.facing.x[soldier] = 1
    sim.soldiers.facing.z[soldier] = 0
    crowd.sync()
    tick(0.05)
    crowd.update()
    const heading = () => {
      const matrix = matrices(kit.bodies[Side.French])[0]
      const forward = matrix ? Vector3.TransformNormal(Vector3.Forward(), matrix) : Vector3.Zero()
      return Math.atan2(forward.x, forward.z)
    }

    expect(heading()).toBeGreaterThan(0.1)
    expect(heading()).toBeLessThan(Math.PI / 2 - 0.1)
    tick(2)
    crowd.update()
    expect(heading()).toBeCloseTo(Math.PI / 2, 2)
  })

  it("plays a death through once, then holds it; the long dead lie still from the start", () => {
    const sim = createSimulation({ map, seed: 1 })
    const longDead = spawnSoldier(sim, { side: Side.German, x: 30, z: 30 })
    const victim = spawnSoldier(sim, { side: Side.German, x: 40, z: 30 })
    enqueueCommand(sim, { type: "kill", soldier: longDead })
    step(sim, 1)
    const { crowd, kit, tick, rows, matrices } = harness(sim)
    crowd.sync()
    crowd.update()
    const longDeadClip = clips.get(deathClip(Stance.Standing, longDead))
    expect(rows(kit.bodies[Side.German])).toContain((longDeadClip?.start ?? 0) + CLIP_FRAMES - 1)
    // His clip carried his hips 4.5 m along the model's +x, which faces west for a German facing south: drawn 4.5 m
    // east to bring them back over where he fell.
    expect(matrices(kit.bodies[Side.German])[1]?.getTranslation().x).toBeCloseTo(34.5, 3)

    enqueueCommand(sim, { type: "kill", soldier: victim })
    step(sim, 1)
    crowd.sync()
    crowd.update()
    const falling = clips.get(deathClip(Stance.Standing, victim))?.start ?? 0
    expect(rows(kit.bodies[Side.German])).toContain(falling)
    tick(0.5)
    crowd.update()
    expect(rows(kit.bodies[Side.German])).toContain(falling + 5)
    tick(10)
    crowd.sync()
    crowd.update()
    expect(rows(kit.bodies[Side.German])).toContain(falling + CLIP_FRAMES - 1)
  })

  it("lays the fallen and the prone along the slope", () => {
    const sim = createSimulation({ map, seed: 1 })
    const prone = spawnSoldier(sim, { side: Side.French, x: 30, z: 30 })
    sim.soldiers.stance.value[prone] = Stance.Prone
    const { crowd, kit, rows, matrices } = harness(sim)
    crowd.sync()
    crowd.update()

    const [matrix] = matrices(kit.bodies[Side.French])
    const up = matrix ? Vector3.TransformNormal(Vector3.Up(), matrix) : Vector3.Zero()
    const slope = heightAt(map, 30.5, 30) - heightAt(map, 29.5, 30)
    expect(Math.sign(up.x)).toBe(-Math.sign(slope))
    expect(up.length()).toBeCloseTo(1)
    expect(clipAt(rows(kit.bodies[Side.French])[0])).toBe("idle_1")
  })

  it("recoils on firing, flinches when hit, throws, and pulls on a gas mask", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const { crowd, kit, tick, rows } = harness(sim)
    const clipNow = () => {
      crowd.update()
      return clipAt(rows(kit.bodies[Side.French])[0])
    }
    crowd.sync()
    expect(clipNow()).toBe("idle")

    sim.soldiers.weapon.cooldown[soldier] = 3
    crowd.sync()
    expect(clipNow()).toBe("brengun_fire")
    tick(1.1)
    crowd.sync()
    expect(clipNow()).toBe("idle")

    sim.soldiers.health.value[soldier] = 0.5
    crowd.sync()
    expect(clipNow()).toBe("hit_ribs")
    tick(1.1)

    sim.soldiers.grenades.count[soldier] -= 1
    sim.soldiers.mask.state[soldier] = MaskState.On
    crowd.sync()
    expect(clipNow()).toBe("stengun_reload")
    expect(kit.mask.thinInstanceCount).toBe(1)
  })

  it("culls soldiers outside the view, once a frame", () => {
    const sim = createSimulation({ map, seed: 1 })
    spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    spawnSoldier(sim, { side: Side.French, x: 100, z: 70 })
    const { crowd, kit, scene } = harness(sim)
    // Looking north-east from the middle: the man in the south-west corner is behind the camera.
    const camera = new FreeCamera("camera", new Vector3(60, 40, 40), scene)
    camera.setTarget(new Vector3(100, heightAt(map, 100, 70), 70))
    crowd.sync()
    scene.render()

    expect(kit.bodies[Side.French].thinInstanceCount).toBe(1)
    crowd.dispose()
    expect(scene.onBeforeCameraRenderObservable.hasObservers()).toBe(false)
  })

  it("makes room for a larger crowd", () => {
    const sim = createSimulation({ map, seed: 1 })
    for (let index = 0; index < 100; index++) {
      spawnSoldier(sim, { side: Side.German, x: 5 + (index % 10) * 10, z: 5 + Math.floor(index / 10) * 7 })
    }
    const { crowd, kit, rows } = harness(sim)
    crowd.sync()
    crowd.update()

    expect(kit.bodies[Side.German].thinInstanceCount).toBe(100)
    expect(kit.rifle.thinInstanceCount).toBe(100)
    expect(rows(kit.bodies[Side.German]).every((row) => clipAt(row) === "idle")).toBe(true)
  })
})
