import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import type { Material } from "@babylonjs/core/Materials/material"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, mapDepth, mapWidth } from "@verdun/map"
import type { BattleSoundFiles } from "../audio/battle-sounds.ts"
import { backdropTrees, createBackdrop, type Surroundings } from "../terrain/backdrop.ts"
import { GroundSplatPlugin } from "../terrain/ground-splat-plugin.ts"
import type { TerrainChunks } from "../terrain/terrain-chunks.ts"
import { type Ambience, createAmbience } from "./ambience.ts"
import { type Atmosphere, createAtmosphere } from "./atmosphere.ts"
import { type BattleDamage, createBattleDamage } from "./battle-damage.ts"
import type { KitFiles } from "./kit-files.ts"
import { type KitEffects, type LevelKit, loadLevelKit } from "./level-kit.ts"
import { airLight, lightParticles, litByAir } from "./particle-light.ts"
import { hashOf, type Placement } from "./placement.ts"
import { createPostProcess, type PostProcess } from "./post-process.ts"
import { batchScenery, type SceneryBatches } from "./scenery-batches.ts"
import { CENTRED_PIECES, layOutScenery } from "./scenery-dressing.ts"
import { createScorchMap } from "./scorch-map.ts"
import { createShellAftermath, type ShellAftermath } from "./shell-aftermath.ts"
import { createShellBursts, type ShellBursts } from "./shell-burst.ts"
import { layOutTrenchKit } from "./trench-dressing.ts"
import { brazierTops, createGasCurtain, createTrenchLife, type TrenchLife } from "./trench-life.ts"

export interface BattlefieldDressing {
  /** The kit pieces placed on the battlefield, drawn in batches. */
  readonly scenery: SceneryBatches
  /** Where the layout put each piece. */
  readonly placements: readonly Placement[]
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
 * wire. Every placement is drawn as a thin instance of its kit piece, batched with the same piece nearby (see
 * scenery-batches.ts).
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

  const placed: { piece: string; world: Matrix }[] = []
  for (const placement of placements) {
    if (kit.pieces.has(placement.piece)) {
      placed.push({ piece: placement.piece, world: placementMatrix(placement, pivots.get(placement.piece)) })
    } else {
      missing.add(placement.piece)
    }
  }
  const scenery = batchScenery(kit.pieces, placed, DRAW_DISTANCE)
  for (const batch of scenery.batches) {
    const sway = SWAY[batch.piece]
    for (const mesh of sway === undefined ? [] : [batch.mesh, batch.far]) {
      if (mesh) {
        mesh.metadata = { sway }
      }
    }
  }
  return { scenery, placements, missing }
}

/**
 * How freely each kind of plant sways in the wind, grass at 1, for the wind's sway on the kit's materials (see
 * environment/). The dead trees are stiff: their crowns stir a little.
 */
const SWAY: Readonly<Record<string, number>> = {
  Gen_Env_Grass_01: 1,
  Gen_Env_Grass_02: 1,
  Gen_Env_Grass_03: 1,
  Gen_Env_Grass_Tall_01: 1,
  Gen_Env_Grass_Tall_02: 1,
  Env_Tree_Dead_04: 0.25,
  Gen_Env_Tree_Dead_01: 0.25,
  Gen_Env_Tree_Dead_02: 0.25,
  Gen_Env_Tree_Dead_03: 0.25,
  // Stripped to poles, only a stub of a branch left to stir.
  Env_Tree_Dead_01: 0.1,
  Env_Tree_Dead_02: 0.1,
  Env_Tree_Dead_03: 0.1
}

/**
 * Small pieces stop drawing beyond these distances from the camera, in metres, measured to the nearest of their batch:
 * from the zoomed-out view a duckboard or a splinter is a pixel, and there are thousands of them.
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
  Env_Tree_Branch_03: 140,
  Env_Tree_Branch_04: 140,
  Tree_Branch_01: 140,
  Gen_Env_Twig_02: 70,
  Gen_Env_Twig_03: 70,
  Gen_Env_Twig_04: 70,
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
  Gen_Env_Grass_Tall_02: 110,
  Prop_Rubble_House_Plank_01: 150,
  Prop_Rubble_House_Plank_02: 150,
  Prop_Rubble_House_Tile_01: 110,
  Prop_Rubble_House_Tile_02: 110,
  Prop_Fireplace_01: 160,
  Chr_Attach_French_Helmet_01: 60,
  Chr_Attach_German_Helmet_2: 60,
  Wep_German_Rifle_01: 70,
  Gen_Prop_Plank_01: 90,
  Gen_Prop_Plank_02: 90,
  Prop_Iron_Sheet_03: 120,
  Prop_Shell_01: 60,
  Prop_Shell_02: 70,
  Env_Sandbag_01: 80,
  Env_Sandbag_03: 80,
  Char_Attach_German_Pack_01: 60,
  Char_Attach_German_Canteen_01: 50,
  Prop_Stretcher_01: 100
}

/** Dead trees for the backdrop's woods and its scattered survivors along the front. */
const BACKDROP_TREES = ["Env_Tree_Dead_04", "Gen_Env_Tree_Dead_01", "Gen_Env_Tree_Dead_02", "Gen_Env_Tree_Dead_03"]

/**
 * Trees on the ground beyond the sector (see backdropTrees). There are thousands and all of them far off, so each kind
 * is one mesh of its decimated far copy drawn as thin instances: one draw, no per-tree culling.
 */
function plantBackdrop(map: BattlefieldMap, surroundings: Surroundings, pieces: ReadonlyMap<string, Mesh>): Mesh[] {
  const byPiece = new Map<string, number[]>()
  for (const { x, y, z } of backdropTrees(map, surroundings)) {
    const piece = BACKDROP_TREES[Math.floor(hashOf(x, z, 40) * BACKDROP_TREES.length)] ?? ""
    const size = 0.8 + hashOf(x, z, 41) * 0.8
    const matrix = placementMatrix({
      piece,
      x,
      y: y - 0.2,
      z,
      yaw: hashOf(x, z, 42) * Math.PI * 2,
      scale: [size, size, size]
    })
    const matrices = byPiece.get(piece) ?? []
    matrices.push(...matrix.asArray())
    byPiece.set(piece, matrices)
  }
  const woods: Mesh[] = []
  for (const [piece, matrices] of byPiece) {
    const source = pieces.get(piece)
    // The far copy where the kit has one: at a kilometre the full tree is wasted triangles.
    const far = source?.getLODLevels()[0]?.mesh ?? source
    if (!source || !far) {
      continue
    }
    const wood = new Mesh(`backdrop-${piece}`, source.getScene())
    VertexData.ExtractFromMesh(far, true, true).applyToMesh(wood)
    wood.material = source.material
    wood.isPickable = false
    wood.thinInstanceSetBuffer("matrix", new Float32Array(matrices), 16, true)
    woods.push(wood)
  }
  return woods
}

/** Everything the level dressed the battlefield with. */
export interface LevelDressing extends BattlefieldDressing {
  /** The plugin texturing the ground. */
  readonly ground: GroundSplatPlugin
  /** Light, shadows, smoke and mist, or null when the scene has no sun and sky to work with. */
  readonly atmosphere: Atmosphere | null
  /** Shell damage to the props, in step with the craters the simulation blasts. */
  readonly damage: BattleDamage
  /** Shells bursting: flash, fireball, the column of earth, dust, sparks and black smoke. */
  readonly bursts: ShellBursts
  /** Scorch, smoke, fires and thrown earth where shells burst, and the jolt of a near one. */
  readonly aftermath: ShellAftermath
  /** Braziers burning by the dugouts, and crows on the wire. */
  readonly life: TrenchLife
  /** The miniature look: depth of field, bloom, grain and antialiasing; null where the engine can't run it. */
  readonly postProcess: PostProcess | null
  /** The kit's effect sprites, for effects made outside the level such as the night's lights. */
  readonly fx: KitEffects
  /** The ground round the sector out to the horizon, when the level was given it, and the woods on it. */
  readonly backdrop: Mesh | null
  readonly woods: readonly Mesh[]
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
  /** Where to read the kit from, when the caller reads more from it; by default the level opens and closes its own. */
  readonly files?: KitFiles | null
  /** The surveyed ground round the sector, drawn out to the horizon; without it the sector ends at its edges. */
  readonly surroundings?: Surroundings
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
  { wind = () => WESTERLY, files, surroundings }: LevelOptions = {}
): Promise<LevelDressing | null> {
  const kit = await loadLevelKit(view.scene, files)
  if (!kit) {
    return null
  }
  const scorch = createScorchMap(view.scene, mapWidth(map), mapDepth(map))
  const ground = new GroundSplatPlugin(view.groundMaterial, kit.ground, scorch)
  const backdrop = surroundings ? createBackdrop(view.scene, map, surroundings, view.groundMaterial) : null
  view.terrain.shapeForTrenchKit()
  const atmosphere = createAtmosphere(view.scene, map, view.camera, kit.fx)
  // Pieces the kit lacks, made in code.
  const curtain = createGasCurtain(view.scene)
  const pieces = new Map(kit.pieces).set(curtain.name, curtain)
  const dressed = dressBattlefield(map, { ...kit, pieces })
  const woods = surroundings ? plantBackdrop(map, surroundings, pieces) : []
  const life = createTrenchLife(view.scene, map, brazierTops(dressed.placements, pieces), kit.fx)
  const bursts = createShellBursts(view.scene, map, kit.fx, wind)
  const dressing = {
    ...dressed,
    ground,
    atmosphere,
    damage: createBattleDamage(dressed.scenery),
    bursts,
    aftermath: createShellAftermath(view.scene, map, view.camera, kit.fx, scorch, wind, (event) => {
      bursts.burst(event)
      life.crows.scare(event.at.x, event.at.z)
    }),
    life,
    // The depth of field blurs by the ground's depth alone: from the game's camera, looking down on the battlefield,
    // what stands on the ground is near enough the ground's depth, and every prop drawn again costs a draw call.
    postProcess: createPostProcess(view.scene, view.camera, {
      inDepth: (mesh) => mesh.name.startsWith("terrain-") || mesh.name === "backdrop"
    }),
    materials: [...kit.materials, ...(curtain.material ? [curtain.material] : [])],
    ambience: kit.audio ? await createAmbience(map, kit.audio) : null,
    sfx: kit.sfx,
    fx: kit.fx,
    backdrop,
    woods
  }
  const ambience = dressing.ambience
  // Smoke, dust and mist are drawn unlit: they darken with the light, so they don't glow at night.
  const unlit = [
    atmosphere?.smoke,
    atmosphere?.mist,
    dressing.aftermath.smoke,
    dressing.aftermath.clods,
    ...bursts.systems
  ]
  const particleLight = lightParticles(unlit.filter((system) => system !== undefined).filter(litByAir))
  const light = new Color3()
  // Detail, far copy or nothing for each batch, by the drawing camera's distance, before the scene culls them.
  view.scene.onBeforeActiveMeshesEvaluationObservable.add(() => {
    dressed.scenery.update((view.scene.activeCamera ?? view.camera).globalPosition)
  })
  view.scene.onBeforeRenderObservable.add(() => {
    const target = view.camera.getTarget()
    const frameSeconds = view.scene.getEngine().getDeltaTime() / 1000
    // The survey's full 0.5 m detail around where the camera looks, a chunk a frame.
    view.terrain.refine(target.x, target.z)
    ambience?.update(target.x, target.z, frameSeconds)
    dressing.aftermath.update(frameSeconds)
    bursts.update()
    life.update(frameSeconds)
    airLight(view.scene, light)
    particleLight.update(light)
    atmosphere?.update(light)
    dressing.postProcess?.update()
  })
  if (dressing.missing.size > 0) {
    console.warn("Level kit is missing pieces; rebuild it with scripts/build-level-kit.py:", [...dressing.missing])
  }
  return dressing
}
