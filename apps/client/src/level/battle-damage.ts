import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector"
import "@babylonjs/core/Meshes/instancedMesh"
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import type { ChangedArea } from "@verdun/map"
import { hashOf } from "./placement.ts"

/** What a shell does to each kind of kit piece. Pieces not listed (ruins, guns, bunkers, wrecks) shrug it off. */
const DESTROYED = [
  /^Prop_Wire_Fence/,
  /^Prop_Trench_Planks/,
  /^Prop_Ladder/,
  /^Prop_Barricade/,
  /^Prop_Iron_Sheet/,
  /^Prop_Crate/,
  /^Prop_Barrel/,
  /^Gen_Prop_/,
  /^Env_Trench_Firestep/,
  /^Env_Tree_Shards/,
  /^Env_Tree_Branch/,
  /^Env_Brick_Debris/,
  /^Env_Trench_Pole/,
  /^Env_Sandbag_Wall_Long/
]
const SHATTERED_TREE = /^(Env_Tree_Dead_04|Gen_Env_Tree_Dead_0\d)$/
const STUMPS = ["Env_Tree_Destroyed_01", "Env_Tree_Destroyed_02", "Env_Tree_Destroyed_03", "Env_Tree_Destroyed_04"]
const TRENCH_SECTION = /^Env_Trench_Deep_/
/** Earth blown into a trench, and the planks it brought down. */
const COLLAPSE = { mound: "Env_Trench_Mound_01", planks: "Prop_Trench_Planks_02" } as const
/** Kit trench pieces' origins stand this high above the trench floor (see trench-dressing.ts). */
const FLOOR_BELOW_ORIGIN = 1.4

const CELL_METERS = 8

/**
 * How far a shell's blast wrecks props, from the ground its crater changed: the crater's bowl, whose spoil lip reaches
 * half as far again (see stampCrater), plus a little more for flying earth and splinters.
 */
export function blastRadius(crater: ChangedArea): number {
  const bowl = (crater.maxX - crater.minX) / 2 / 1.5
  return bowl * 1.25
}

export interface BattleDamage {
  /**
   * A shell burst at (x, z) blowing a crater `radius` metres across: destroys light props within reach, shatters
   * standing trees and blows earth into trench sections. Returns how many pieces it changed.
   */
  blast(x: number, z: number, radius: number): number
}

interface Placed {
  readonly instance: InstancedMesh
  readonly position: Vector3
  collapsed: boolean
}

/** The position of an instance's frozen world matrix. */
function positionOf(instance: InstancedMesh): Vector3 {
  return instance.getWorldMatrix().getTranslation()
}

/**
 * Shell damage to the dressed battlefield. The simulation craters the ground itself; this keeps the props in step:
 * wire, duckboards and stores go, trees are shot down to stumps, and trench sections fill with blown-in earth.
 */
export function createBattleDamage(
  pieces: ReadonlyMap<string, Mesh>,
  instances: readonly InstancedMesh[]
): BattleDamage {
  const cells = new Map<string, Placed[]>()
  const cellKey = (column: number, row: number) => `${column},${row}`
  const add = (instance: InstancedMesh) => {
    const position = positionOf(instance)
    const key = cellKey(Math.floor(position.x / CELL_METERS), Math.floor(position.z / CELL_METERS))
    const placed: Placed = { instance, position, collapsed: false }
    cells.set(key, [...(cells.get(key) ?? []), placed])
  }
  instances.forEach(add)

  /** A new instance of a kit piece with a world matrix, its source made ready to draw instances. */
  function instantiate(piece: string, world: Matrix): InstancedMesh | null {
    const source = pieces.get(piece)
    if (!source) {
      return null
    }
    source.setEnabled(true)
    source.isVisible = false
    const instance = source.createInstance(`${piece}#damage`)
    instance.isPickable = false
    instance.freezeWorldMatrix(world)
    add(instance)
    return instance
  }

  function collapse(placed: Placed): void {
    placed.collapsed = true
    const world = placed.instance.getWorldMatrix()
    const rotation = new Quaternion()
    world.decompose(undefined, rotation)
    const floor = placed.position.subtract(new Vector3(0, FLOOR_BELOW_ORIGIN, 0))
    // A heap of earth filling most of the trench's width, and a broken plank thrown across it.
    instantiate(
      COLLAPSE.mound,
      Matrix.Compose(new Vector3(0.45, 0.9, 0.6), rotation, floor.add(new Vector3(0, -0.1, 0)))
    )
    const tilt = Quaternion.RotationYawPitchRoll(hashOf(floor.x, floor.z) * Math.PI, 0.25, 0.1)
    instantiate(
      COLLAPSE.planks,
      Matrix.Compose(Vector3.One(), rotation.multiply(tilt), floor.add(new Vector3(0, 0.5, 0)))
    )
  }

  /** Every placed piece within `radius` of (x, z). */
  function within(x: number, z: number, radius: number): Placed[] {
    const found: Placed[] = []
    const reach = Math.ceil(radius / CELL_METERS)
    const column = Math.floor(x / CELL_METERS)
    const row = Math.floor(z / CELL_METERS)
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        for (const placed of cells.get(cellKey(column + dx, row + dz)) ?? []) {
          if (Math.hypot(placed.position.x - x, placed.position.z - z) <= radius) {
            found.push(placed)
          }
        }
      }
    }
    return found
  }

  function remove(placed: Placed): void {
    const key = cellKey(Math.floor(placed.position.x / CELL_METERS), Math.floor(placed.position.z / CELL_METERS))
    cells.set(
      key,
      (cells.get(key) ?? []).filter((other) => other !== placed)
    )
    placed.instance.dispose()
  }

  return {
    blast(x, z, radius) {
      let changed = 0
      // Find everything first, so debris the blast throws down isn't itself caught by it.
      for (const placed of within(x, z, radius)) {
        const piece = placed.instance.sourceMesh.name
        if (DESTROYED.some((pattern) => pattern.test(piece))) {
          remove(placed)
          changed += 1
        } else if (SHATTERED_TREE.test(piece)) {
          remove(placed)
          const stump = STUMPS[Math.floor(hashOf(placed.position.x, placed.position.z) * STUMPS.length)] ?? STUMPS[0]
          instantiate(stump, Matrix.Translation(placed.position.x, placed.position.y, placed.position.z))
          changed += 1
        } else if (TRENCH_SECTION.test(piece) && !placed.collapsed) {
          collapse(placed)
          changed += 1
        }
      }
      return changed
    }
  }
}
