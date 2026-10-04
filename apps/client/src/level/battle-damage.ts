import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { ChangedArea } from "@verdun/map"
import { hashOf } from "./placement.ts"
import type { PlacedPiece, SceneryBatches } from "./scenery-batches.ts"

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

/**
 * Shell damage to the dressed battlefield. The simulation craters the ground itself; this keeps the props in step:
 * wire, duckboards and stores go, trees are shot down to stumps, and trench sections fill with blown-in earth.
 */
export function createBattleDamage(scenery: SceneryBatches): BattleDamage {
  /** Trench sections already filled with earth: a shell blows each one in once. */
  const collapsed = new WeakSet<PlacedPiece>()

  function collapse(placed: PlacedPiece): void {
    collapsed.add(placed)
    const rotation = new Quaternion()
    placed.world.decompose(undefined, rotation)
    const floor = placed.position.subtract(new Vector3(0, FLOOR_BELOW_ORIGIN, 0))
    // A heap of earth filling most of the trench's width, and a broken plank thrown across it.
    scenery.add(
      COLLAPSE.mound,
      Matrix.Compose(new Vector3(0.45, 0.9, 0.6), rotation, floor.add(new Vector3(0, -0.1, 0)))
    )
    const tilt = Quaternion.RotationYawPitchRoll(hashOf(floor.x, floor.z) * Math.PI, 0.25, 0.1)
    scenery.add(
      COLLAPSE.planks,
      Matrix.Compose(Vector3.One(), rotation.multiply(tilt), floor.add(new Vector3(0, 0.5, 0)))
    )
  }

  return {
    blast(x, z, radius) {
      let changed = 0
      // Find everything first, so debris the blast throws down isn't itself caught by it.
      for (const placed of scenery.near(x, z, radius)) {
        const { piece, position } = placed
        if (DESTROYED.some((pattern) => pattern.test(piece))) {
          scenery.remove(placed)
          changed += 1
        } else if (SHATTERED_TREE.test(piece)) {
          scenery.remove(placed)
          const stump = STUMPS[Math.floor(hashOf(position.x, position.z) * STUMPS.length)] ?? STUMPS[0]
          scenery.add(stump, Matrix.Translation(position.x, position.y, position.z))
          changed += 1
        } else if (TRENCH_SECTION.test(piece) && !collapsed.has(placed)) {
          collapse(placed)
          changed += 1
        }
      }
      return changed
    }
  }
}
