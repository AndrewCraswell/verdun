import { Buffer } from "@babylonjs/core/Buffers/buffer"
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import {
  beltLayout,
  createFlatMap,
  generateRollingTerrain,
  heightAt,
  sampleIndex,
  Surface,
  type WireBelt
} from "@verdun/map"
import {
  createSimulation,
  enqueueCommand,
  FENCE_CLIMB_SECONDS,
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
import { bucketInstanceCounts } from "../effects/instance-buffer.ts"
import { nearestDepth } from "../render/nearest-depth.ts"
import {
  AIM_WALKS,
  type BakedClip,
  CLIPS,
  type ClipName,
  CROUCH_AIM_WALKS,
  DEATHS,
  deathClip,
  IDLE
} from "./soldier-animation.ts"
import { createSoldierCrowd, type SoldierCrowd, type SoldierCrowdOptions } from "./soldier-crowd.ts"
import type { SoldierKit } from "./soldier-kit.ts"

const map = generateRollingTerrain({
  name: "test",
  widthMeters: 120,
  depthMeters: 80,
  cellSize: 0.5,
  seed: 3,
  amplitude: 8
})

/** Who sees over a parapet, when a test says; otherwise the simulation decides. */
const parapet = vi.hoisted(() => {
  const state: { over: ((soldier: number) => boolean) | null } = { over: null }
  return state
})
vi.mock("@verdun/sim", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verdun/sim")>()
  return {
    ...actual,
    seesOverParapet: (sim: Simulation, soldier: number) =>
      parapet.over?.(soldier) ?? actual.seesOverParapet(sim, soldier)
  }
})

const engines: NullEngine[] = []

afterEach(() => {
  parapet.over = null
  vi.restoreAllMocks()
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

/** How far the aiming clips turn a soldier to put his rifle ahead: the real ones, about 39 degrees. */
const AIM_TURN = 0.7

/** How far a turn on the spot turns a man, by its name: so many degrees, clockwise for a right turn. */
function spinOf(name: ClipName): number {
  const turn = /(\d+)_degree_(left|right)_turn$/.exec(name)
  return turn ? (Number(turn[1]) * Math.PI * (turn[2] === "right" ? 1 : -1)) / 180 : 0
}

/**
 * Every clip ten frames long at ten a second, one after another; the standing aim and the kneel turn their men, and
 * the turns on the spot turn them round as far as their names say.
 */
const CLIP_FRAMES = 10
const ALL_CLIPS: readonly ClipName[] = [...CLIPS, ...AIM_WALKS, ...CROUCH_AIM_WALKS]
const clips = new Map<ClipName, BakedClip>(
  ALL_CLIPS.map((name, index) => [
    name,
    {
      start: index * CLIP_FRAMES,
      frames: CLIP_FRAMES,
      fps: 10,
      turn: name === "rifle_standing_aiming_idle" || name === "rifle_kneeling_idle" ? AIM_TURN : 0,
      spin: spinOf(name)
    }
  ])
)
/** The clips a man stands at ease in, by who he is. */
const AT_EASE: ReadonlySet<ClipName | undefined> = new Set([
  IDLE,
  "two_hand_lowered_gun_rifle_idle",
  "rifle_idle_looking_around"
])

/** Every death carries the hips half a metre further along +x each frame; nothing else drifts. */
const drift = new Float32Array(ALL_CLIPS.length * CLIP_FRAMES * 2)
for (const [index, name] of ALL_CLIPS.entries()) {
  if (DEATHS.has(name)) {
    for (let frame = 0; frame < CLIP_FRAMES; frame++) {
      drift[(index * CLIP_FRAMES + frame) * 2] = frame * 0.5
    }
  }
}

function clipAt(row: number | undefined): ClipName | undefined {
  return row === undefined ? undefined : ALL_CLIPS[Math.floor(row / CLIP_FRAMES)]
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
  /** How many soldiers the mesh draws: its instances not collapsed to nothing. */
  drawn(mesh: Mesh): number
}

function harness(sim: Simulation, options: Omit<SoldierCrowdOptions, "clock"> = {}): Harness {
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
  // The instances drawn that stand for a soldier: a bucket's spare ones are collapsed to nothing.
  const live = (mesh: Mesh) => {
    const buffer = transforms.get(mesh) ?? new Float32Array(0)
    return Array.from({ length: mesh.thinInstanceCount }, (_, index) => index).filter((index) =>
      buffer.subarray(index * 16, index * 16 + 16).some((value) => value !== 0)
    )
  }
  let now = 0
  const crowd = createSoldierCrowd(scene, sim, kit, { ...options, clock: () => now })
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
      return live(mesh).map((index) => buffer?.[index * 4] ?? -1)
    },
    matrices(mesh) {
      const buffer = transforms.get(mesh) ?? new Float32Array(0)
      return live(mesh).map((index) => Matrix.FromArray(buffer, index * 16))
    },
    drawn(mesh) {
      return live(mesh).length
    }
  }
}

function step(sim: Simulation, steps: number): void {
  for (let index = 0; index < steps; index++) {
    stepSimulation(sim)
  }
}

describe("createSoldierCrowd", () => {
  it("draws as many instances as men, or whole buckets of them for snapshot rendering", () => {
    const sim = createSimulation({ map, seed: 1 })
    for (let index = 0; index < 3; index++) {
      spawnSoldier(sim, { side: Side.French, x: 10 + index * 4, z: 10 })
    }
    const { crowd, kit, drawn } = harness(sim)
    crowd.sync()
    crowd.update()

    const bodies = kit.bodies[Side.French]
    expect(drawn(bodies)).toBe(3)
    expect(bodies.thinInstanceCount).toBe(3)
    // Bucketed, a man fewer draws the same number of instances, one more of them collapsed.
    bucketInstanceCounts(true)
    crowd.update()
    expect(bodies.thinInstanceCount).toBe(32)
    sim.soldiers.health.value[0] = 0
    step(sim, 1)
    crowd.sync()
    crowd.update()
    expect(bodies.thinInstanceCount).toBe(32)
    bucketInstanceCounts(false)
  })

  it("sends as many men as it draws, or drew last frame, once it has set the count, and hides a layer with none", () => {
    const sim = createSimulation({ map, seed: 1 })
    const men = [10, 14, 18].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 10 }))
    const { crowd, kit, drawn } = harness(sim)
    const bodies = kit.bodies[Side.French]
    const layers = [bodies, kit.bodies[Side.German], kit.rifle, kit.mask, kit.guns[Side.French], kit.guns[Side.German]]
    const owners = new Map<Buffer, Mesh>()
    for (const mesh of layers) {
      for (const kind of ["world0", "bakedVertexAnimationSettingsInstanced"]) {
        const buffer = mesh.getVertexBuffer(kind)?.getWrapperBuffer()
        if (buffer) {
          owners.set(buffer, mesh)
        }
      }
    }
    // What went to the GPU, mesh by mesh: how many instances, and how many the mesh drew as they went.
    let sent: string[] = []
    const send = Buffer.prototype.updateDirectly
    vi.spyOn(Buffer.prototype, "updateDirectly").mockImplementation(function (this: Buffer, ...args) {
      const [, , count] = args
      const mesh = owners.get(this)
      sent.push(`${mesh?.name} ${count} of ${mesh?.thinInstanceCount}`)
      send.apply(this, args)
    })
    const frame = () => {
      sent = []
      crowd.sync()
      crowd.update()
      return sent
    }

    // Matrices and baked-animation settings, for the bodies and the rifles; nothing for the layers with no one in them.
    expect(frame()).toEqual(["french 3 of 3", "french 3 of 3", "rifle 3 of 3", "rifle 3 of 3"])
    expect(layers.map((mesh) => mesh.isVisible)).toEqual([true, false, true, false, false, false])
    // Two more come up: all five sent, not the three drawn last frame, which left the new two out for a frame.
    const more = [22, 26].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 10 }))
    expect(frame().slice(0, 2)).toEqual(["french 5 of 5", "french 5 of 5"])
    // Two go down a dugout: the two places they leave are sent collapsed, for a recorded frame that still draws them.
    for (const man of men.slice(0, 2)) {
      sim.soldiers.stance.value[man] = Stance.Sheltering
    }
    expect(frame().slice(0, 2)).toEqual(["french 5 of 3", "french 5 of 3"])
    expect(drawn(bodies)).toBe(3)
    expect(frame().slice(0, 2)).toEqual(["french 3 of 3", "french 3 of 3"])
    // And the rest: the last of them sent collapsed, then nothing.
    for (const man of [...men.slice(2), ...more]) {
      sim.soldiers.stance.value[man] = Stance.Sheltering
    }
    expect(frame()).toEqual(["french 3 of 0", "french 3 of 0", "rifle 3 of 0", "rifle 3 of 0"])
    expect(bodies.isVisible).toBe(false)
    expect(frame()).toEqual([])
  })

  it("draws each side's men standing on the ground, with rifles, and a machine gun before a still gunner", () => {
    const sim = createSimulation({ map, seed: 1 })
    spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    spawnSoldier(sim, { side: Side.French, x: 14, z: 10, weapon: Weapon.MachineGun })
    spawnSoldier(sim, { side: Side.German, x: 50, z: 70, facing: { x: 1, z: 0 } })
    const { crowd, kit, matrices, drawn } = harness(sim)
    crowd.sync()
    crowd.update()

    expect(drawn(kit.bodies[Side.French])).toBe(2)
    expect(drawn(kit.bodies[Side.German])).toBe(1)
    expect(drawn(kit.rifle)).toBe(2)
    expect(drawn(kit.guns[Side.French])).toBe(1)
    // The gun stands on the ground a metre ahead of its gunner, who faces north.
    expect(matrices(kit.guns[Side.French])[0]?.getTranslation().y).toBeCloseTo(heightAt(map, 14, 11), 4)
    expect(drawn(kit.guns[Side.German])).toBe(0)
    expect(drawn(kit.mask)).toBe(0)
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
    const { crowd, kit, drawn } = harness(sim)
    crowd.sync((soldier) => soldier === seen || soldier === prisoner)
    crowd.update()

    expect(drawn(kit.bodies[Side.German])).toBe(2)
    // The prisoner walks to the rear without his rifle.
    expect(drawn(kit.bodies[Side.French])).toBe(1)
    expect(drawn(kit.rifle)).toBe(2)
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
    expect(clipAt(rows(kit.bodies[Side.French])[0])).toBe("rifle_walk_forward")

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

  it("turns on the spot with a clip that turns him round, facing the way he began until it's done", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const { crowd, kit, tick, rows, matrices } = harness(sim)
    const heading = () => {
      const matrix = matrices(kit.bodies[Side.French])[0]
      const forward = matrix ? Vector3.TransformNormal(Vector3.Forward(), matrix) : Vector3.Zero()
      return Math.atan2(forward.x, forward.z)
    }
    crowd.sync()
    // A quarter turn to the right, to face east.
    sim.soldiers.facing.x[soldier] = 1
    sim.soldiers.facing.z[soldier] = 0
    crowd.sync()
    tick(0.5)
    crowd.update()
    expect(clipAt(rows(kit.bodies[Side.French])[0])).toBe("rifle_turn_90_degree_right_turn")
    expect(heading()).toBeCloseTo(0)
    // Done: facing east, at ease.
    tick(0.6)
    crowd.sync()
    crowd.update()
    expect(AT_EASE.has(clipAt(rows(kit.bodies[Side.French])[0]))).toBe(true)
    expect(heading()).toBeCloseTo(Math.PI / 2)
  })

  it("turns smoothly while he aims, keeping his sights on the man he follows", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const enemy = spawnSoldier(sim, { side: Side.German, x: 40, z: 10 })
    sim.soldiers.target.id[soldier] = enemy
    const { crowd, kit, tick, matrices } = harness(sim)
    crowd.sync()
    tick(0.05)
    crowd.update()
    const heading = () => {
      const matrix = matrices(kit.bodies[Side.French])[0]
      const forward = matrix ? Vector3.TransformNormal(Vector3.Forward(), matrix) : Vector3.Zero()
      return Math.atan2(forward.x, forward.z)
    }

    expect(heading()).toBeGreaterThan(0.1)
    expect(heading()).toBeLessThan(Math.PI / 2 + AIM_TURN - 0.1)
    tick(2)
    crowd.update()
    expect(heading()).toBeCloseTo(Math.PI / 2 + AIM_TURN, 2)
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
    expect(clipAt(rows(kit.bodies[Side.French])[0])).toBe("lying_down_prone_with_rifle")
  })

  it("recoils on firing, flinches when hit, throws, and pulls on a gas mask", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const { crowd, kit, tick, rows, drawn } = harness(sim)
    const clipNow = () => {
      crowd.update()
      return clipAt(rows(kit.bodies[Side.French])[0])
    }
    crowd.sync()
    expect(AT_EASE.has(clipNow())).toBe(true)

    sim.soldiers.weapon.firedAt[soldier] = sim.tick
    crowd.sync()
    expect(clipNow()).toBe("fire_bolt_standing")
    tick(1.1)
    crowd.sync()
    expect(AT_EASE.has(clipNow())).toBe(true)

    sim.soldiers.health.value[soldier] = 0.5
    crowd.sync()
    expect(clipNow()).toMatch(/^(hit_reaction_while_holding_a_rifle|left_reaction_to_front_hit_holding_a_rifle)$/)
    tick(1.1)

    sim.soldiers.grenades.count[soldier] -= 1
    sim.soldiers.mask.state[soldier] = MaskState.On
    crowd.sync()
    expect(clipNow()).toBe("throwing_something_holding_rifle_aimed")
    expect(drawn(kit.mask)).toBe(1)
  })

  it("culls soldiers outside the view, once a frame", () => {
    const sim = createSimulation({ map, seed: 1 })
    spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    spawnSoldier(sim, { side: Side.French, x: 100, z: 70 })
    const { crowd, kit, scene, drawn } = harness(sim)
    // Looking north-east from the middle: the man in the south-west corner is behind the camera.
    const camera = new FreeCamera("camera", new Vector3(60, 40, 40), scene)
    camera.setTarget(new Vector3(100, heightAt(map, 100, 70), 70))
    crowd.sync()
    scene.render()

    expect(drawn(kit.bodies[Side.French])).toBe(1)
    crowd.dispose()
    expect(scene.onBeforeCameraRenderObservable.hasObservers()).toBe(false)
  })

  it("measures how near the camera each layer's nearest man drawn comes, for the sun's shadows", () => {
    const sim = createSimulation({ map, seed: 1 })
    spawnSoldier(sim, { side: Side.French, x: 65, z: 45 })
    spawnSoldier(sim, { side: Side.French, x: 75, z: 60, weapon: Weapon.MachineGun })
    // Nearer the camera than either, but below its view, so not drawn.
    spawnSoldier(sim, { side: Side.French, x: 60, z: 15 })
    const { crowd, kit, scene, drawn } = harness(sim)
    const bodies = kit.bodies[Side.French]
    crowd.sync()
    // Before the first frame there's no view to measure by: the men drawn could be anywhere, and a layer drawing no one
    // is nowhere.
    crowd.update()
    expect(nearestDepth(bodies)).toBe(Number.NEGATIVE_INFINITY)
    expect(nearestDepth(kit.bodies[Side.German])).toBe(Number.POSITIVE_INFINITY)

    const camera = new FreeCamera("camera", new Vector3(60, 40, 20), scene)
    camera.setTarget(new Vector3(70, heightAt(map, 70, 50), 50))
    scene.render()

    // The near side of the sphere a man is culled by, 2.2 m round his chest, along the camera's view.
    const depth = (x: number, z: number) =>
      Vector3.TransformCoordinates(new Vector3(x, heightAt(map, x, z) + 0.9, z), camera.getViewMatrix()).z - 2.2
    expect(drawn(bodies)).toBe(2)
    expect(nearestDepth(bodies)).toBeCloseTo(Math.min(depth(65, 45), depth(75, 60)))
    expect(nearestDepth(kit.rifle)).toBeCloseTo(depth(65, 45))
    expect(nearestDepth(kit.guns[Side.French])).toBeCloseTo(depth(75, 60))
    expect(nearestDepth(kit.mask)).toBe(Number.POSITIVE_INFINITY)
  })

  it("turns an aiming man into his stance, rifle on target, but keeps a machine gun square to the front", () => {
    const sim = createSimulation({ map, seed: 1 })
    const rifleman = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const gunner = spawnSoldier(sim, { side: Side.French, x: 10, z: 30, weapon: Weapon.MachineGun })
    // His mark lies due north, the way he faces.
    sim.soldiers.target.id[rifleman] = gunner
    const { crowd, kit, tick, matrices } = harness(sim)
    crowd.sync()
    tick(2)
    crowd.update()
    const headingOf = (matrix: Matrix | undefined) => {
      const forward = matrix ? Vector3.TransformNormal(Vector3.Forward(), matrix) : Vector3.Zero()
      return Math.atan2(forward.x, forward.z)
    }

    // Both face north; their clips turn their bodies, and the rifle with them, clockwise.
    const [aiming, kneeling] = matrices(kit.bodies[Side.French])
    expect(headingOf(aiming)).toBeCloseTo(AIM_TURN)
    expect(headingOf(kneeling)).toBeCloseTo(AIM_TURN)
    expect(headingOf(matrices(kit.rifle)[0])).toBeCloseTo(AIM_TURN)
    expect(headingOf(matrices(kit.guns[Side.French])[0])).toBeCloseTo(0)
  })

  it("draws a man facing the enemy in his sights, not the way he walks, so he never fires over his shoulder", () => {
    const sim = createSimulation({ map, seed: 1 })
    const walker = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const enemy = spawnSoldier(sim, { side: Side.German, x: 10, z: -20 })
    // Facing north, the way he walks, with his mark due south behind him.
    sim.soldiers.target.id[walker] = enemy
    const { crowd, kit, tick, matrices } = harness(sim)
    crowd.sync()
    tick(3)
    crowd.update()
    const [drawn] = matrices(kit.bodies[Side.French])
    const forward = drawn ? Vector3.TransformNormal(Vector3.Forward(), drawn) : Vector3.Zero()

    // Turned round to the south, give or take his aiming clip's turn.
    expect(forward.z).toBeLessThan(-0.5)
  })

  it("runs on a run order through ground that holds him to a walking pace, but not on a flag an old order left", () => {
    const sim = createSimulation({ map, seed: 1 })
    const runner = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const walker = spawnSoldier(sim, { side: Side.French, x: 30, z: 10 })
    const { moveOrder, position } = sim.soldiers
    moveOrder.run[runner] = 1
    moveOrder.run[walker] = 1
    // The runner heads for his order's target; the walker heads away from an old one.
    moveOrder.z[runner] = 40
    moveOrder.x[runner] = 10
    moveOrder.z[walker] = 0
    moveOrder.x[walker] = 30
    const { crowd, kit, tick, rows } = harness(sim)
    crowd.sync()
    for (let step = 0; step < 5; step++) {
      position.z[runner] += 1.2 * STEP_SECONDS
      position.z[walker] += 1.2 * STEP_SECONDS
      sim.tick += 1
      tick(STEP_SECONDS)
      crowd.sync()
    }
    crowd.update()

    expect(rows(kit.bodies[Side.French]).map(clipAt)).toEqual(["rifle_run_forward", "rifle_walk_forward"])
  })

  it("crouches: squatting over the rifle when still, walking bent when he moves", () => {
    const sim = createSimulation({ map, seed: 1 })
    const still = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const moving = spawnSoldier(sim, { side: Side.French, x: 30, z: 10 })
    sim.soldiers.stance.value[still] = Stance.Crouching
    sim.soldiers.stance.value[moving] = Stance.Crouching
    const { crowd, kit, tick, rows } = harness(sim)
    crowd.sync()
    for (let step = 0; step < 5; step++) {
      sim.soldiers.position.z[moving] += 0.84 * STEP_SECONDS
      sim.tick += 1
      tick(STEP_SECONDS)
      crowd.sync()
    }
    crowd.update()

    expect(rows(kit.bodies[Side.French]).map(clipAt)).toEqual(["rifle_crouched_idle", "rifle_crouched_walk_forward"])
  })

  it("runs on the run key while he has the breath, and walks once he's spent", () => {
    const sim = createSimulation({ map, seed: 1 })
    const fresh = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const spent = spawnSoldier(sim, { side: Side.French, x: 30, z: 10 })
    const { steer, stamina, position } = sim.soldiers
    for (const soldier of [fresh, spent]) {
      steer.run[soldier] = 1
      steer.z[soldier] = 1
    }
    stamina.spent[spent] = 1
    const { crowd, kit, tick, rows } = harness(sim)
    crowd.sync()
    for (let step = 0; step < 5; step++) {
      // Through mud: no faster than a walk.
      position.z[fresh] += 1.2 * STEP_SECONDS
      position.z[spent] += 1.2 * STEP_SECONDS
      sim.tick += 1
      tick(STEP_SECONDS)
      crowd.sync()
    }
    crowd.update()

    expect(rows(kit.bodies[Side.French]).map(clipAt)).toEqual(["rifle_run_forward", "rifle_walk_forward"])
  })

  it("scrambles up a bank, slowly as he crosses the ground, and walks on at the top", () => {
    // Flat ground with a two-metre wall rising across it at 20 m north, a metre from foot to top.
    const walled = createFlatMap({ name: "wall", cellSize: 0.5, columns: 80, rows: 80 })
    for (let row = 0; row <= walled.rows; row++) {
      const z = row * walled.cellSize
      for (let column = 0; column <= walled.columns; column++) {
        walled.heights[sampleIndex(walled, column, row)] = Math.min(2, Math.max(0, (z - 19.5) * 2))
      }
    }
    const sim = createSimulation({ map: walled, seed: 1 })
    const climber = spawnSoldier(sim, { side: Side.French, x: 10, z: 19.6 })
    const { crowd, kit, tick, rows, matrices } = harness(sim)
    const clipNow = () => {
      crowd.update()
      return clipAt(rows(kit.bodies[Side.French])[0])
    }
    const stepNorth = (metres: number) => {
      sim.soldiers.position.z[climber] += metres
      sim.tick += 1
      tick(STEP_SECONDS)
      crowd.sync()
    }
    crowd.sync()
    // He faces east, looking along the wall, but turns to it as he climbs.
    sim.soldiers.facing.x[climber] = 1
    sim.soldiers.facing.z[climber] = 0
    for (let step = 0; step < 5; step++) {
      stepNorth(0.02)
    }
    tick(2)
    expect(clipNow()).toBe("climbing_up_a_slope")
    const [climbing] = matrices(kit.bodies[Side.French])
    const forward = climbing ? Vector3.TransformNormal(Vector3.Forward(), climbing) : Vector3.Zero()
    expect(forward.z).toBeCloseTo(1)
    // Over the top and walking on: a moment later he's walking.
    stepNorth(1.5)
    for (let step = 0; step < 8; step++) {
      stepNorth(0.07)
    }
    // Still looking east as he walks on north.
    expect(clipNow()).toBe("rifle_walk_left")
  })

  it("climbs over a fence the whole time he's on it, square across it, and walks on beyond", () => {
    // A belt of wire running east-west across a flat field at z = 40, and a length of its fence no tangle lies by.
    const belt: WireBelt = {
      points: [
        [0, 40],
        [100, 40]
      ]
    }
    const field = createFlatMap({ name: "field", cellSize: 0.5, columns: 200, rows: 160 }, 5, Surface.Grass)
    const sim = createSimulation({ map: { ...field, wire: [belt] }, seed: 1 })
    const { fences, tangles } = beltLayout(belt)
    const bare = fences.find((fence) => !tangles.some((tangle) => Math.abs(tangle.x - fence.x) < 4)) ?? fences[0]
    // One heads for the wire slantwise, 30 degrees east of north; the other stands in it by the fence, going nowhere.
    const climber = spawnSoldier(sim, { side: Side.French, x: bare?.x ?? 0, z: 38.6, facing: { x: 0.5, z: 0.866 } })
    spawnSoldier(sim, { side: Side.French, x: (bare?.x ?? 0) + 2, z: 40.1 })
    const { crowd, kit, tick, rows, matrices } = harness(sim)
    crowd.sync()
    enqueueCommand(sim, { type: "vault", soldier: climber })
    const climb = clips.get("climb_over")
    let climbing = 0
    let lastRow = 0
    let facing = Vector3.Zero()
    for (let index = 0; index < 8 / STEP_SECONDS; index++) {
      step(sim, 1)
      tick(STEP_SECONDS)
      crowd.sync()
      crowd.update()
      const [row, still] = rows(kit.bodies[Side.French])
      expect(AT_EASE.has(clipAt(still))).toBe(true)
      if (clipAt(row) === "climb_over") {
        climbing += STEP_SECONDS
        lastRow = row ?? 0
        const matrix = matrices(kit.bodies[Side.French])[0]
        facing = matrix ? Vector3.TransformNormal(Vector3.Forward(), matrix) : Vector3.Zero()
      }
    }

    // Slantwise he's longer on the fence than going straight over, and the climb is spread to match, ending on its
    // last frame as he steps off.
    expect(climbing).toBeGreaterThan((FENCE_CLIMB_SECONDS / 0.866) * 0.9)
    expect(climbing).toBeLessThan((FENCE_CLIMB_SECONDS / 0.866) * 1.1)
    expect(lastRow).toBeGreaterThanOrEqual((climb?.start ?? 0) + CLIP_FRAMES - 2)
    // Square across the fence, not along his slanting way.
    expect(facing.z).toBeCloseTo(1, 1)
    expect(sim.soldiers.position.z[climber]).toBeGreaterThan(41)
    expect(clipAt(rows(kit.bodies[Side.French])[0])).not.toBe("climb_over")
  })

  it("keeps watch with the rifle ready when standing with his head over the parapet", () => {
    const sim = createSimulation({ map, seed: 1 })
    const sentry = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    spawnSoldier(sim, { side: Side.French, x: 30, z: 10 })
    parapet.over = (soldier) => soldier === sentry
    const { crowd, kit, rows } = harness(sim)
    crowd.sync()
    crowd.update()

    const [watching, resting] = rows(kit.bodies[Side.French]).map(clipAt)
    expect(watching).toBe("rifle_standing_aiming_idle")
    expect(AT_EASE.has(resting)).toBe(true)
  })

  it("reads each soldier's weapon afresh", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const { crowd, kit, drawn } = harness(sim)
    crowd.sync()
    sim.soldiers.weapon.kind[soldier] = Weapon.MachineGun
    crowd.sync()
    crowd.update()

    expect(drawn(kit.rifle)).toBe(0)
    expect(drawn(kit.guns[Side.French])).toBe(1)
  })

  it("makes room for a larger crowd", () => {
    const sim = createSimulation({ map, seed: 1 })
    for (let index = 0; index < 100; index++) {
      spawnSoldier(sim, { side: Side.German, x: 5 + (index % 10) * 10, z: 5 + Math.floor(index / 10) * 7 })
    }
    const { crowd, kit, rows, drawn } = harness(sim)
    crowd.sync()
    crowd.update()

    expect(drawn(kit.bodies[Side.German])).toBe(100)
    expect(drawn(kit.rifle)).toBe(100)
    expect(rows(kit.bodies[Side.German]).every((row) => AT_EASE.has(clipAt(row)))).toBe(true)
  })

  it("draws the man the player aims with aiming, still and as he walks, enemy in his sights or not", () => {
    const sim = createSimulation({ map, seed: 1 })
    const aimer = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    spawnSoldier(sim, { side: Side.French, x: 30, z: 10 })
    const { crowd, kit, tick, rows } = harness(sim, { aimingSoldier: () => aimer })
    crowd.sync()
    crowd.update()
    expect(clipAt(rows(kit.bodies[Side.French])[0])).toBe("rifle_standing_aiming_idle")
    expect(AT_EASE.has(clipAt(rows(kit.bodies[Side.French])[1]))).toBe(true)

    // Stepping off to his right as he aims.
    for (let step = 0; step < 5; step++) {
      sim.soldiers.position.x[aimer] += 1.2 * STEP_SECONDS
      sim.tick += 1
      tick(STEP_SECONDS)
      crowd.sync()
    }
    crowd.update()
    expect(clipAt(rows(kit.bodies[Side.French])[0])).toBe("aim_walk_right")
  })

  it("reloads while the simulation has him reloading, and takes no reload for a shot", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const { crowd, kit, rows } = harness(sim)
    crowd.sync()
    sim.soldiers.weapon.reloading[soldier] = 1
    sim.soldiers.weapon.cooldown[soldier] = 6
    crowd.sync()
    crowd.update()
    expect(clipAt(rows(kit.bodies[Side.French])[0])).toBe("reloading_rifle_while_standing")
  })

  it("goes down to a crouch with a clip when still, and is crouched after it", () => {
    const sim = createSimulation({ map, seed: 1 })
    const soldier = spawnSoldier(sim, { side: Side.French, x: 10, z: 10 })
    const { crowd, kit, tick, rows } = harness(sim)
    const clipNow = () => {
      crowd.update()
      return clipAt(rows(kit.bodies[Side.French])[0])
    }
    crowd.sync()
    sim.soldiers.stance.value[soldier] = Stance.Crouching
    crowd.sync()
    expect(clipNow()).toBe("rifle_standing_to_kneeling")
    tick(1.1)
    crowd.sync()
    expect(clipNow()).toBe("rifle_crouched_idle")
  })
})
