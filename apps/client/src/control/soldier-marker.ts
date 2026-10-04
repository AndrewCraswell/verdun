import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import { isAlive, type Simulation, type Squad } from "@verdun/sim"

/** Length of the aim line in front of the controlled soldier, in metres. */
const AIM_LENGTH = 4

export interface SquadMarkers {
  /** Ring and aim line on the controlled soldier. */
  readonly leader: TransformNode
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
  const aim = CreateBox("squad-leader-aim", { width: 0.06, height: 0.06, depth: AIM_LENGTH }, scene)
  aim.material = bright
  aim.parent = leader
  aim.position.set(0, 0.05, AIM_LENGTH / 2 + 0.7)
  aim.isPickable = false

  const members = CreateTorus("squad-member-rings", { diameter: 1, thickness: 0.05, tessellation: 24 }, scene)
  members.material = dim
  members.isPickable = false
  members.alwaysSelectAsActiveMesh = true
  const matrices = new Float32Array(squad.members.length * 16)

  return {
    leader,
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
