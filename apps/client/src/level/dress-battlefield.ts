import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import type { Material } from "@babylonjs/core/Materials/material"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, mapDepth, mapWidth } from "@verdun/map"
import type { WireField } from "@verdun/sim"
import type { BattleSoundFiles } from "../audio/battle-sounds.ts"
import type { GraphicsQuality } from "../settings/graphics.ts"
import { backdropGround, backdropTrees, createBackdrop, type Surroundings } from "../terrain/backdrop.ts"
import { GroundSplatPlugin } from "../terrain/ground-splat-plugin.ts"
import type { TerrainChunks } from "../terrain/terrain-chunks.ts"
import { type Ambience, createAmbience } from "./ambience.ts"
import { type Atmosphere, createAtmosphere } from "./atmosphere.ts"
import { type BattleDamage, createBattleDamage, DEBRIS } from "./battle-damage.ts"
import { createFenceArt, type FenceArt } from "./fence-art.ts"
import { pauseIdleParticles } from "./idle-particles.ts"
import type { KitFiles } from "./kit-files.ts"
import { type KitEffects, type LevelKit, loadLevelKit } from "./level-kit.ts"
import { airLight, lightParticles, litByAir, setInFog } from "./particle-light.ts"
import { hashOf, type Placement } from "./placement.ts"
import { createPostProcess, type PostProcess } from "./post-process.ts"
import {
  createRailwayPieces,
  distanceToTracks,
  layOutRailways,
  RAILWAY_LOADS,
  RAILWAY_PIECES,
  railwayTracks
} from "./railway.ts"
import { batchScenery, type SceneryBatches } from "./scenery-batches.ts"
import { CENTRED_PIECES, FRUIT_TREES, layOutScenery } from "./scenery-dressing.ts"
import { createScorchMap, type ScorchMap } from "./scorch-map.ts"
import { createShellAftermath, type ShellAftermath } from "./shell-aftermath.ts"
import { createShellBursts, type ShellBursts } from "./shell-burst.ts"
import { softenParticles } from "./soft-particles.ts"
import { layOutTrenchKit } from "./trench-dressing.ts"
import {
  brazierTops,
  createGasCurtain,
  createLaundryLine,
  createStovepipe,
  createTrenchLife,
  stovepipeTops,
  type TrenchLife
} from "./trench-life.ts"
import { createWireArt, type WireArt } from "./wire-art.ts"

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

/** Props scattered over the ground keep this many metres clear of a railway's middle: the track lies there. */
const TRACK_CLEAR = 1.2

/**
 * Dresses the battlefield with the level kit: the trench kit along every trench, the art for the map's scenery and
 * wire, and its railways. Every placement is drawn as a thin instance of its kit piece, batched with the same piece
 * nearby (see scenery-batches.ts). Given the height of the ground beyond the sector, a railway running off it runs on
 * over that ground.
 */
export function dressBattlefield(
  map: BattlefieldMap,
  kit: LevelKit,
  beyond?: (x: number, z: number) => number
): BattlefieldDressing {
  const tracks = railwayTracks(map, false)
  const placements = [
    ...layOutTrenchKit(map),
    ...layOutScenery(map).filter(({ x, z }) => distanceToTracks(tracks, x, z) > TRACK_CLEAR),
    ...layOutRailways(map, beyond)
  ]
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
  const scenery = batchScenery(kit.pieces, placed, { drawDistances: DRAW_DISTANCE, debris: DEBRIS })
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
  Env_Tree_Dead_03: 0.1,
  // The orchard's bare fruit trees: short, stiff limbs.
  ...Object.fromEntries(FRUIT_TREES.map((piece) => [piece, 0.15]))
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
  Stovepipe: 110,
  Laundry_Line: 90,
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
  [RAILWAY_PIECES.track]: 260,
  [RAILWAY_PIECES.worn]: 260,
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
/** The plainer of them, for the farthest woods: Gen_Env_Tree_Dead_03's far copy is 524 triangles, these 150 to 216. */
const PLAIN_TREES = ["Env_Tree_Dead_04", "Gen_Env_Tree_Dead_01", "Gen_Env_Tree_Dead_02"]

/**
 * The backdrop's woods by distance, in metres beyond the sector's edge. Within `shadowed` they throw shadows: the camera
 * can look on them from the sector's edge, and further off they're beyond where shadows reach (see atmosphere.ts).
 * Every tree stands up to `full` metres out; beyond, the woods thin to `least` of their trees by `thinned`, those left
 * standing larger so the woods still cover the hills, and past `plain` only the plainer trees grow. A tree a kilometre
 * off is a few pixels, and all fourteen thousand had been three fifths of every frame's triangles. The far woods are cut
 * into cells `cell` metres across, so the camera draws only the cells it looks toward.
 */
const WOODS = { shadowed: 200, full: 500, thinned: 1500, least: 0.3, plain: 800, cell: 750 } as const

/** The share of the backdrop's trees left standing this many metres beyond the sector's edge (see WOODS). */
export function woodsStanding(beyond: number): number {
  const thinning = Math.min(1, Math.max(0, (beyond - WOODS.full) / (WOODS.thinned - WOODS.full)))
  return 1 - (1 - WOODS.least) * thinning
}

/** Backdrop trees stand at least this many metres from a railway running on beyond the sector. */
const TREES_OFF_TRACK = 4

/**
 * Trees on the ground beyond the sector (see backdropTrees), clear of the railways run on over it. There are thousands
 * and all of them far off, so each kind is a mesh of its decimated far copy drawn as thin instances, a mesh for each
 * cell of the woods. The few hundred near the sector are a mesh of their own for each kind, which throws shadows; the
 * rest, `backdrop-far-`, don't.
 */
function plantBackdrop(map: BattlefieldMap, surroundings: Surroundings, pieces: ReadonlyMap<string, Mesh>): Mesh[] {
  const byName = new Map<string, { piece: string; matrices: number[] }>()
  const tracks = railwayTracks(map, true)
  for (const { x, y, z } of backdropTrees(map, surroundings)) {
    const beyond = Math.hypot(Math.max(0, -x, x - mapWidth(map)), Math.max(0, -z, z - mapDepth(map)))
    const standing = woodsStanding(beyond)
    if (hashOf(x, z, 43) > standing || distanceToTracks(tracks, x, z) < TREES_OFF_TRACK) {
      continue
    }
    const kinds = beyond > WOODS.plain ? PLAIN_TREES : BACKDROP_TREES
    const piece = kinds[Math.floor(hashOf(x, z, 40) * kinds.length)] ?? ""
    // Fewer trees, each spreading over the ground of those gone.
    const size = (0.8 + hashOf(x, z, 41) * 0.8) / Math.sqrt(standing)
    const matrix = placementMatrix({
      piece,
      x,
      y: y - 0.2,
      z,
      yaw: hashOf(x, z, 42) * Math.PI * 2,
      scale: [size, size, size]
    })
    const name =
      beyond <= WOODS.shadowed
        ? `backdrop-${piece}`
        : `backdrop-far-${piece}@${Math.floor(x / WOODS.cell)},${Math.floor(z / WOODS.cell)}`
    const wood = byName.get(name) ?? { piece, matrices: [] }
    wood.matrices.push(...matrix.asArray())
    byName.set(name, wood)
  }
  const woods: Mesh[] = []
  for (const [name, { piece, matrices }] of byName) {
    const source = pieces.get(piece)
    // The far copy where the kit has one: at a kilometre the full tree is wasted triangles.
    const far = source?.getLODLevels()[0]?.mesh ?? source
    if (!source || !far) {
      continue
    }
    const wood = new Mesh(name, source.getScene())
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
  /** Where shells have blackened the ground, fading as rain washes it. */
  readonly scorch: ScorchMap
  /** The ground round the sector out to the horizon, when the level was given it, and the woods on it. */
  readonly backdrop: Mesh | null
  readonly woods: readonly Mesh[]
  /** The props' materials, for effects layered on them such as fog of war. */
  readonly materials: readonly Material[]
  /** The wire belts' art, following the simulation's wire as it's cut and mended; null when the level wasn't given it. */
  readonly wire: WireArt | null
  /** The gap fences' art, following the fences shells flatten; null when the level wasn't given them. */
  readonly fences: FenceArt | null
  /** The sector's ambient sound, following the camera: null until the kit's ambience has come, or when it has none. */
  readonly ambience: Ambience | null
  /**
   * The battle's sound effects, for apps/client/src/audio/battle-sounds.ts, or null when the kit has none. The sounds
   * are last in the asset pack, so the level is up before they've all arrived. Settles only once the ambience has
   * started too, so the battle can wait for all its sound before it begins.
   */
  readonly sfx: Promise<BattleSoundFiles | null>
}

/** What the level reads from the running battle. */
interface LevelOptions {
  /** The graphics setting, which the post-process reads: high by default. */
  readonly quality?: GraphicsQuality
  /** The wind near the ground, metres per second, which carries the smoke. Defaults to a light westerly. */
  readonly wind?: () => { readonly x: number; readonly z: number }
  /** Where to read the kit from, when the caller reads more from it; by default the level opens and closes its own. */
  readonly files?: KitFiles | null
  /** The surveyed ground round the sector, drawn out to the horizon; without it the sector ends at its edges. */
  readonly surroundings?: Surroundings
  /**
   * The simulation's wire, which the belts' art follows as shells cut it and wiring parties mend it. Without it,
   * shells tear the wire's art away round each crater, and it stays torn.
   */
  readonly wire?: () => WireField
  /**
   * The fences shells have flattened, by their index in the map's scenery (the simulation's `fencesDown`), which the
   * gap fences' art follows. Without it, shells blow the fences' art away round each crater.
   */
  readonly fencesDown?: () => readonly number[]
  /** How hard it's raining, in millimetres an hour, and how much of it is snow: rain washes the scorch away. */
  readonly weather?: () => { readonly precipitation: number; readonly snowFraction: number }
}

/**
 * Rain washes the soot of shell bursts into the mud: heavy rain (`heavy` mm an hour) halves the scorch every
 * `halfLife` seconds, about two hours of the game's day, and lighter rain proportionately slower. It's washed in
 * steps of `step`, so the scorch map goes to the GPU now and then rather than every frame.
 */
const SCORCH_WASH = { heavy: 4, halfLife: 600, step: 0.02 } as const

/**
 * Particles flung through the air (earth, clods, sparks, shrapnel's ball of smoke) are never long against the ground,
 * so soft edges would cost their every fragment for nothing.
 */
const AIRBORNE = /earth|clods|sparks|shrapnel$/

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
  { wind = () => WESTERLY, files, surroundings, wire, fencesDown, weather, quality }: LevelOptions = {}
): Promise<LevelDressing | null> {
  const kit = await loadLevelKit(view.scene, files)
  if (!kit) {
    return null
  }
  const scorch = createScorchMap(view.scene, mapWidth(map), mapDepth(map))
  const ground = new GroundSplatPlugin(view.groundMaterial, kit.ground, scorch)
  const backdrop = surroundings ? createBackdrop(view.scene, map, surroundings, view.groundMaterial) : null
  // The textures cover its colours too, and it shares the chunks' material, which would otherwise be built twice: once
  // for them, once for it with colours.
  if (backdrop) {
    backdrop.useVertexColors = false
  }
  view.terrain.shapeForTrenchKit()
  const atmosphere = createAtmosphere(view.scene, map, view.camera, kit.fx)
  // Pieces the kit lacks, made in code.
  const curtain = createGasCurtain(view.scene)
  const stovepipe = createStovepipe(view.scene)
  const laundry = createLaundryLine(view.scene)
  const railway = createRailwayPieces(view.scene)
  const pieces = new Map(kit.pieces)
    .set(curtain.name, curtain)
    .set(stovepipe.name, stovepipe)
    .set(laundry.name, laundry)
  for (const piece of railway) {
    pieces.set(piece.name, piece)
  }
  // The wagons' loads, drawn as far off as the wagons.
  for (const [load, piece] of Object.entries(RAILWAY_LOADS)) {
    const mesh = kit.pieces.get(piece)
    if (mesh) {
      pieces.set(load, mesh)
    }
  }
  const dressed = dressBattlefield(
    map,
    { ...kit, pieces },
    surroundings ? backdropGround(map, surroundings) : undefined
  )
  const woods = surroundings ? plantBackdrop(map, surroundings, pieces) : []
  const life = createTrenchLife(
    view.scene,
    map,
    { braziers: brazierTops(dressed.placements, pieces), stoves: stovepipeTops(dressed.placements), wind },
    kit.fx
  )
  const bursts = createShellBursts(view.scene, map, kit.fx, wind)
  // The ambience starts when its sounds have come, behind the rest of the kit.
  let ambience: Ambience | null = null
  const ambienceStarted = kit.audio
    .then(async (audio) => {
      ambience = audio ? await createAmbience(map, audio) : null
    })
    .catch((error: unknown) => {
      console.warn("The ambience couldn't start; the battle goes on without it.", error)
    })
  const dressing = {
    ...dressed,
    ground,
    atmosphere,
    // Given the simulation's wire and fences, their art follows them, not the craters.
    damage: createBattleDamage(
      dressed.scenery,
      (piece) =>
        (wire !== undefined && piece.startsWith("Prop_Wire_Fence")) ||
        (fencesDown !== undefined && piece.startsWith("Prop_Barricade"))
    ),
    wire: wire ? createWireArt(dressed.scenery, dressed.placements) : null,
    fences: fencesDown ? createFenceArt(dressed.scenery, map.scenery) : null,
    bursts,
    aftermath: createShellAftermath(view.scene, map, view.camera, kit.fx, scorch, wind, (event) => {
      bursts.burst(event)
      life.crows.scare(event.at.x, event.at.z)
    }),
    life,
    // The depth of field blurs by the ground's depth alone: from the game's camera, looking down on the battlefield,
    // what stands on the ground is near enough the ground's depth, and every prop drawn again costs a draw call.
    postProcess: createPostProcess(view.scene, view.camera, {
      inDepth: (mesh) => mesh.name.startsWith("terrain-") || mesh.name === "backdrop",
      quality
    }),
    materials: [
      ...kit.materials,
      ...[curtain.material, stovepipe.material, laundry.material, railway[0]?.material ?? null].filter(
        (material) => material !== null
      )
    ],
    get ambience() {
      return ambience
    },
    sfx: ambienceStarted.then(() => kit.sfx),
    fx: kit.fx,
    scorch,
    backdrop,
    woods
  }
  let wireCuts = -1
  let washing = 0
  // Smoke, dust and mist are drawn unlit: they darken with the light, so they don't glow at night. They and the flames
  // sit in the fog.
  const unlit = [
    atmosphere?.smoke,
    atmosphere?.mist,
    dressing.aftermath.smoke,
    dressing.aftermath.clods,
    life.smoke,
    ...bursts.systems
  ].filter((system) => system !== undefined)
  setInFog(unlit)
  const particleLight = lightParticles(unlit.filter(litByAir))
  const { postProcess } = dressing
  if (postProcess) {
    // The depth map holds only the ground, so it's drawn again only when the ground is rebuilt or the camera moves.
    view.terrain.onRebuilt.add(() => postProcess.redrawDepth())
    // Puffs lying on the ground fade out where they meet it rather than cut a line through it, against the depth map
    // the depth of field draws (see soft-particles.ts).
    softenParticles(
      unlit.filter((system) => !AIRBORNE.test(system.name)),
      { depthMap: view.scene.enableDepthRenderer(view.camera).getDepthMap(), camera: view.camera }
    )
  }
  // Each of the scene's particle systems, the rain's, the flares' and the tracers' made after the level too, is paused
  // while it has nothing to draw, rather than uploaded empty every frame (see idle-particles.ts).
  pauseIdleParticles(view.scene)
  const light = new Color3()
  // Detail, far copy or nothing for each batch, by the drawing camera's distance, before the scene culls them.
  view.scene.onBeforeActiveMeshesEvaluationObservable.add(() => {
    dressed.scenery.update((view.scene.activeCamera ?? view.camera).globalPosition)
  })
  view.scene.onBeforeRenderObservable.add(() => {
    const target = view.camera.getTarget()
    const frameSeconds = view.scene.getEngine().getDeltaTime() / 1000
    ambience?.update(target.x, target.z, frameSeconds)
    dressing.aftermath.update(frameSeconds)
    bursts.update()
    life.update(frameSeconds)
    const falling = weather?.()
    if (falling) {
      const rain = falling.precipitation * (1 - falling.snowFraction)
      washing += (Math.LN2 / SCORCH_WASH.halfLife) * (rain / SCORCH_WASH.heavy) * frameSeconds
      if (washing >= SCORCH_WASH.step) {
        scorch.wash(washing)
        washing = 0
      }
    }
    const field = wire?.()
    if (field && field.cuts !== wireCuts) {
      wireCuts = field.cuts
      dressing.wire?.sync(field)
    }
    const down = fencesDown?.()
    if (down) {
      dressing.fences?.sync(down)
    }
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
