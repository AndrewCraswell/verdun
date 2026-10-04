import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import type { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import { carveTrenches, createFlatMap, type Trench } from "@verdun/map"
import { afterEach, describe, expect, it, vi } from "vitest"
import { surfaceColors } from "../palette.ts"
import { createTerrainChunks } from "../terrain/terrain-chunks.ts"
import { dressBattlefield, dressLevel, placementMatrix } from "./dress-battlefield.ts"
import { type LevelKit, loadLevelKit } from "./level-kit.ts"
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
      fx: { smoke: ground, mist: ground },
      audio: null
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
    scenery: [{ kind: "ruin" as const, x: 40, z: 60, heading: 0, variant: 0, scale: 1 }]
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

describe("dressBattlefield", () => {
  it("instances a kit piece for every placement, and reports pieces the kit lacks", () => {
    const { kit } = kitOf(Object.values(TRENCH_PIECES).flat())
    const dressing = dressBattlefield(trenchMap(), kit)

    expect(dressing.instances.length).toBeGreaterThan(20)
    expect(dressing.instances.every((instance) => instance.isWorldMatrixFrozen)).toBe(true)
    expect(dressing.missing.has("Bld_City_Destroyed_01")).toBe(false)
    // Sources draw only through their instances.
    const straight = kit.pieces.get(TRENCH_PIECES.straights[0])
    expect(straight?.isEnabled()).toBe(true)
    expect(straight?.isVisible).toBe(false)
  })

  it("stands pieces modelled off their middle on their middle", () => {
    const { kit } = kitOf([])
    const dressing = dressBattlefield(trenchMap(), kit)
    const [ruin] = dressing.instances
    ruin?.computeWorldMatrix(true)
    const centre = ruin?.getBoundingInfo().boundingBox.centerWorld

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

    expect(dressing?.instances.length).toBeGreaterThan(0)
    expect(battlefield.groundMaterial.pluginManager?.getPlugin("GroundSplat")).toBeTruthy()
    expect(shape).toHaveBeenCalledOnce()
    // The stand-in kit has no straight sections, so it warns which pieces are missing.
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("missing"),
      expect.arrayContaining([TRENCH_PIECES.straights[0]])
    )
  })
})
