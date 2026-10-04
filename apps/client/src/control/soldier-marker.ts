import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import { aimedTarget, isAlive, type Simulation, type Squad } from "@verdun/sim"

/** Length of the aim line in front of the controlled soldier with no one in his sights, in metres. */
const AIM_LENGTH = 4
/** The aim line starts this far in front of the soldier, clear of his ring. */
const AIM_START = 0.7
/** The ring on the man in the sights keeps about this angular size on screen, in radians, however far off he is. */
const TARGET_RING_ANGLE = 0.03
const TARGET_RING_DIAMETER = 1.8

export interface SquadMarkers {
  /** Ring and aim line on the controlled soldier. */
  readonly leader: TransformNode
  /** Ring on the enemy the controlled soldier's shot would strike, hidden when there's no one in his sights. */
  readonly target: Mesh
  /** Small rings on the other living squad members, drawn as thin instances. */
  readonly members: Mesh
  /** Moves the markers to the squad. Call once per frame. */
  update(): void
}

function markerMaterial(scene: Scene, name: string, color: Color3): StandardMaterial {
  const material = new StandardMaterial(name, scene)
  material.emissiveColor = color
  material.disableLighting = true
  return material
}

/** Marks the player's squad: the soldier under control, where they aim, and who else is with them. */
export function createSquadMarkers(scene: Scene, sim: Simulation, squad: Squad): SquadMarkers {
  const bright = markerMaterial(scene, "squad-leader-marker", new Color3(0.95, 0.85, 0.45))
  const dim = markerMaterial(scene, "squad-member-marker", new Color3(0.62, 0.58, 0.4))

  const leader = new TransformNode("squad-leader-marker", scene)
  const ring = CreateTorus("squad-leader-ring", { diameter: 1.4, thickness: 0.08, tessellation: 32 }, scene)
  ring.material = bright
  ring.parent = leader
  ring.isPickable = false
  const aim = CreateBox("squad-leader-aim", { width: 0.06, height: 0.06, depth: 1 }, scene)
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
  target.setEnabled(false)

  const members = CreateTorus("squad-member-rings", { diameter: 1, thickness: 0.05, tessellation: 24 }, scene)
  members.material = dim
  members.isPickable = false
  members.alwaysSelectAsActiveMesh = true
  const matrices = new Float32Array(squad.members.length * 16)

  return {
    leader,
    target,
    members,
    update() {
      const soldier = squad.leader
      leader.setEnabled(soldier >= 0)
      if (soldier >= 0) {
        const x = sim.soldiers.position.x[soldier]
        const z = sim.soldiers.position.z[soldier]
        leader.position.set(x, heightAt(sim.map, x, z) + 0.05, z)
        // Babylon's y rotation turns +z toward +x, so the angle is measured from north toward east.
        leader.rotation.y = Math.atan2(sim.soldiers.facing.x[soldier], sim.soldiers.facing.z[soldier])
      }
      // The sight picture: the line runs out to whoever a shot would strike now, and he's ringed.
      const aimed = soldier >= 0 ? aimedTarget(sim, soldier) : -1
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
      target.setEnabled(aimed >= 0)
      aim.scaling.z = reach
      aim.position.set(0, 0.05, AIM_START + reach / 2)

      let count = 0
      for (const member of squad.members) {
        if (member === soldier || !isAlive(sim, member)) {
          continue
        }
        const x = sim.soldiers.position.x[member]
        const z = sim.soldiers.position.z[member]
        const offset = count * 16
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
      members.thinInstanceSetBuffer("matrix", matrices, 16, false)
      members.thinInstanceCount = count
    }
  }
}
