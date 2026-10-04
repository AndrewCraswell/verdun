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
import {
  capturedIds,
  type EntityId,
  fallenIds,
  GAS_INTERVAL,
  Side,
  type Simulation,
  soldierIds,
  Stance
} from "@verdun/sim"
import { type CloudPuffs, createGasCloud, createSmokeCloud, type GasCloud } from "./effects/gas-cloud.ts"
import { palette, surfaceColors } from "./palette.ts"
import { createTerrainChunks, type TerrainChunks } from "./terrain/terrain-chunks.ts"

/** Camera looks down at about 57 degrees below the horizon: angled top-down, like Company of Heroes. */
export const CAMERA_TILT_DEGREES = 57
const CAMERA_BETA = ((90 - CAMERA_TILT_DEGREES) * Math.PI) / 180
const SOLDIER_HEIGHT = 1.8

export interface BattlefieldView {
  readonly scene: Scene
  readonly camera: ArcRotateCamera
  readonly terrain: TerrainChunks
  /** The ground material, for effects layered on the terrain such as fog of war. */
  readonly groundMaterial: StandardMaterial
  /** Placeholder soldier meshes, one per side, drawn as thin instances. */
  readonly soldierMeshes: Readonly<Record<Side, Mesh>>
  /** The fallen, lying where they dropped, one mesh per side. */
  readonly fallenMeshes: Readonly<Record<Side, Mesh>>
  /** Prisoners on their way to the rear, by the side they fought for. */
  readonly prisonerMeshes: Readonly<Record<Side, Mesh>>
  /** Gas drifting over the ground; it redraws itself as the simulation moves the cloud. */
  readonly gas: GasCloud
  /** Shell smoke and dust drifting and thinning: the curtain a barrage throws up. */
  readonly smoke: CloudPuffs
  /**
   * Copies soldier positions from the simulation into the render meshes. Call after stepping, or when what is visible
   * changes. Soldiers failing `isShown` (enemies out of sight) aren't drawn.
   */
  syncSoldiers(isShown?: (soldier: EntityId) => boolean): void
  /**
   * Hands drawing the soldiers to another renderer, such as animated character models, and hides the capsules. From
   * then on `syncSoldiers` passes straight through to it.
   */
  useSoldierRenderer(renderer: SoldierRenderer): void
}

/** Something that draws the soldiers from the simulation's state. */
export interface SoldierRenderer {
  sync(isShown?: (soldier: EntityId) => boolean): void
}

export interface BattlefieldViewOptions {
  /** Render one terrain vertex every `terrainStep` map samples. */
  readonly terrainStep?: number
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

const SOLDIER_RADIUS = 0.28

function createSoldierMesh(scene: Scene, name: string, color: Color3): Mesh {
  const mesh = CreateCapsule(`soldiers-${name}`, { height: SOLDIER_HEIGHT, radius: SOLDIER_RADIUS }, scene)
  const material = new StandardMaterial(`uniform-${name}`, scene)
  material.diffuseColor = color
  material.specularColor = Color3.Black()
  mesh.material = material
  // Thin instances share one bounding box; skip culling until per-soldier instancing lands in M7.
  mesh.alwaysSelectAsActiveMesh = true
  mesh.thinInstanceCount = 0
  return mesh
}

/** Thin-instance matrices for one mesh, refilled every sync. */
interface SoldierBatch {
  count: number
  reserve(capacity: number): void
  /** Adds a soldier standing upright, or lying along the north-south axis when prone or fallen. */
  add(x: number, y: number, z: number, lying: boolean): void
  flush(): void
}

function createBatch(mesh: Mesh): SoldierBatch {
  let matrices = new Float32Array(0)
  const batch: SoldierBatch = {
    count: 0,
    reserve(capacity) {
      if (matrices.length < capacity * 16) {
        matrices = new Float32Array(capacity * 16)
      }
    },
    add(x, y, z, lying) {
      // Column-major matrix: identity rotation, or a quarter turn about x to lay the capsule down.
      const offset = batch.count * 16
      matrices.fill(0, offset, offset + 16)
      matrices[offset] = 1
      matrices[offset + 5] = lying ? 0 : 1
      matrices[offset + 6] = lying ? 1 : 0
      matrices[offset + 9] = lying ? -1 : 0
      matrices[offset + 10] = lying ? 0 : 1
      matrices[offset + 12] = x
      matrices[offset + 13] = y
      matrices[offset + 14] = z
      matrices[offset + 15] = 1
      batch.count += 1
    },
    flush() {
      mesh.thinInstanceSetBuffer("matrix", matrices, 16, false)
      mesh.thinInstanceCount = batch.count
    }
  }
  return batch
}

export function createBattlefieldScene(
  engine: AbstractEngine,
  sim: Simulation,
  { terrainStep = 2, attachControl = false }: BattlefieldViewOptions = {}
): BattlefieldView {
  const scene = new Scene(engine)
  scene.clearColor = palette.sky
  scene.fogMode = Scene.FOGMODE_EXP2
  scene.fogDensity = 0.0011
  scene.fogColor = palette.fog

  const camera = createCamera(scene, sim)
  if (attachControl) {
    camera.attachControl(true)
    // Rotate with the middle button: the left fires and the right gives orders.
    const pointers = camera.inputs.attached["pointers"]
    if (pointers && "buttons" in pointers) {
      pointers.buttons = [1]
    }
  }

  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene)
  sky.diffuse = palette.skyLight
  sky.groundColor = palette.groundLight
  sky.intensity = 0.75
  const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, 0.3), scene)
  sun.intensity = 0.45

  // Matte ground: surface colours come from the terrain's vertex colours.
  const groundMaterial = new StandardMaterial("ground", scene)
  groundMaterial.specularColor = Color3.Black()
  const terrain = createTerrainChunks(scene, sim.map, {
    material: groundMaterial,
    surfaceColors,
    renderStep: terrainStep
  })

  const gas = createGasCloud(scene, sim, groundMaterial)
  const smoke = createSmokeCloud(scene, sim)
  // Clouds move a few times a second in the simulation: redraw them when it has stepped on, not every frame.
  let gasDrawnAt = -1
  scene.onBeforeRenderObservable.add(() => {
    if (sim.tick - gasDrawnAt >= GAS_INTERVAL) {
      gasDrawnAt = sim.tick
      gas.update()
      smoke.update()
    }
  })

  const soldierMeshes = {
    [Side.French]: createSoldierMesh(scene, "french", palette.horizonBlue),
    [Side.German]: createSoldierMesh(scene, "german", palette.feldgrau)
  }
  const fallenMeshes = {
    [Side.French]: createSoldierMesh(scene, "french-fallen", palette.horizonBlue.scale(0.55)),
    [Side.German]: createSoldierMesh(scene, "german-fallen", palette.feldgrau.scale(0.55))
  }
  // Prisoners walking to the rear: their uniform, faded, so they read apart from the fighting.
  const prisonerMeshes = {
    [Side.French]: createSoldierMesh(scene, "french-prisoners", Color3.Lerp(palette.horizonBlue, Color3.White(), 0.55)),
    [Side.German]: createSoldierMesh(scene, "german-prisoners", Color3.Lerp(palette.feldgrau, Color3.White(), 0.55))
  }
  const batches = new Map<Mesh, SoldierBatch>(
    [...Object.values(soldierMeshes), ...Object.values(fallenMeshes), ...Object.values(prisonerMeshes)].map((mesh) => [
      mesh,
      createBatch(mesh)
    ])
  )

  function sideOf(soldier: EntityId): Side {
    return sim.soldiers.side.value[soldier] === Side.German ? Side.German : Side.French
  }

  let renderer: SoldierRenderer | null = null

  function useSoldierRenderer(replacement: SoldierRenderer): void {
    renderer = replacement
    for (const mesh of batches.keys()) {
      mesh.setEnabled(false)
    }
    renderer.sync()
  }

  function syncSoldiers(isShown?: (soldier: EntityId) => boolean): void {
    if (renderer) {
      renderer.sync(isShown)
      return
    }
    const { position } = sim.soldiers
    const living = soldierIds(sim)
    const fallen = fallenIds(sim)
    const captured = capturedIds(sim)
    for (const batch of batches.values()) {
      batch.count = 0
      batch.reserve(living.length + fallen.length + captured.length)
    }

    for (const soldier of living) {
      const stance = sim.soldiers.stance.value[soldier]
      // Men down a dugout are underground: nothing to draw.
      if (stance === Stance.Sheltering || (isShown && !isShown(soldier))) {
        continue
      }
      const x = position.x[soldier]
      const z = position.z[soldier]
      const ground = heightAt(sim.map, x, z)
      const batch = batches.get(soldierMeshes[sideOf(soldier)])
      if (stance === Stance.Prone) {
        batch?.add(x, ground + SOLDIER_RADIUS, z, true)
      } else {
        batch?.add(x, ground + SOLDIER_HEIGHT / 2, z, false)
      }
    }
    for (const soldier of captured) {
      const x = position.x[soldier]
      const z = position.z[soldier]
      batches.get(prisonerMeshes[sideOf(soldier)])?.add(x, heightAt(sim.map, x, z) + SOLDIER_HEIGHT / 2, z, false)
    }
    for (const soldier of fallen) {
      const x = position.x[soldier]
      const z = position.z[soldier]
      batches.get(fallenMeshes[sideOf(soldier)])?.add(x, heightAt(sim.map, x, z) + SOLDIER_RADIUS, z, true)
    }
    for (const batch of batches.values()) {
      batch.flush()
    }
  }

  syncSoldiers()
  return {
    scene,
    camera,
    terrain,
    groundMaterial,
    soldierMeshes,
    fallenMeshes,
    prisonerMeshes,
    gas,
    smoke,
    syncSoldiers,
    useSoldierRenderer
  }
}
