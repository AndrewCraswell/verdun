import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { CreateTorus } from "@babylonjs/core/Meshes/Builders/torusBuilder"
import { TransformNode } from "@babylonjs/core/Meshes/transformNode"
import type { Scene } from "@babylonjs/core/scene"
import { heightAt } from "@verdun/map"
import type { EntityId, Simulation } from "@verdun/sim"

/** Length of the aim line in front of the controlled soldier, in metres. */
const AIM_LENGTH = 4

export interface SoldierMarker {
  readonly root: TransformNode
  /** Moves the marker to the soldier and turns the aim line to their facing. Call once per frame. */
  update(): void
}

/** A ring at the controlled soldier's feet and a line showing where they aim. */
export function createSoldierMarker(scene: Scene, sim: Simulation, soldier: EntityId): SoldierMarker {
  const material = new StandardMaterial("player-marker", scene)
  material.emissiveColor = new Color3(0.95, 0.85, 0.45)
  material.disableLighting = true

  const root = new TransformNode("player-marker", scene)
  const ring = CreateTorus("player-ring", { diameter: 1.4, thickness: 0.08, tessellation: 32 }, scene)
  ring.material = material
  ring.parent = root
  ring.isPickable = false
  const aim = CreateBox("player-aim", { width: 0.06, height: 0.06, depth: AIM_LENGTH }, scene)
  aim.material = material
  aim.parent = root
  aim.position.set(0, 0.05, AIM_LENGTH / 2 + 0.7)
  aim.isPickable = false

  return {
    root,
    update() {
      const x = sim.soldiers.position.x[soldier]
      const z = sim.soldiers.position.z[soldier]
      root.position.set(x, heightAt(sim.map, x, z) + 0.05, z)
      // Babylon's y rotation turns +z toward +x, so the angle is measured from north toward east.
      root.rotation.y = Math.atan2(sim.soldiers.facing.x[soldier], sim.soldiers.facing.z[soldier])
    }
  }
}
