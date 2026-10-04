import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateCapsule } from "@babylonjs/core/Meshes/Builders/capsuleBuilder"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import "@babylonjs/core/Meshes/thinInstanceMesh"
import { Scene } from "@babylonjs/core/scene"
import { heightAt, mapDepth, mapWidth } from "@verdun/map"
import { Side, type Simulation, soldierIds } from "@verdun/sim"
import { palette } from "./palette.ts"
import { createGroundMaterial, loadGroundLayers } from "./terrain/ground-material.ts"
import { createTerrainChunks, type TerrainChunks } from "./terrain/terrain-chunks.ts"
import type { SplatLayers } from "./terrain/terrain-splat-plugin.ts"

/** Camera looks down at about 57 degrees below the horizon: angled top-down, like Company of Heroes. */
export const CAMERA_TILT_DEGREES = 57
const CAMERA_BETA = ((90 - CAMERA_TILT_DEGREES) * Math.PI) / 180
const SOLDIER_HEIGHT = 1.8

export interface BattlefieldView {
  readonly scene: Scene
  readonly camera: ArcRotateCamera
  readonly terrain: TerrainChunks
  /** Placeholder soldier meshes, one per side, drawn as thin instances. */
  readonly soldierMeshes: Readonly<Record<Side, Mesh>>
  /** Copies soldier positions from the simulation into the render meshes. Call after stepping. */
  syncSoldiers(): void
}

export interface BattlefieldViewOptions {
  /** Render one terrain vertex every `terrainStep` map samples. */
  readonly terrainStep?: number
  /** Ground textures. Loaded from the public texture folder when omitted. */
  readonly groundLayers?: SplatLayers
  /** Let mouse and keyboard drive the camera. Off for headless tests. */
  readonly attachControl?: boolean
}

function createCamera(scene: Scene, sim: Simulation): ArcRotateCamera {
  const centerX = mapWidth(sim.map) / 2
  const centerZ = mapDepth(sim.map) / 2
  const target = new Vector3(centerX, heightAt(sim.map, centerX, centerZ), centerZ)
  const camera = new ArcRotateCamera("camera", -Math.PI / 2, CAMERA_BETA, 260, target, scene)
  camera.lowerBetaLimit = CAMERA_BETA - 0.1
  camera.upperBetaLimit = CAMERA_BETA + 0.1
  camera.lowerRadiusLimit = 25
  camera.upperRadiusLimit = 500
  camera.wheelDeltaPercentage = 0.02
  camera.panningSensibility = 20
  camera.minZ = 0.5
  camera.maxZ = 2000
  return camera
}

function createSoldierMesh(scene: Scene, side: Side, color: Color3): Mesh {
  const name = side === Side.French ? "french" : "german"
  const mesh = CreateCapsule(`soldiers-${name}`, { height: SOLDIER_HEIGHT, radius: 0.28 }, scene)
  const material = new StandardMaterial(`uniform-${name}`, scene)
  material.diffuseColor = color
  material.specularColor = Color3.Black()
  mesh.material = material
  // Thin instances share one bounding box; skip culling until per-soldier instancing lands in M7.
  mesh.alwaysSelectAsActiveMesh = true
  mesh.thinInstanceCount = 0
  return mesh
}

export function createBattlefieldScene(
  engine: AbstractEngine,
  sim: Simulation,
  { terrainStep = 2, attachControl = false, groundLayers }: BattlefieldViewOptions = {}
): BattlefieldView {
  const scene = new Scene(engine)
  scene.clearColor = palette.sky
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogDensity = 0.0011
  scene.fogColor = palette.fog

  const camera = createCamera(scene, sim)
  if (attachControl) {
    camera.attachControl(true)
  }

  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene)
  sky.diffuse = palette.skyLight
  sky.groundColor = palette.groundLight
  sky.intensity = 0.75
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.3), scene)
  sun.intensity = 0.45

  const ground = createGroundMaterial(scene, groundLayers ?? loadGroundLayers(scene))
  const terrain = createTerrainChunks(scene, sim.map, { material: ground.material, renderStep: terrainStep })

  const soldierMeshes = {
    [Side.French]: createSoldierMesh(scene, Side.French, palette.horizonBlue),
    [Side.German]: createSoldierMesh(scene, Side.German, palette.feldgrau)
  }
  const matrices: Record<Side, Float32Array> = {
    [Side.French]: new Float32Array(0),
    [Side.German]: new Float32Array(0)
  }

  function syncSoldiers(): void {
    const { position, side } = sim.soldiers
    const ids = soldierIds(sim)
    const counts: Record<Side, number> = { [Side.French]: 0, [Side.German]: 0 }

    for (const soldierSide of [Side.French, Side.German]) {
      if (matrices[soldierSide].length < ids.length * 16) {
        matrices[soldierSide] = new Float32Array(ids.length * 16)
      }
    }

    for (const soldier of ids) {
      const soldierSide = side.value[soldier] === Side.German ? Side.German : Side.French
      const x = position.x[soldier]
      const z = position.z[soldier]
      const offset = counts[soldierSide] * 16
      const matrix = matrices[soldierSide]
      // Column-major translation matrix: identity rotation, capsule centre at half height above the ground.
      matrix.fill(0, offset, offset + 16)
      matrix[offset] = 1
      matrix[offset + 5] = 1
      matrix[offset + 10] = 1
      matrix[offset + 12] = x
      matrix[offset + 13] = heightAt(sim.map, x, z) + SOLDIER_HEIGHT / 2
      matrix[offset + 14] = z
      matrix[offset + 15] = 1
      counts[soldierSide] += 1
    }

    for (const soldierSide of [Side.French, Side.German]) {
      const mesh = soldierMeshes[soldierSide]
      mesh.thinInstanceSetBuffer("matrix", matrices[soldierSide], 16, false)
      mesh.thinInstanceCount = counts[soldierSide]
    }
  }

  syncSoldiers()
  return { scene, camera, terrain, soldierMeshes, syncSoldiers }
}
