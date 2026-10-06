import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { Constants } from "@babylonjs/core/Engines/constants"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { RenderingGroup } from "@babylonjs/core/Rendering/renderingGroup"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, type Scenery, Surface } from "@verdun/map"
import {
  createSimulation,
  createSquad,
  CRAWL_FACTOR,
  isAlive,
  isCutting,
  isVaulting,
  PLAYTEST_OPERATION,
  planOperation,
  shotEvents,
  Side,
  soldierEye,
  spawnSoldier,
  Stance,
  stepSimulation,
  Weapon
} from "@verdun/sim"
import { createLineOfSight } from "@verdun/sim/physics"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createCameraRig } from "./camera-rig.ts"
import {
  aimToward,
  createPlayerControl,
  type GroundVector,
  type PlayerAction,
  steerFromKeys
} from "./player-control.ts"
import { createSquadMarkers } from "./soldier-marker.ts"

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
  vi.unstubAllGlobals()
})

/** A squad of three in a row at z = 50, the first leading, on flat ground 3 m up. */
function setup(debugActions = false) {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const sim = createSimulation({
    map: createFlatMap({ name: "test", cellSize: 1, columns: 100, rows: 100 }, 3, Surface.Grass),
    seed: 1
  })
  const members = [50, 53, 56].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 50 }))
  const squad = createSquad(sim, Side.French, members, "player")
  const camera = new ArcRotateCamera("camera", LOOKING_NORTH, 0.6, 60, new Vector3(0, 0, 0), scene)
  const held = new Set<string>()
  const actions: PlayerAction[] = []
  let pointer: GroundVector | null = null
  let screen = { x: 400, y: 300 }
  const hidden = new Set<number>()
  const control = createPlayerControl(
    sim,
    squad,
    camera,
    { held, pointerGround: () => pointer, pointerScreen: () => screen, takeActions: () => actions.splice(0) },
    { debugActions, shown: (soldier) => !hidden.has(soldier) }
  )
  const frame = () => {
    control.update(0.05)
    stepSimulation(sim)
  }
  return {
    scene,
    sim,
    squad,
    members,
    soldier: members[0]!,
    camera,
    held,
    actions,
    control,
    frame,
    hidden,
    point: (value: GroundVector | null) => (pointer = value),
    pointAt: (value: { x: number; y: number }) => (screen = value)
  }
}

describe("createPlayerControl", () => {
  it("steers the soldier with held keys through simulation commands", () => {
    const { sim, soldier, held, control, frame } = setup()
    held.add("KeyW")
    for (let step = 0; step < 20; step++) {
      frame()
    }
    held.clear()
    frame()

    expect(control.soldier).toBe(soldier)
    expect(sim.soldiers.position.z[soldier]).toBeCloseTo(51.4)
    expect(sim.pendingCommands).toHaveLength(0)
  })

  it("runs while Shift is held, getting up off his knees to do it, and crouches on C", () => {
    const { sim, soldier, held, actions, control, frame } = setup()
    actions.push({ kind: "toggle-crouch" })
    frame()
    expect(sim.soldiers.stance.value[soldier]).toBe(Stance.Crouching)

    held.add("KeyW")
    held.add("ShiftLeft")
    control.update(0.05)
    expect(sim.pendingCommands).toContainEqual({ type: "stance", soldier, stance: "standing" })
    expect(sim.pendingCommands).toContainEqual({ type: "steer", soldier, x: expect.closeTo(0), z: 1, run: true })
    stepSimulation(sim)

    held.delete("ShiftLeft")
    control.update(0.05)
    expect(sim.pendingCommands).toContainEqual({ type: "steer", soldier, x: expect.closeTo(0), z: 1, run: false })
    expect(sim.soldiers.stance.value[soldier]).toBe(Stance.Standing)
    actions.push({ kind: "toggle-crouch" })
    frame()
    expect(sim.soldiers.stance.value[soldier]).toBe(Stance.Crouching)
    actions.push({ kind: "toggle-crouch" })
    frame()
    expect(sim.soldiers.stance.value[soldier]).toBe(Stance.Standing)
  })

  it("keeps WASD's bearing while the keys stay held, however the camera turns, and takes it afresh when they change", () => {
    const { sim, soldier, camera, held, control } = setup()
    const steers = () => sim.pendingCommands.splice(0).filter((command) => command.type === "steer")
    held.add("KeyW")
    control.update(0.05)
    expect(steers()).toEqual([{ type: "steer", soldier, x: expect.closeTo(0), z: 1, run: false }])

    // Turned to look east mid-stride: he keeps walking north.
    camera.alpha = Math.PI
    control.update(0.05)
    expect(steers()).toEqual([])

    // Another key down: the keys are read against the camera as it is now, W east and D south.
    held.add("KeyD")
    control.update(0.05)
    const [diagonal] = steers()
    expect(diagonal).toMatchObject({ x: expect.closeTo(Math.SQRT1_2), z: expect.closeTo(-Math.SQRT1_2) })

    held.clear()
    control.update(0.05)
    camera.alpha = LOOKING_NORTH
    held.add("KeyD")
    control.update(0.05)
    expect(steers().at(-1)).toMatchObject({ x: expect.closeTo(1), z: expect.closeTo(0) })
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

  it("in the aim view faces along the aim and walks by it, and holds that aim once out until the pointer moves", () => {
    // The rig listens on the window, which Node hasn't got.
    vi.stubGlobal("window", new EventTarget())
    const { scene, sim, soldier, camera, held, control, point, pointAt } = setup()
    const rig = createCameraRig(camera, scene, sim.map)
    const faces = () => sim.pendingCommands.filter((command) => command.type === "face")
    point({ x: 60, z: 50 })
    control.update(0.05)
    expect(control.facing).toEqual({ x: 1, z: 0 })

    // Into the aim view, looking east the way he faces; a quarter turn left with the mouse, to the north.
    rig.model.holdAim(true)
    expect(rig.aiming).toBe(true)
    rig.model.turnAim(-Math.PI / 2, 0)
    held.add("KeyW")
    held.add("ShiftLeft")
    sim.pendingCommands.length = 0
    control.update(0.05)
    expect(faces()).toEqual([{ type: "face", soldier, x: expect.closeTo(0), z: expect.closeTo(1) }])
    expect(sim.pendingCommands).toContainEqual({ type: "steer", soldier, x: expect.closeTo(0), z: 1, run: false })

    // Out of it, with the pointer still where it was: he keeps his aim, and keeps walking north.
    rig.model.holdAim(false)
    held.delete("ShiftLeft")
    sim.pendingCommands.length = 0
    control.update(0.05)
    control.update(0.05)
    expect(faces()).toEqual([])
    expect(control.facing).toMatchObject({ x: expect.closeTo(0), z: expect.closeTo(1) })
    pointAt({ x: 420, y: 300 })
    control.update(0.05)
    expect(faces()).toEqual([{ type: "face", soldier, x: 1, z: 0 }])
    rig.dispose()
  })

  it("picks out the enemy the pointer is near on the screen, faces him exactly and names him, and keeps him", () => {
    const { sim, soldier, camera, control, hidden, point, pointAt } = setup()
    // Looking north over the squad, from 30 m back.
    camera.setTarget(new Vector3(50, 4, 62))
    camera.radius = 30
    camera.beta = 0.9
    const near = spawnSoldier(sim, { side: Side.German, x: 54, z: 75 })
    const beside = spawnSoldier(sim, { side: Side.German, x: 49, z: 75 })
    /** Where a man's chest is on the screen. */
    const onScreen = (id: number) => {
      const eye = soldierEye(sim, id)
      const engine = camera.getEngine()
      const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight())
      const transform = camera.getViewMatrix().multiply(camera.getProjectionMatrix())
      return Vector3.Project(new Vector3(eye.x, eye.y - 0.3, eye.z), Matrix.Identity(), transform, viewport)
    }
    const faces = () => sim.pendingCommands.splice(0).filter((command) => command.type === "face")
    // The ground under the pointer is well past him: the man, not the ground, is aimed at.
    point({ x: 60, z: 95 })
    const chest = onScreen(near)
    pointAt({ x: chest.x + 12, y: chest.y + 6 })
    control.update(0.05)
    const length = Math.hypot(4, 25)
    expect(faces()).toEqual([
      { type: "face", soldier, x: expect.closeTo(4 / length), z: expect.closeTo(25 / length), target: near }
    ])
    expect(control.aimedSoldier).toBe(near)

    // Toward the man beside him, but not clearly nearer him: still the first.
    const other = onScreen(beside)
    pointAt({ x: (chest.x + other.x) / 2 - 3, y: chest.y })
    control.update(0.05)
    expect(control.aimedSoldier).toBe(near)
    pointAt({ x: other.x + 2, y: other.y })
    control.update(0.05)
    expect(control.aimedSoldier).toBe(beside)
    expect(faces().at(-1)).toMatchObject({ target: beside })

    // A man the fog hides can't be picked out: the other is still near enough.
    hidden.add(beside)
    control.update(0.05)
    expect(control.aimedSoldier).toBe(near)
    // With nobody to see near the pointer, he faces the ground under it again.
    hidden.add(near)
    faces()
    control.update(0.05)
    expect(control.aimedSoldier).toBe(-1)
    const [free] = faces()
    expect(free).not.toHaveProperty("target")
    expect(free).toMatchObject({
      x: expect.closeTo(10 / Math.hypot(10, 45)),
      z: expect.closeTo(45 / Math.hypot(10, 45))
    })
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

  it("switches to the next soldier, or to a squad slot, and steers whoever is in control", () => {
    const { sim, squad, members, actions, held, frame } = setup()
    actions.push({ kind: "switch-next" })
    frame()
    expect(squad.leader).toBe(members[1])

    actions.push({ kind: "switch-slot", slot: 2 })
    frame()
    expect(squad.leader).toBe(members[2])

    held.add("KeyD")
    for (let step = 0; step < 20; step++) {
      frame()
    }
    // Waiting with the squad, they had lain down; taking control of them doesn't stand them up, so they crawl.
    expect(sim.soldiers.stance.value[members[2]!]).toBe(Stance.Prone)
    expect(sim.soldiers.position.x[members[2]!]).toBeCloseTo(56 + 1.4 * CRAWL_FACTOR)
    expect(sim.soldiers.position.x[members[1]!]).toBe(53)
  })

  it("ignores switches to empty slots or the soldier already in control", () => {
    const { sim, squad, members, actions, control } = setup()
    actions.push({ kind: "switch-slot", slot: 7 }, { kind: "switch-slot", slot: 0 })
    control.update(0.05)

    expect(sim.pendingCommands).toHaveLength(0)
    expect(squad.leader).toBe(members[0])
  })

  it("gives the squad follow, hold and advance orders", () => {
    const { squad, actions, frame } = setup()
    actions.push({ kind: "order-follow" })
    frame()
    expect(squad.order).toEqual({ kind: "follow" })

    actions.push({ kind: "order-advance", x: 20, z: 80 })
    frame()
    expect(squad.order).toEqual({ kind: "advance", x: 20, z: 80 })

    actions.push({ kind: "order-hold" })
    frame()
    expect(squad.order).toEqual({ kind: "hold" })
  })

  it("fires the controlled soldier's weapon, and calls the whistle", () => {
    const whistles: number[] = []
    const engine = new NullEngine()
    engines.push(engine)
    const sim = createSimulation({ map: createFlatMap({ name: "m", cellSize: 1, columns: 100, rows: 400 }), seed: 1 })
    // Still air: a gas shoot's drift then reaches nobody, so it goes without asking twice.
    sim.wind.x = 0
    sim.wind.z = 0
    const leader = spawnSoldier(sim, { side: Side.French, x: 50, z: 50 })
    const squad = createSquad(sim, Side.French, [leader], "player")
    const camera = new ArcRotateCamera("camera", LOOKING_NORTH, 0.6, 60, new Vector3(0, 0, 0), new Scene(engine))
    const actions: PlayerAction[] = [
      { kind: "fire" },
      { kind: "whistle" },
      { kind: "bombard" },
      { kind: "call-fire", x: 1, z: 2 },
      { kind: "call-gas", x: 3, z: 300 },
      { kind: "toggle-fog" },
      { kind: "toggle-prone" },
      { kind: "grenade", x: 50, z: 70 }
    ]
    const control = createPlayerControl(
      sim,
      squad,
      camera,
      { held: new Set(), pointerGround: () => null, takeActions: () => actions.splice(0) },
      {
        commands: {
          whistle: () => whistles.push(sim.tick),
          bombard: () => whistles.push(-1),
          callFire: () => whistles.push(-2),
          callGas: () => whistles.push(-4)
        },
        toggleFog: () => whistles.push(-3)
      }
    )
    control.update(0.05)

    expect(sim.pendingCommands).toContainEqual({ type: "fire", soldier: leader })
    expect(sim.pendingCommands).toContainEqual({ type: "stance", soldier: leader, stance: "prone" })
    expect(sim.pendingCommands).toContainEqual({ type: "throw-grenade", soldier: leader, x: 50, z: 70 })
    expect(whistles).toEqual([0, -1, -2, -4, -3])
    stepSimulation(sim)
    expect(shotEvents(sim.events).filter((event) => event.shooter === leader)).toHaveLength(1)
  })

  it("leaves the whistle and the bombardment to an operation's plan until it's over", () => {
    const calls: string[] = []
    const engine = new NullEngine()
    engines.push(engine)
    const sim = createSimulation({ map: createFlatMap({ name: "m", cellSize: 1, columns: 100, rows: 100 }), seed: 1 })
    const squad = createSquad(sim, Side.French, [spawnSoldier(sim, { side: Side.French, x: 50, z: 50 })], "player")
    const camera = new ArcRotateCamera("camera", LOOKING_NORTH, 0.6, 60, new Vector3(0, 0, 0), new Scene(engine))
    const actions: PlayerAction[] = []
    const control = createPlayerControl(
      sim,
      squad,
      camera,
      { held: new Set(), pointerGround: () => null, takeActions: () => actions.splice(0) },
      {
        commands: {
          whistle: () => calls.push("whistle"),
          bombard: () => calls.push("bombard"),
          callFire: () => calls.push("fire"),
          callGas: () => calls.push("gas")
        }
      }
    )
    const operation = planOperation(sim, PLAYTEST_OPERATION)
    actions.push({ kind: "whistle" }, { kind: "bombard" }, { kind: "call-fire", x: 1, z: 2 })
    control.update(0.05)
    expect(calls).toEqual(["fire"])
    operation.result = "repulsed"
    actions.push({ kind: "whistle" }, { kind: "bombard" })
    control.update(0.05)
    expect(calls).toEqual(["fire", "whistle", "bombard"])
  })

  it("calls fire onto our own men only when called twice", () => {
    const calls: string[] = []
    const engine = new NullEngine()
    engines.push(engine)
    const sim = createSimulation({ map: createFlatMap({ name: "m", cellSize: 1, columns: 100, rows: 400 }), seed: 1 })
    const squad = createSquad(sim, Side.French, [spawnSoldier(sim, { side: Side.French, x: 50, z: 50 })], "player")
    const camera = new ArcRotateCamera("camera", LOOKING_NORTH, 0.6, 60, new Vector3(0, 0, 0), new Scene(engine))
    const actions: PlayerAction[] = []
    const control = createPlayerControl(
      sim,
      squad,
      camera,
      { held: new Set(), pointerGround: () => null, takeActions: () => actions.splice(0) },
      {
        commands: {
          whistle: () => calls.push("whistle"),
          bombard: () => calls.push("bombard"),
          callFire: (x) => calls.push(`fire ${x}`),
          callGas: (x) => calls.push(`gas ${x}`)
        }
      }
    )
    // On his own head: held back the first time, called the second.
    actions.push({ kind: "call-fire", x: 50, z: 50 })
    control.update(0.05)
    expect(calls).toEqual([])
    actions.push({ kind: "call-fire", x: 50, z: 50 })
    control.update(0.05)
    expect(calls).toEqual(["fire 50"])
    // Well clear of him, beyond its shells' spread and the gas's drift: at once.
    actions.push({ kind: "call-gas", x: 10, z: 300 })
    control.update(0.05)
    expect(calls).toEqual(["fire 50", "gas 10"])
  })

  it("passes control on when the controlled soldier dies, and kills only in dev builds", () => {
    const released = setup(false)
    released.actions.push({ kind: "debug-kill" })
    released.frame()
    expect(isAlive(released.sim, released.soldier)).toBe(true)

    const { sim, members, actions, control, frame } = setup(true)
    actions.push({ kind: "debug-kill" })
    frame()
    expect(isAlive(sim, members[0]!)).toBe(false)
    expect(control.soldier).toBe(members[1])
  })

  it("takes over the nearest bot squad once the whole squad has fallen", () => {
    const { sim, squad, members, actions, control, frame } = setup()
    const bots = createSquad(
      sim,
      Side.French,
      [70, 73, 76, 79].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 50 }))
    )
    actions.push({ kind: "take-over" })
    frame()
    expect(squad.members).toEqual(members)

    for (const member of members) {
      sim.pendingCommands.push({ type: "kill", soldier: member })
    }
    stepSimulation(sim)
    const theirs = [...bots.members]
    actions.push({ kind: "take-over" })
    frame()
    frame()
    expect(squad.members).toEqual(theirs)
    expect(control.soldier).toBe(theirs[0])
  })

  it("takes over the squad the player picks from those that can be handed over", () => {
    const { sim, squad, members, actions, frame } = setup()
    const near = createSquad(
      sim,
      Side.French,
      [62, 65, 68, 71].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 50 }))
    )
    const far = createSquad(
      sim,
      Side.French,
      [80, 83, 86, 89].map((x) => spawnSoldier(sim, { side: Side.French, x, z: 50 }))
    )
    for (const member of members) {
      sim.pendingCommands.push({ type: "kill", soldier: member })
    }
    stepSimulation(sim)
    const chosen = [...far.members]
    actions.push({ kind: "take-over", squad: far.id })
    frame()
    frame()
    expect(squad.members).toEqual(chosen)
    expect(near.members).toHaveLength(4)
  })

  it("does nothing once the whole squad has fallen", () => {
    const { sim, members, held, control } = setup()
    for (const member of members) {
      sim.pendingCommands.push({ type: "kill", soldier: member })
    }
    stepSimulation(sim)
    held.add("KeyW")
    control.update(0.05)

    expect(control.soldier).toBe(-1)
    expect(sim.pendingCommands).toHaveLength(0)
  })
})

describe("createSquadMarkers", () => {
  it("marks the controlled soldier, turned to their facing, and rings the rest of the living squad", () => {
    const { scene, sim, squad, members, soldier } = setup()
    const markers = createSquadMarkers(scene, sim, squad)
    sim.soldiers.facing.x[soldier] = 1
    sim.soldiers.facing.z[soldier] = 0
    sim.pendingCommands.push({ type: "kill", soldier: members[2]! })
    stepSimulation(sim)
    markers.update()

    expect(markers.leader.position.x).toBe(50)
    expect(markers.leader.position.y).toBeCloseTo(3.05)
    expect(markers.leader.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(markers.memberRings.matrices()).toHaveLength(1)
  })

  it("hides the leader marker once the squad is gone", () => {
    const { scene, sim, squad, members } = setup()
    const markers = createSquadMarkers(scene, sim, squad)
    for (const member of members) {
      sim.pendingCommands.push({ type: "kill", soldier: member })
    }
    stepSimulation(sim)
    markers.update()

    expect(markers.leader.isEnabled()).toBe(false)
    expect(markers.memberRings.matrices()).toHaveLength(0)
    expect(markers.members.thinInstanceCount).toBe(0)
  })

  it("rings the enemy a shot would strike and runs the aim line out to him", async () => {
    const { scene, sim, squad, soldier } = setup()
    const lineOfSight = await createLineOfSight(sim.map)
    sim.lineOfSight = lineOfSight
    const markers = createSquadMarkers(scene, sim, squad)
    const enemy = spawnSoldier(sim, { side: Side.German, x: 50, z: 80 })
    sim.soldiers.facing.x[soldier] = 1
    sim.soldiers.facing.z[soldier] = 0
    markers.update()
    expect(markers.aiming).toBe(-1)
    expect(markers.target.scaling.x).toBe(0)

    sim.soldiers.facing.x[soldier] = 0
    sim.soldiers.facing.z[soldier] = 1
    markers.update()
    expect(markers.aiming).toBe(enemy)
    expect(markers.target.scaling.x).toBeGreaterThan(0)
    expect(markers.target.position.x).toBe(sim.soldiers.position.x[enemy])
    expect(markers.target.position.z).toBe(sim.soldiers.position.z[enemy])
    const line = markers.leader.getChildMeshes().find((mesh) => mesh.name === "squad-leader-aim")
    expect(line?.scaling.z).toBeGreaterThan(25)
    lineOfSight.dispose()
  })

  it("draws the aim from the way the page turned him, before the simulation hears of it", async () => {
    const { scene, sim, squad, soldier } = setup()
    const lineOfSight = await createLineOfSight(sim.map)
    sim.lineOfSight = lineOfSight
    const page: { facing: GroundVector | null; aimedSoldier: number } = { facing: null, aimedSoldier: -1 }
    const markers = createSquadMarkers(scene, sim, squad, page)
    const enemy = spawnSoldier(sim, { side: Side.German, x: 50, z: 80 })
    // The simulation still has him facing east; the page has just turned him north, onto the enemy.
    sim.soldiers.facing.x[soldier] = 1
    sim.soldiers.facing.z[soldier] = 0
    markers.update()
    expect(markers.leader.rotation.y).toBeCloseTo(Math.PI / 2)
    expect(markers.aiming).toBe(-1)

    page.facing = { x: 0, z: 1 }
    page.aimedSoldier = enemy
    markers.update()
    expect(markers.leader.rotation.y).toBeCloseTo(0)
    expect(markers.aiming).toBe(enemy)
    expect(markers.target.position.z).toBe(80)
    // The simulation's own aim is left as it was.
    expect(sim.soldiers.facing.x[soldier]).toBe(1)
    expect(sim.soldiers.target.id[soldier]).toBe(-1)
    lineOfSight.dispose()
  })

  it("draws over the battlefield without clearing its depth, the aim line across the other rings", () => {
    const { scene, sim, squad } = setup()
    const markers = createSquadMarkers(scene, sim, squad)
    const marks = [markers.target, ...markers.leader.getChildMeshes(), markers.members]

    for (const mark of marks) {
      expect(mark.renderingGroupId).toBe(1)
      expect(mark.material?.depthFunction).toBe(Constants.ALWAYS)
      expect(mark.material?.disableDepthWrite).toBe(true)
    }
    // A depth clear partway through the frame would split WebGPU's multisampled pass in two.
    expect(scene.getAutoClearDepthStencilSetup(1).autoClear).toBe(false)
    // Without depth, the last drawn shows on top: the group draws in Babylon's painter's order.
    const drawn = marks
      .flatMap((mark) => mark.subMeshes)
      .sort(RenderingGroup.PainterSortCompare)
      .map((subMesh) => subMesh.getMesh().name)
    expect(drawn.indexOf("squad-member-rings")).toBeLessThan(drawn.indexOf("squad-leader-aim"))
    expect(drawn.at(-1)).toBe("aimed-target-ring")
  })
})

describe("the action key and the trigger", () => {
  /** The player's leader beside a comrade's machine gun, both of a squad facing a field. */
  function atTheGun(scenery: readonly Scenery[] = []) {
    const engine = new NullEngine()
    engines.push(engine)
    const scene = new Scene(engine)
    const sim = createSimulation({
      map: { ...createFlatMap({ name: "test", cellSize: 1, columns: 100, rows: 100 }, 3, Surface.Grass), scenery },
      seed: 1
    })
    const leader = spawnSoldier(sim, { side: Side.French, x: 50, z: 50 })
    const gunner = spawnSoldier(sim, { side: Side.French, x: 51.5, z: 50, weapon: Weapon.MachineGun })
    const squad = createSquad(sim, Side.French, [leader, gunner], "player")
    const camera = new ArcRotateCamera("camera", LOOKING_NORTH, 0.6, 60, new Vector3(0, 0, 0), scene)
    const actions: PlayerAction[] = []
    const input = {
      held: new Set<string>(),
      firing: false,
      pointerGround: () => null,
      takeActions: () => actions.splice(0)
    }
    const control = createPlayerControl(sim, squad, camera, input)
    const frame = () => {
      control.update(0.05)
      stepSimulation(sim)
    }
    return { sim, leader, gunner, actions, input, frame }
  }

  it("mans the gun beside him, fires it for as long as the trigger's held, and hands it back", () => {
    const { sim, leader, gunner, actions, input, frame } = atTheGun()
    actions.push({ kind: "act" })
    frame()
    expect(sim.soldiers.weapon.kind[leader]).toBe(Weapon.MachineGun)
    expect(sim.soldiers.weapon.kind[gunner]).toBe(Weapon.Rifle)

    input.firing = true
    let shots = 0
    for (let step = 0; step < 20; step++) {
      frame()
      shots += shotEvents(sim.events).length
    }
    input.firing = false
    // A second at 0.1 s a round, by the trigger alone: no clicks after the first.
    expect(shots).toBeGreaterThan(5)

    actions.push({ kind: "act" })
    frame()
    expect(sim.soldiers.weapon.kind[leader]).toBe(Weapon.Rifle)
    expect(sim.soldiers.weapon.kind[gunner]).toBe(Weapon.MachineGun)
  })

  it("climbs instead where there's no gun to man", () => {
    const { sim, leader, gunner, actions, frame } = atTheGun()
    sim.soldiers.position.x[gunner] = 80
    actions.push({ kind: "act" })
    frame()
    // No wire ahead on this field, so there's nothing to climb either: he stays a rifleman where he is.
    expect(sim.soldiers.weapon.kind[leader]).toBe(Weapon.Rifle)
    expect(sim.soldiers.position.x[leader]).toBeCloseTo(50)
  })

  it("climbs the fence he's walked up to, the way the view looks, whichever way he's aiming", () => {
    // A wooden fence across his way north, its rails running east-west.
    const { sim, leader, gunner, actions, input, frame } = atTheGun([
      { kind: "wooden-fence", x: 50, z: 47, heading: 0, variant: 0, scale: 1 }
    ])
    sim.soldiers.position.x[gunner] = 80
    sim.soldiers.position.z[leader] = 46
    input.held.add("KeyW")
    for (let step = 0; step < 20; step++) {
      frame()
    }
    input.held.delete("KeyW")
    frame()
    expect(sim.soldiers.position.z[leader]).toBeCloseTo(46.6, 1)
    // Stopped at the fence, the camera looking on over it, and aiming off to the east as the pointer may leave him.
    sim.soldiers.facing.x[leader] = 1
    sim.soldiers.facing.z[leader] = 0
    actions.push({ kind: "act" })
    frame()
    expect(isVaulting(sim, leader)).toBe(true)
  })

  it("cuts the wire ahead when crouched at it, and stops on the action key again", () => {
    const { sim, leader, gunner, actions, frame } = atTheGun()
    sim.soldiers.position.x[gunner] = 80
    sim.soldiers.position.z[leader] = 47.5
    sim.soldiers.facing.x[leader] = 0
    sim.soldiers.facing.z[leader] = 1
    for (let column = 40; column < 60; column++) {
      for (let row = 48; row < 52; row++) {
        sim.wire.density[row * sim.wire.columns + column] = 1
      }
    }
    sim.soldiers.stance.value[leader] = Stance.Crouching
    actions.push({ kind: "act" })
    frame()
    expect(isCutting(sim, leader)).toBe(true)
    actions.push({ kind: "act" })
    frame()
    expect(isCutting(sim, leader)).toBe(false)
  })
})
