import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, Surface } from "@verdun/map"
import {
  createLineOfSight,
  createSimulation,
  createSquad,
  CRAWL_FACTOR,
  isAlive,
  shotEvents,
  Side,
  spawnSoldier,
  Stance,
  stepSimulation
} from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
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
  const control = createPlayerControl(
    sim,
    squad,
    camera,
    { held, pointerGround: () => pointer, takeActions: () => actions.splice(0) },
    { debugActions }
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
    point: (value: GroundVector | null) => (pointer = value)
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
    const sim = createSimulation({ map: createFlatMap({ name: "m", cellSize: 1, columns: 100, rows: 100 }), seed: 1 })
    const leader = spawnSoldier(sim, { side: Side.French, x: 50, z: 50 })
    const squad = createSquad(sim, Side.French, [leader], "player")
    const camera = new ArcRotateCamera("camera", LOOKING_NORTH, 0.6, 60, new Vector3(0, 0, 0), new Scene(engine))
    const actions: PlayerAction[] = [
      { kind: "fire" },
      { kind: "whistle" },
      { kind: "bombard" },
      { kind: "call-fire", x: 1, z: 2 },
      { kind: "call-gas", x: 3, z: 4 },
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
})
