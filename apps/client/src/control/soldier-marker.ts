import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import { aimedTarget, type EntityId, isAlive, type Simulation, type Squad } from "@verdun/sim"
import { type InstanceBuffer, instanceBuffer } from "../effects/instance-buffer.ts"
import { keepsOffSoldiers } from "../render/marker-stencil.ts"
import { aimedTargetNow } from "./aimed-target.ts"

/**
 * The page's aim for the soldier under control (player-control.ts): the way it last turned him and the man it picked
 * out, ahead of the simulation's mirror, which hears of them from its worker a step or two later.
 */
export interface PageAim {
  readonly facing: { readonly x: number; readonly z: number } | null
  readonly aimedSoldier: EntityId
}

/** The page's facing is the mirror's while within about half a degree of it (the cosine). */
const SAME_FACING = 0.99996

/** Length of the aim line in front of the controlled soldier with no one in his sights, in metres. */
const AIM_LENGTH = 4
/** The aim line starts this far in front of the soldier, clear of his ring. */
const AIM_START = 0.7
/** The ring on the man in the sights keeps about this angular size on screen, in radians, however far off he is. */
const TARGET_RING_ANGLE = 0.03
const TARGET_RING_DIAMETER = 1.8
/** The aim line keeps at least this angular width on screen, in radians: a few pixels, at any zoom. */
const AIM_WIDTH_ANGLE = 0.0022
const AIM_WIDTH = 0.06
/**
 * The markers are drawn after the battlefield, over it: a man in a trench has its walls and parapet all round him, and
 * his ring and aim line drawn among them were mostly hidden. They keep off the soldiers themselves, by the stencil the
 * soldiers write (render/marker-stencil.ts): a ring goes round a man, not across him.
 */
const MARKER_GROUP = 1

export interface SquadMarkers {
  /** Ring and aim line on the controlled soldier. */
  readonly leader: TransformNode
  /** Ring on the enemy the controlled soldier's shot would strike, shrunk to nothing when there's no one in his sights. */
  readonly target: Mesh
  /** The enemy in the controlled soldier's sights, or -1. */
  readonly aiming: number
  /** The other squad members' rings, as drawn. */
  readonly memberRings: InstanceBuffer
  /** Small rings on the other living squad members, drawn as thin instances. */
  readonly members: Mesh
  /** Moves the markers to the squad. Call once per frame. */
  update(): void
}

function markerMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  material.emissiveColor = color
  material.disableLighting = true
  keepsOffSoldiers(material)
  return material
}

/**
 * Marks the player's squad: the soldier under control, where they aim, and who else is with them. Given the page's aim,
 * the facing ring, the aim line and the ring on the man in his sights follow it at once, rather than the simulation's.
 */
export function createSquadMarkers(scene: Scene, sim: Simulation, squad: Squad, page?: PageAim): SquadMarkers {
  const bright = markerMaterial(scene, "squad-leader-marker", new Color3(0.95, 0.85, 0.45))
  const dim = markerMaterial(scene, "squad-member-marker", new Color3(0.62, 0.58, 0.4))

  let aimingAt = -1

  /**
   * Whom his aimed shot would strike once the simulation has the page's aim: worked out against it, put in the mirror
   * for the moment it takes and then taken out again. While the two agree it's the mirror's own answer, worked out once
   * a step.
   */
  function strikes(soldier: EntityId): EntityId {
    const sent = page?.facing ?? null
    const { facing, target } = sim.soldiers
    const picked = page ? page.aimedSoldier : target.id[soldier]
    const was = { x: facing.x[soldier], z: facing.z[soldier], target: target.id[soldier] }
    if (!sent || (sent.x * was.x + sent.z * was.z > SAME_FACING && picked === was.target)) {
      return aimedTargetNow(sim, soldier)
    }
    facing.x[soldier] = sent.x
    facing.z[soldier] = sent.z
    target.id[soldier] = picked
    try {
      return aimedTarget(sim, soldier)
    } finally {
      facing.x[soldier] = was.x
      facing.z[soldier] = was.z
      target.id[soldier] = was.target
    }
  }

  const leader = new TransformNode("squad-leader-marker", scene)
  const ring = CreateTorus("squad-leader-ring", { diameter: 1.4, thickness: 0.08, tessellation: 32 }, scene)
  ring.material = bright
  ring.parent = leader
  ring.isPickable = false
  const aim = CreateBox("squad-leader-aim", { width: AIM_WIDTH, height: AIM_WIDTH, depth: 1 }, scene)
  aim.material = bright
  aim.parent = leader
  aim.isPickable = false

  const sights = markerMaterial(scene, "aimed-target-marker", new Color3(0.95, 0.3, 0.2))
  const target = CreateTorus(
    "aimed-target-ring",
    { diameter: TARGET_RING_DIAMETER, thickness: 0.12, tessellation: 32 },
    scene
  )
  target.material = sights
  target.isPickable = false
  // Shown and hidden by its size, not switched on and off, so a recorded frame (snapshot rendering) still holds.
  target.scaling.setAll(0)

  const members = CreateTorus("squad-member-rings", { diameter: 1, thickness: 0.05, tessellation: 24 }, scene)
  members.material = dim
  members.isPickable = false
  members.alwaysSelectAsActiveMesh = true
  const memberRings = instanceBuffer(members, squad.members.length)
  for (const marker of [ring, aim, target, members]) {
    marker.renderingGroupId = MARKER_GROUP
  }
  // Over the battlefield: its depth is cleared for the markers, but not the stencil the soldiers wrote.
  scene.setRenderingAutoClearDepthStencil(MARKER_GROUP, true, true, false)

  return {
    leader,
    target,
    members,
    memberRings,
    get aiming() {
      return aimingAt
    },
    update() {
      const soldier = squad.leader
      leader.setEnabled(soldier >= 0)
      if (soldier >= 0) {
        const x = sim.soldiers.position.x[soldier]
        const z = sim.soldiers.position.z[soldier]
        leader.position.set(x, heightAt(sim.map, x, z) + 0.05, z)
        // Babylon's y rotation turns +z toward +x, so the angle is measured from north toward east.
        const facing = page?.facing ?? { x: sim.soldiers.facing.x[soldier], z: sim.soldiers.facing.z[soldier] }
        leader.rotation.y = Math.atan2(facing.x, facing.z)
      }
      // The sight picture: the line runs out to whoever a shot would strike now, and he's ringed.
      const aimed = soldier >= 0 ? strikes(soldier) : -1
      aimingAt = aimed
      let reach = AIM_LENGTH
      if (aimed >= 0) {
        const x = sim.soldiers.position.x[aimed]
        const z = sim.soldiers.position.z[aimed]
        target.position.set(x, heightAt(sim.map, x, z) + 0.08, z)
        const eye = scene.activeCamera?.globalPosition
        const away = eye ? Vector3.Distance(eye, target.position) : 0
        target.scaling.setAll(Math.max(1, (away * TARGET_RING_ANGLE) / TARGET_RING_DIAMETER))
        const dx = x - sim.soldiers.position.x[soldier]
        const dz = z - sim.soldiers.position.z[soldier]
        reach = Math.max(AIM_LENGTH, Math.sqrt(dx * dx + dz * dz) - AIM_START - 0.9)
      }
      if (aimed < 0) {
        target.scaling.setAll(0)
      }
      aim.scaling.z = reach
      const eye = scene.activeCamera?.globalPosition
      const thick = eye ? Math.max(1, (Vector3.Distance(eye, leader.position) * AIM_WIDTH_ANGLE) / AIM_WIDTH) : 1
      aim.scaling.x = thick
      aim.scaling.y = thick
      aim.position.set(0, 0.05, AIM_START + reach / 2)

      let count = 0
      for (const member of squad.members) {
        if (member === soldier || !isAlive(sim, member)) {
          continue
        }
        const x = sim.soldiers.position.x[member]
        const z = sim.soldiers.position.z[member]
        const offset = count * 16
        const matrices = memberRings.data
        matrices.fill(0, offset, offset + 16)
        matrices[offset] = 1
        matrices[offset + 5] = 1
        matrices[offset + 10] = 1
        matrices[offset + 12] = x
        matrices[offset + 13] = heightAt(sim.map, x, z) + 0.05
        matrices[offset + 14] = z
        matrices[offset + 15] = 1
        count += 1
      }
      memberRings.commit(count)
    }
  }
}
