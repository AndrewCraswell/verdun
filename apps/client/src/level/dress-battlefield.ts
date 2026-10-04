import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import type { Material } from "@babylonjs/core/Materials/material"
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector"
import "@babylonjs/core/Meshes/instancedMesh"
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, mapDepth, mapWidth } from "@verdun/map"
import type { BattleSoundFiles } from "../audio/battle-sounds.ts"
import { GroundSplatPlugin } from "../terrain/ground-splat-plugin.ts"
import type { TerrainChunks } from "../terrain/terrain-chunks.ts"
import { type Ambience, createAmbience } from "./ambience.ts"
import { type Atmosphere, createAtmosphere } from "./atmosphere.ts"
import { type BattleDamage, createBattleDamage } from "./battle-damage.ts"
import { type LevelKit, loadLevelKit } from "./level-kit.ts"
import type { Placement } from "./placement.ts"
import { createPostProcess, type PostProcess } from "./post-process.ts"
import { CENTRED_PIECES, layOutScenery } from "./scenery-dressing.ts"
import { createScorchMap } from "./scorch-map.ts"
import { createShellAftermath, type ShellAftermath } from "./shell-aftermath.ts"
import { layOutTrenchKit } from "./trench-dressing.ts"
import { createGasCurtain, createTrenchLife, type TrenchLife } from "./trench-life.ts"

export interface BattlefieldDressing {
  /** One instance of a kit piece per placement. */
  readonly instances: readonly InstancedMesh[]
  /** Pieces the layout asked for that the kit doesn't have. */
  readonly missing: ReadonlySet<string>
}

/** Instance matrix: scale along the piece's axes, turn about the vertical, tilt its up axis, then move into place. */
export function placementMatrix(placement: Placement, pivot?: Vector3): Matrix {
  const [sx, sy, sz] = placement.scale ?? [1, 1, 1]
  let transform = Matrix.Scaling(sx, sy, sz)
  if (pivot) {
    transform.setTranslationFromFloats(-pivot.x * sx, -pivot.y * sy, -pivot.z * sz)
  }
  transform = transform.multiply(Matrix.RotationY(placement.yaw))
  if (placement.up) {
    const [x, y, z] = placement.up
    const tilt = Quaternion.FromUnitVectorsToRef(Vector3.Up(), new Vector3(x, y, z), new Quaternion())
    transform = transform.multiply(Matrix.FromQuaternionToRef(tilt, new Matrix()))
  }
  return transform.multiply(Matrix.Translation(placement.x, placement.y, placement.z))
}

/**
 * Dresses the battlefield with the level kit: the trench kit along every trench, and the art for the map's scenery and
 * wire. Every placement becomes an instance of its kit piece with a frozen world matrix, so props are culled one by one
 * and drawn in one batch per piece.
 */
export function dressBattlefield(map: BattlefieldMap, kit: LevelKit): BattlefieldDressing {
  const placements = [...layOutTrenchKit(map), ...layOutScenery(map)]
  const missing = new Set<string>()

  // Pieces modelled with their origin at a corner are moved to turn and stand on their middle.
  const pivots = new Map<string, Vector3>()
  for (const piece of CENTRED_PIECES) {
    const mesh = kit.pieces.get(piece)
    if (mesh) {
      const { minimum, maximum } = mesh.getBoundingInfo().boundingBox
      pivots.set(piece, new Vector3((minimum.x + maximum.x) / 2, 0, (minimum.z + maximum.z) / 2))
    }
  }

  const instances: InstancedMesh[] = []
  const sources = new Set<Mesh>()
  for (const placement of placements) {
    const source = kit.pieces.get(placement.piece)
    if (!source) {
      missing.add(placement.piece)
      continue
    }
    sources.add(source)
    const instance = source.createInstance(`${placement.piece}#${instances.length}`)
    instance.isPickable = false
    instance.freezeWorldMatrix(placementMatrix(placement, pivots.get(placement.piece)))
    instances.push(instance)
  }
  // Instances draw through their source mesh, which stays enabled but never draws itself.
  for (const source of sources) {
    source.setEnabled(true)
    source.isVisible = false
    const distance = DRAW_DISTANCE[source.name]
    if (distance !== undefined) {
      source.addLODLevel(distance, null)
    }
  }
  return { instances, missing }
}

/**
 * Small pieces stop drawing beyond these distances from the camera, in metres: from the zoomed-out view a duckboard or
 * a splinter is a pixel, and there are thousands of them.
 */
const DRAW_DISTANCE: Readonly<Record<string, number>> = {
  Prop_Trench_Planks_01: 120,
  Prop_Ladder_01: 140,
  Env_Trench_Firestep_02: 160,
  Env_Trench_Firestep_05: 200,
  Prop_Wire_Fence_Tangled_01: 220,
  Prop_Wire_Fence_Tangled_02: 160,
  Prop_Wire_Fence_Tangled_03: 220,
  Env_Tree_Shards_01: 140,
  Env_Tree_Shards_02: 140,
  Env_Tree_Shards_03: 140,
  Env_Tree_Branch_01: 140,
  Env_Tree_Branch_02: 140,
  Env_Brick_Debris_01: 160,
  Env_Brick_Debris_02: 160,
  Env_Brick_Debris_03: 160,
  Gen_Prop_Crate_02: 120,
  Gen_Prop_Barrel_Wood_01: 120,
  Gen_Prop_Sack_Stack_01: 120,
  Prop_Iron_Sheet_01: 120,
  Prop_Iron_Sheet_02: 120,
  Gen_Wep_Spade_01: 80,
  Env_Trench_Pole_01: 220,
  Prop_Barricade_01: 200,
  Prop_Barricade_03: 200,
  Env_Crater_Water_02: 140,
  Gas_Curtain: 90,
  Gen_Prop_Barrel_Metal_01: 120,
  Prop_RoadSign_01: 160,
  Gen_Env_Grass_01: 70,
  Gen_Env_Grass_02: 70,
  Gen_Env_Grass_03: 70,
  Gen_Env_Grass_Tall_01: 110,
  Gen_Env_Grass_Tall_02: 110
}

/** Everything the level dressed the battlefield with. */
export interface LevelDressing extends BattlefieldDressing {
  /** The plugin texturing the ground. */
  readonly ground: GroundSplatPlugin
  /** Light, shadows, smoke and mist, or null when the scene has no sun and sky to work with. */
  readonly atmosphere: Atmosphere | null
  /** Shell damage to the props, in step with the craters the simulation blasts. */
  readonly damage: BattleDamage
  /** Scorch, smoke, fires and thrown earth where shells burst, and the jolt of a near one. */
  readonly aftermath: ShellAftermath
  /** Braziers burning by the dugouts, and crows on the wire. */
  readonly life: TrenchLife
  /** The miniature look: depth of field, bloom, grain and antialiasing; null where the engine can't run it. */
  readonly postProcess: PostProcess | null
  /** The props' materials, for effects layered on them such as fog of war. */
  readonly materials: readonly Material[]
  /** The sector's ambient sound, following the camera, or null when the kit has none. */
  readonly ambience: Ambience | null
  /** The battle's sound effects, for apps/client/src/audio/battle-sounds.ts, or null when the kit has none. */
  readonly sfx: BattleSoundFiles | null
}

/** What the level reads from the running battle. */
interface LevelOptions {
  /** The wind near the ground, metres per second, which carries the smoke. Defaults to a light westerly. */
  readonly wind?: () => { readonly x: number; readonly z: number }
}

const WESTERLY = { x: 2, z: 0 } as const

/** The parts of the battlefield view the level dresses. */
interface DressableView {
  readonly scene: Scene
  readonly camera: TargetCamera
  readonly groundMaterial: Material
  readonly terrain: TerrainChunks
}

/**
 * Loads the level kit and dresses the battlefield with it: Synty ground textures on the terrain, the ground shaped to
 * sit under the trench kit, props along the trenches and across the map, and the atmosphere: light, shadows, smoke and
 * mist. Resolves null, leaving the greybox, when the kit isn't available.
 */
export async function dressLevel(
  view: DressableView,
  map: BattlefieldMap,
  { wind = () => WESTERLY }: LevelOptions = {}
): Promise<LevelDressing | null> {
  const kit = await loadLevelKit(view.scene)
  if (!kit) {
    return null
  }
  const scorch = createScorchMap(view.scene, mapWidth(map), mapDepth(map))
  const ground = new GroundSplatPlugin(view.groundMaterial, kit.ground, scorch)
  view.terrain.shapeForTrenchKit()
  const atmosphere = createAtmosphere(view.scene, map, view.camera, kit.fx)
  // Pieces the kit lacks, made in code.
  const curtain = createGasCurtain(view.scene)
  const pieces = new Map(kit.pieces).set(curtain.name, curtain)
  const dressed = dressBattlefield(map, { ...kit, pieces })
  const life = createTrenchLife(view.scene, map, dressed.instances, kit.fx)
  const dressing = {
    ...dressed,
    ground,
    atmosphere,
    damage: createBattleDamage(pieces, dressed.instances),
    aftermath: createShellAftermath(view.scene, map, view.camera, kit.fx, scorch, wind, (event) =>
      life.crows.scare(event.at.x, event.at.z)
    ),
    life,
    postProcess: createPostProcess(view.scene, view.camera),
    materials: [...kit.materials, ...(curtain.material ? [curtain.material] : [])],
    ambience: kit.audio ? await createAmbience(map, kit.audio) : null,
    sfx: kit.sfx
  }
  const ambience = dressing.ambience
  view.scene.onBeforeRenderObservable.add(() => {
    const target = view.camera.getTarget()
    const frameSeconds = view.scene.getEngine().getDeltaTime() / 1000
    // The survey's full 0.5 m detail around where the camera looks, a chunk a frame.
    view.terrain.refine(target.x, target.z)
    ambience?.update(target.x, target.z, frameSeconds)
    dressing.aftermath.update(frameSeconds)
    life.update(frameSeconds)
    dressing.postProcess?.update()
  })
  if (dressing.missing.size > 0) {
    console.warn("Level kit is missing pieces; rebuild it with scripts/build-level-kit.py:", [...dressing.missing])
  }
  return dressing
}
