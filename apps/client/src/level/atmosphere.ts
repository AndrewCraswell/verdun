import type { Camera } from "@babylonjs/core/Cameras/camera"
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent"
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator"
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves"
import type { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Particles/particleSystemComponent"
import type { Scene } from "@babylonjs/core/scene"
import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"

/** Effect sprites from the level kit. */
export interface EffectSprites {
  readonly smoke: Texture
  readonly mist: Texture
}

export interface Atmosphere {
  /** Null where the engine can't draw cascaded shadows. */
  readonly shadows: CascadedShadowGenerator | null
  /** Smoke rising from burning ruins and wrecks. */
  readonly smoke: ParticleSystem
  /** Mist lying in the low ground. */
  readonly mist: ParticleSystem
  dispose(): void
}

/**
 * Shadows only near the camera, where they show, from the pieces big enough to cast one that reads: trench walls,
 * trees, ruins, guns, soldiers, the ground itself. Above `cameraHeight` the sector is too small on screen for shadows
 * to show, so none are drawn.
 */
const SHADOW = { mapSize: 2048, cascades: 2, maxZ: 160, darkness: 0.42, cameraHeight: 190 } as const
/**
 * Pieces not worth drawing again for every cascade: too small or flat for a shadow that reads, or, like the trench kit,
 * already shadowed by the carved ground beneath them, whose trench walls cast the same shadow.
 */
const NO_SHADOW =
  /Env_Trench_Deep|Sandbag_Wall_Long|Planks|Firestep|Wire_Fence|Gen_Prop|Iron_Sheet|Spade|Shards|Branch|Brick_Debris|Rubble|Crater_Water|Ladder|Barricade|Stump|Log|Pole|death-map/

/** Wind out of the west, carrying smoke and mist east, until the weather's wind takes over (see `environment/`). */
const WIND = new Vector3(0.12, 0, 0.03)

const isSun = (light: unknown): light is DirectionalLight => light instanceof DirectionalLight
const isSky = (light: unknown): light is HemisphericLight => light instanceof HemisphericLight

/** One colour grade over everything: desaturated, a touch of contrast, warm highlights and cool shadows. */
function grade(scene: Scene): void {
  const processing = scene.imageProcessingConfiguration
  processing.contrast = 1.14
  processing.exposure = 1.18
  const curves = new ColorCurves()
  curves.globalSaturation = -18
  curves.highlightsHue = 38
  curves.highlightsDensity = 18
  curves.shadowsHue = 215
  curves.shadowsDensity = 22
  processing.colorCurves = curves
  processing.colorCurvesEnabled = true
  processing.vignetteEnabled = true
  processing.vignetteWeight = 0.7
  processing.vignetteColor = new Color4(0.05, 0.04, 0.03, 0)
}

export function castsShadow(mesh: AbstractMesh): boolean {
  // Instances are named after their piece: "Prop_Ladder_01#123".
  return mesh.isEnabled() && !NO_SHADOW.test(mesh.name.split("#")[0] ?? mesh.name)
}

function createShadows(
  scene: Scene,
  map: BattlefieldMap,
  sun: DirectionalLight,
  camera: Camera
): CascadedShadowGenerator | null {
  if (!CascadedShadowGenerator.IsSupported) {
    return null
  }
  const shadows = new CascadedShadowGenerator(SHADOW.mapSize, sun)
  shadows.numCascades = SHADOW.cascades
  shadows.shadowMaxZ = SHADOW.maxZ
  shadows.lambda = 0.85
  shadows.stabilizeCascades = true
  shadows.bias = 0.003
  shadows.normalBias = 0.02
  shadows.filteringQuality = CascadedShadowGenerator.QUALITY_MEDIUM
  shadows.usePercentageCloserFiltering = true
  shadows.depthClamp = true
  shadows.setDarkness(SHADOW.darkness)
  shadows.camera = camera
  // Nothing moves but soldiers and smoke, so the casters' extent is the whole map, fixed: no need to measure it.
  shadows.shadowCastersBoundingInfo = new BoundingInfo(
    new Vector3(0, -30, 0),
    new Vector3(mapWidth(map), 60, mapDepth(map))
  )
  shadows.freezeShadowCastersBoundingInfo = true
  const shadowMap = shadows.getShadowMap()
  // The ground casts too: craters, the ravine and trench walls shade themselves.
  const casters = scene.meshes.filter(castsShadow)
  const onNewMesh = (mesh: AbstractMesh) => {
    mesh.receiveShadows = true
    if (castsShadow(mesh)) {
      casters.push(mesh)
    }
  }
  scene.meshes.forEach((mesh) => {
    mesh.receiveShadows = true
  })
  scene.onNewMeshAddedObservable.add(onNewMesh)
  scene.onMeshRemovedObservable.add((mesh) => {
    const index = casters.indexOf(mesh)
    if (index >= 0) {
      casters.splice(index, 1)
    }
  })
  if (shadowMap) {
    shadowMap.renderList = casters
    const none: AbstractMesh[] = []
    scene.onBeforeRenderObservable.add(() => {
      shadowMap.renderList = camera.globalPosition.y > SHADOW.cameraHeight ? none : casters
    })
  }
  return shadows
}

/** Where smoke rises: about one ruin in four still burning, and every wreck. */
function smokeSources(map: BattlefieldMap): Vector3[] {
  let ruins = 0
  const sources: Vector3[] = []
  for (const item of map.scenery) {
    const wreck = item.kind === "wrecked-plane" || item.kind === "wrecked-gun"
    if ((item.kind === "ruin" && ruins++ % 4 === 0) || wreck) {
      sources.push(new Vector3(item.x, heightAt(map, item.x, item.z) + 1, item.z))
    }
  }
  return sources
}

/** Hollows where mist gathers: ground well below the ground around it, sampled every 16 m. */
function mistSpots(map: BattlefieldMap): Vector3[] {
  const spots: Vector3[] = []
  const step = 16
  for (let z = step; z < mapDepth(map) - step; z += step) {
    for (let x = step; x < mapWidth(map) - step; x += step) {
      const here = heightAt(map, x, z)
      let around = 0
      for (const [dx, dz] of [
        [-24, 0],
        [24, 0],
        [0, -24],
        [0, 24]
      ] as const) {
        around += heightAt(map, x + dx, z + dz)
      }
      if (here < around / 4 - 1.2) {
        spots.push(new Vector3(x, here, z))
      }
    }
  }
  return spots
}

/** A particle system emitting from a random one of `sources`, jittered by `spread` metres. */
function emitFrom(system: ParticleSystem, sources: readonly Vector3[], spread: number, lift: [number, number]): void {
  system.startPositionFunction = (_world, position) => {
    const source = sources[Math.floor(Math.random() * sources.length)] ?? Vector3.Zero()
    position.set(
      source.x + (Math.random() - 0.5) * spread,
      source.y + lift[0] + Math.random() * (lift[1] - lift[0]),
      source.z + (Math.random() - 0.5) * spread
    )
  }
}

function createSmoke(scene: Scene, texture: Texture, sources: readonly Vector3[]): ParticleSystem {
  const smoke = new ParticleSystem("smoke", 60 * Math.max(1, sources.length), scene)
  smoke.particleTexture = texture
  smoke.emitter = Vector3.Zero()
  emitFrom(smoke, sources, 3, [0, 1.5])
  smoke.color1 = new Color4(0.22, 0.21, 0.2, 0.42)
  smoke.color2 = new Color4(0.3, 0.29, 0.27, 0.36)
  smoke.colorDead = new Color4(0.45, 0.45, 0.44, 0)
  // Thickest just above the fire, thinning and greying as it climbs and spreads.
  smoke.addColorGradient(0, new Color4(0.2, 0.19, 0.18, 0))
  smoke.addColorGradient(0.1, new Color4(0.22, 0.21, 0.2, 0.42))
  smoke.addColorGradient(0.6, new Color4(0.34, 0.33, 0.31, 0.24))
  smoke.addColorGradient(1, new Color4(0.45, 0.45, 0.44, 0))
  // Size gradients are the size itself, in metres; each particle varies by its scale.
  smoke.addSizeGradient(0, 1.5)
  smoke.addSizeGradient(1, 9)
  smoke.minScaleX = 0.75
  smoke.maxScaleX = 1.25
  smoke.minScaleY = 0.75
  smoke.maxScaleY = 1.25
  smoke.minLifeTime = 9
  smoke.maxLifeTime = 15
  smoke.emitRate = 1.4 * sources.length
  smoke.direction1 = new Vector3(0.1, 1, -0.1)
  smoke.direction2 = new Vector3(0.4, 1.4, 0.2)
  smoke.minEmitPower = 0.7
  smoke.maxEmitPower = 1.2
  smoke.gravity = WIND.scale(1.5)
  smoke.minAngularSpeed = -0.15
  smoke.maxAngularSpeed = 0.15
  smoke.minInitialRotation = 0
  smoke.maxInitialRotation = Math.PI * 2
  smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD
  smoke.preWarmCycles = 300
  smoke.preWarmStepOffset = 5
  return smoke
}

function createMist(scene: Scene, texture: Texture, spots: readonly Vector3[]): ParticleSystem {
  const mist = new ParticleSystem("mist", 6 * Math.max(1, spots.length), scene)
  mist.particleTexture = texture
  mist.emitter = Vector3.Zero()
  emitFrom(mist, spots, 14, [0.6, 2])
  mist.color1 = new Color4(0.78, 0.79, 0.78, 0.09)
  mist.color2 = new Color4(0.7, 0.71, 0.7, 0.06)
  mist.colorDead = new Color4(0.75, 0.76, 0.75, 0)
  mist.minSize = 10
  mist.maxSize = 20
  mist.minLifeTime = 24
  mist.maxLifeTime = 40
  mist.emitRate = 0.18 * spots.length
  mist.direction1 = new Vector3(-0.1, 0, -0.1)
  mist.direction2 = new Vector3(0.1, 0.02, 0.1)
  mist.minEmitPower = 0.1
  mist.maxEmitPower = 0.3
  mist.gravity = WIND.scale(0.4)
  mist.blendMode = ParticleSystem.BLENDMODE_STANDARD
  mist.preWarmCycles = 400
  mist.preWarmStepOffset = 10
  return mist
}

/**
 * The sector's air: cascaded shadows from the sun (or moon), one colour grade, smoke drifting from burning ruins and
 * wrecks, and mist lying in the hollows. Where the sun and moon are, and how bright the light, the fog and the shadows
 * are, follow the simulation's clock and weather each frame (see `environment/daylight.ts`).
 */
export function createAtmosphere(
  scene: Scene,
  map: BattlefieldMap,
  camera: Camera,
  sprites: EffectSprites
): Atmosphere | null {
  const sun = scene.lights.find(isSun)
  const sky = scene.lights.find(isSky)
  if (!sun || !sky) {
    return null
  }
  grade(scene)

  const shadows = createShadows(scene, map, sun, camera)
  // The soft spot rather than Synty's faceted puff: drawn many times over, the puff's hard edges show as discs.
  const smoke = createSmoke(scene, sprites.mist, smokeSources(map))
  const mist = createMist(scene, sprites.mist, mistSpots(map))
  smoke.start()
  mist.start()
  return {
    shadows,
    smoke,
    mist,
    dispose() {
      smoke.dispose()
      mist.dispose()
      shadows?.dispose()
    }
  }
}
