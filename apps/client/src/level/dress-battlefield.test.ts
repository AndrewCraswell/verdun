import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import { carveTrenches, createFlatMap, Surface, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it, vi } from "vitest"
import { surfaceColors } from "../palette.ts"
import { createTerrainChunks } from "../terrain/terrain-chunks.ts"
import { dressBattlefield, dressLevel, placementMatrix, woodsStanding } from "./dress-battlefield.ts"
import { type LevelKit, loadLevelKit } from "./level-kit.ts"
import { RAILWAY_PIECES } from "./railway.ts"
import { TRENCH_PIECES } from "./trench-dressing.ts"

vi.mock("./level-kit.ts", () => ({ loadLevelKit: vi.fn<(scene: Scene) => Promise<LevelKit | null>>() }))

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

/** A stand-in kit: a box for each named piece, plus a ruin modelled off its middle like the Synty ones. */
function kitOf(pieces: readonly string[]): { kit: LevelKit; scene: Scene } {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const meshes = new Map<string, Mesh>()
  for (const piece of pieces) {
    const mesh = CreateBox(piece, { size: 1 }, scene)
    mesh.setEnabled(false)
    meshes.set(piece, mesh)
  }
  const ruin = CreateBox("Bld_City_Destroyed_01", { width: 4, depth: 6, height: 2 }, scene)
  ruin.bakeTransformIntoVertices(placementMatrix({ piece: "", x: -2, y: 0, z: -3, yaw: 0 }))
  meshes.set(ruin.name, ruin)
  const ground = new Texture(null, scene)
  return {
    scene,
    kit: {
      pieces: meshes,
      materials: [new StandardMaterial("kit", scene)],
      ground: {
        grass: { albedo: ground, normal: ground },
        mud: { albedo: ground, normal: ground },
        chalk: { albedo: ground, normal: ground },
        churned: { albedo: ground, normal: ground }
      },
      fx: { smoke: ground, mist: ground, fire: ground, ember: ground, scorch: ground, grunge: ground, puff: ground },
      audio: Promise.resolve(null),
      sfx: Promise.resolve(null)
    }
  }
}

function trenchMap() {
  const trench: Trench = {
    kind: "fire",
    points: [
      [10, 30],
      [60, 30]
    ],
    facing: "north"
  }
  const map = {
    ...createFlatMap({ name: "field", cellSize: 0.5, columns: 160, rows: 160 }, 5),
    trenches: [trench],
    // Variant 7: the lone front wall, a piece modelled off its middle.
    scenery: [{ kind: "ruin" as const, x: 40, z: 60, heading: 0, variant: 7, scale: 1 }]
  }
  carveTrenches(map, map.trenches)
  return map
}

describe("placementMatrix", () => {
  it("scales, turns about the vertical, tilts and moves a piece into place", () => {
    const matrix = placementMatrix({ piece: "p", x: 10, y: 2, z: 5, yaw: Math.PI / 2, scale: [1, 1, 2] })
    const tip = Vector3.TransformCoordinates(new Vector3(0, 0, 1), matrix)

    // The piece's +z, stretched to 2 m, turned to point east.
    expect(tip.x).toBeCloseTo(12)
    expect(tip.y).toBeCloseTo(2)
    expect(tip.z).toBeCloseTo(5)
    const tilted = placementMatrix({ piece: "p", x: 0, y: 0, z: 0, yaw: 0, up: [0, Math.SQRT1_2, Math.SQRT1_2] })
    expect(Vector3.TransformNormal(Vector3.Up(), tilted).z).toBeCloseTo(Math.SQRT1_2)
  })

  it("turns a piece about a pivot instead of its origin", () => {
    const matrix = placementMatrix({ piece: "p", x: 0, y: 0, z: 0, yaw: Math.PI }, new Vector3(1, 0, 0))

    expect(Vector3.TransformCoordinates(new Vector3(1, 0, 0), matrix).x).toBeCloseTo(0)
  })
})

describe("woodsStanding", () => {
  it("leaves every backdrop tree standing near the sector, thinning them to three in ten a kilometre and a half out", () => {
    const shares = [0, 500, 800, 1000, 1500, 2500].map(woodsStanding)

    expect(shares[0]).toBe(1)
    expect(shares[1]).toBe(1)
    expect(shares[3]).toBeCloseTo(0.65)
    expect(shares[4]).toBeCloseTo(0.3)
    expect(shares[5]).toBeCloseTo(0.3)
    expect(shares.every((share, index) => index === 0 || share <= (shares[index - 1] ?? 1))).toBe(true)
  })
})

describe("dressBattlefield", () => {
  it("draws a thin instance of a kit piece for every placement, and reports pieces the kit lacks", () => {
    const { kit } = kitOf(Object.values(TRENCH_PIECES).flat())
    const dressing = dressBattlefield(trenchMap(), kit)
    const drawn = dressing.scenery.batches.reduce((total, batch) => total + batch.mesh.thinInstanceCount, 0)

    expect(drawn).toBeGreaterThan(20)
    expect(drawn).toBe(dressing.placements.filter((placement) => kit.pieces.has(placement.piece)).length)
    expect(dressing.missing.has("Bld_City_Destroyed_01")).toBe(false)
    // The kit's pieces stay templates: the batches draw their geometry.
    const straight = kit.pieces.get(TRENCH_PIECES.straights[0])
    expect(straight?.isEnabled()).toBe(false)
    const batch = dressing.scenery.batches.find((each) => each.piece === TRENCH_PIECES.straights[0])
    expect(batch?.mesh.getVertexBuffer("position")?.getWrapperBuffer()).toBe(
      straight?.getVertexBuffer("position")?.getWrapperBuffer()
    )
  })

  it("tags grass and trees with how freely they sway in the wind, and nothing else", () => {
    const grass = [
      "Gen_Env_Grass_01",
      "Gen_Env_Grass_02",
      "Gen_Env_Grass_03",
      "Gen_Env_Grass_Tall_01",
      "Gen_Env_Grass_Tall_02"
    ]
    const trees = ["Env_Tree_Dead_04", "Gen_Env_Tree_Dead_01", "Gen_Env_Tree_Dead_02", "Gen_Env_Tree_Dead_03"]
    const { kit } = kitOf([...grass, ...trees, ...TRENCH_PIECES.straights])
    // A meadow with a tree in it, and the trench beside it.
    const meadow = {
      ...createFlatMap({ name: "meadow", cellSize: 0.5, columns: 160, rows: 160 }, 5, Surface.Grass),
      scenery: [{ kind: "tree" as const, x: 40, z: 60, heading: 0, variant: 0, scale: 1 }]
    }
    const dressing = dressBattlefield(meadow, kit)
    const trench = dressBattlefield(trenchMap(), kit)
    const swayOf = (pieces: readonly string[]) =>
      new Set(
        dressing.scenery.batches
          .filter((batch) => pieces.includes(batch.piece))
          .map((batch) => batch.mesh.metadata?.sway)
      )

    expect(swayOf(grass)).toEqual(new Set([1]))
    expect(swayOf(trees)).toEqual(new Set([0.25]))
    const straight = trench.scenery.batches.find((batch) => batch.piece === TRENCH_PIECES.straights[0])
    expect(straight?.mesh.metadata).toBeNull()
  })

  it("lays the map's railways, keeping the grass off their track, and runs them on beyond the sector given the ground", () => {
    const grass = ["Gen_Env_Grass_01", "Gen_Env_Grass_02", "Gen_Env_Grass_03"]
    const { kit } = kitOf([...grass, RAILWAY_PIECES.track, RAILWAY_PIECES.worn])
    // A meadow with a line across it from its west edge.
    const meadow = {
      ...createFlatMap({ name: "meadow", cellSize: 0.5, columns: 160, rows: 160 }, 5, Surface.Grass),
      railways: [
        {
          points: [
            [0, 40],
            [70, 40]
          ] as const
        }
      ]
    }
    const dressing = dressBattlefield(meadow, kit)
    const tufts = dressing.placements.filter((placement) => grass.includes(placement.piece))
    const track = (placements: readonly { readonly piece: string; readonly x: number }[]) =>
      placements.filter((placement) => placement.piece.startsWith("Railway_Track"))

    expect(tufts.length).toBeGreaterThan(100)
    expect(tufts.every((tuft) => tuft.x > 71.2 || Math.abs(tuft.z - 40) > 1.2)).toBe(true)
    expect(track(dressing.placements)).toHaveLength(28)
    const runOn = track(dressBattlefield(meadow, kit, () => 4).placements)
    expect(Math.min(...runOn.map((panel) => panel.x))).toBeLessThan(-290)
  })

  it("stands pieces modelled off their middle on their middle", () => {
    const { kit } = kitOf([])
    const dressing = dressBattlefield(trenchMap(), kit)
    const [ruin] = dressing.scenery.batches
    const centre = ruin?.mesh.getBoundingInfo().boundingBox.centerWorld

    expect(centre?.x).toBeCloseTo(40)
    expect(centre?.z).toBeCloseTo(60)
    expect(dressing.missing.has(TRENCH_PIECES.end)).toBe(true)
  })
})

describe("dressLevel", () => {
  function view(kit: { scene: Scene }) {
    const map = trenchMap()
    const groundMaterial = new StandardMaterial("ground", kit.scene)
    const terrain = createTerrainChunks(kit.scene, map, { material: groundMaterial, surfaceColors })
    const camera = new ArcRotateCamera("camera", 0, 1, 60, new Vector3(30, 0, 30), kit.scene)
    return { map, view: { scene: kit.scene, camera, groundMaterial, terrain } }
  }

  it("leaves the greybox alone when the kit isn't available", async () => {
    const { map, view: battlefield } = view(kitOf([]))
    vi.mocked(loadLevelKit).mockResolvedValueOnce(null)

    await expect(dressLevel(battlefield, map)).resolves.toBeNull()
    expect(battlefield.groundMaterial.pluginManager?.getPlugin("GroundSplat") ?? null).toBeNull()
  })

  it("textures the ground, shapes it under the kit and places the props", async () => {
    const { kit, scene } = kitOf([TRENCH_PIECES.end])
    const { map, view: battlefield } = view({ scene })
    const shape = vi.spyOn(battlefield.terrain, "shapeForTrenchKit")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.mocked(loadLevelKit).mockResolvedValueOnce(kit)

    const dressing = await dressLevel(battlefield, map)

    expect(dressing?.scenery.batches.length).toBeGreaterThan(0)
    expect(battlefield.groundMaterial.pluginManager?.getPlugin("GroundSplat")).toBeTruthy()
    expect(shape).toHaveBeenCalledOnce()
    // Every frame picks each batch's detail by the camera's distance, before the scene culls them.
    const scenery = dressing?.scenery
    if (!scenery) {
      throw new Error("the level should be dressed")
    }
    const update = vi.spyOn(scenery, "update")
    scene.render()
    expect(update).toHaveBeenCalledWith(battlefield.camera.globalPosition)
    // Particle systems with nothing to draw are paused: the smoke shells leave, before any has burst.
    expect(dressing?.aftermath.smoke.paused).toBe(true)
    // The depth of field blurs by the ground's depth alone, props and all.
    const depth = scene.enableDepthRenderer(battlefield.camera).getDepthMap()
    const ground = scene.meshes.filter((mesh) => mesh.name.startsWith("terrain-"))
    const end = new Mesh(`${TRENCH_PIECES.end}@0,0`, scene)
    expect(ground.length).toBeGreaterThan(0)
    expect(depth.getCustomRenderList?.(0, [...ground, end], ground.length + 1)).toEqual(ground)
    // The stand-in kit has no straight sections, so it warns which pieces are missing.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("missing"),
      expect.arrayContaining([TRENCH_PIECES.straights[0]])
    )
    // Without the simulation's wire, the wire's art goes with the craters.
    expect(dressing?.wire).toBeNull()
  })

  it("hands over the sound effects only once the ambience has started, so the battle starts with all its sound", async () => {
    const { kit, scene } = kitOf([])
    const { map, view: battlefield } = view({ scene })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    let ambienceCame: (audio: null) => void = () => undefined
    const effects = new Map()
    vi.mocked(loadLevelKit).mockResolvedValueOnce({
      ...kit,
      audio: new Promise((resolve) => (ambienceCame = resolve)),
      sfx: Promise.resolve(effects)
    })
    const dressing = await dressLevel(battlefield, map)
    let handed = false
    void dressing?.sfx.then(() => (handed = true))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(handed).toBe(false)

    ambienceCame(null)
    await expect(dressing?.sfx).resolves.toBe(effects)
  })

  it("lets the rain wash the scorch away, and the snow not", async () => {
    const { kit, scene } = kitOf([])
    const { map, view: battlefield } = view({ scene })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.mocked(loadLevelKit).mockResolvedValueOnce(kit)
    const falling = { precipitation: 400, snowFraction: 0 }
    const dressing = await dressLevel(battlefield, map, { weather: () => falling })
    const scorch = dressing?.scorch
    if (!scorch) {
      throw new Error("the level should be dressed")
    }
    const wash = vi.spyOn(scorch, "wash")
    vi.spyOn(scene.getEngine(), "getDeltaTime").mockReturnValue(1000)

    scene.render()
    expect(wash).toHaveBeenCalledOnce()
    falling.snowFraction = 1
    scene.render()
    expect(wash).toHaveBeenCalledOnce()
  })

  it("keeps the wire's art in step with the simulation's wire, when it's given it", async () => {
    const { kit, scene } = kitOf(["Prop_Wire_Fence_01", "Prop_Wire_Fence_02"])
    const { map, view: battlefield } = view({ scene })
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    vi.mocked(loadLevelKit).mockResolvedValueOnce(kit)
    const field = { columns: 1, rows: 1, density: new Float32Array(1), staked: new Float32Array(1), cuts: 0 }

    const dressing = await dressLevel(
      battlefield,
      {
        ...map,
        wire: [
          {
            points: [
              [10, 50],
              [40, 50]
            ]
          }
        ]
      },
      {
        wire: () => field
      }
    )
    const sync = vi.spyOn(dressing?.wire ?? { sync: () => undefined }, "sync")
    scene.render()
    scene.render()
    field.cuts++
    scene.render()

    expect(dressing?.wire?.strands).toBeGreaterThan(0)
    // Once at the start, and again each time the wire is cut or mended.
    expect(sync).toHaveBeenCalledTimes(2)
  })
})
