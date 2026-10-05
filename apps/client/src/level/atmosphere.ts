import type { Camera } from "@babylonjs/core/Cameras/camera"
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent"
import { CascadedShadowGenerator } from "@babylonjs/core/Lights/Shadows/cascadedShadowGenerator"
import { ColorCurves } from "@babylonjs/core/Materials/colorCurves"
import type { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { type Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Frustum } from "@babylonjs/core/Maths/math.frustum"
import type { Plane } from "@babylonjs/core/Maths/math.plane"
import { type Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import "@babylonjs/core/Particles/particleSystemComponent"
import type { Scene } from "@babylonjs/core/scene"
import type { Immutable, Nullable } from "@babylonjs/core/types"
import { type BattlefieldMap, heightAt, mapDepth, mapWidth } from "@verdun/map"
import { trimCascadeVaryings } from "../render/cascade-varyings.ts"
import { displaySettings } from "../settings/display.ts"

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
  /** Grades the picture for how the air is lit now (see particle-light.ts's airLight): blue at night. */
  update(light: Color3): void
  /**
   * Builds, while the battle loads, the shaders for the sector seen from high up, without the sun's shadows (see
   * `SunShadows`). Done at once where there are no shadows.
   */
  warmUp(): Promise<void>
  dispose(): void
}

/**
 * Shadows only near the camera, where they show, from the pieces big enough to cast one that reads: trench walls,
 * trees, ruins, guns, soldiers, the ground itself. With the camera over `offAbove` metres up the sector is too small on
 * screen for shadows to show, so the sun casts none and nothing pays to receive them, until it comes back below
 * `onBelow`: the gap keeps a camera hovering about the height from switching every material's shader back and forth.
 */
const SHADOW = { mapSize: 2048, cascades: 2, maxZ: 160, darkness: 0.42, offAbove: 200, onBelow: 180 } as const
/**
 * Pieces not worth drawing again for every cascade: too small or flat for a shadow that reads (grass, the litter of
 * battle, planks, tiles and the railway's track), or, like the trench kit, already shadowed by the carved ground
 * beneath them, whose trench walls cast the same shadow. And the ground beyond the sector with its far woods (see
 * dress-battlefield.ts), further off than shadows reach: spread over three kilometres, they were seven tenths of every
 * cascade's triangles.
 */
const NO_SHADOW =
  /Env_Trench_Deep|Sandbag_Wall_Long|Planks?_|Firestep|Wire_Fence|Gen_Prop|Iron_Sheet|Spade|Shards|Branch|Brick_Debris|Rubble|Crater_Water|Ladder|Barricade|Stump|Log|Pole|death-map|Grass|Helmet|Rifle|Prop_Shell|Env_Sandbag_0|Pack|Canteen|Stretcher|Tile|Gas_Curtain|RoadSign|Fireplace|Railway_Track|^backdrop$|^backdrop-far-/

/** Wind out of the west, carrying smoke and mist east, until the weather's wind takes over (see `environment/`). */
const WIND = new Vector3(0.12, 0, 0.03)

const isSun = (light: unknown): light is DirectionalLight => light instanceof DirectionalLight
const isSky = (light: unknown): light is HemisphericLight => light instanceof HemisphericLight

/** The grade's exposure by day. */
const EXPOSURE = 1.18
/**
 * At night the picture goes blue, as the eye sees by moonlight and as films shot day for night show it: brown earth
 * under a blue sky's light comes out grey, so the grade tints it, and lifts the exposure a little against the tint's
 * darkening. It comes in as the air's light falls from `dusk` to `night` (luminance against midday's), so the warm
 * haze of dawn and dusk is left alone.
 */
const NIGHT_GRADE = { hue: 222, density: 65, exposure: 0.15, dusk: 0.35, night: 0.12 } as const

/** One colour grade over everything: desaturated, a touch of contrast, warm highlights and cool shadows. */
function grade(scene: Scene): ColorCurves {
  const processing = scene.imageProcessingConfiguration
  processing.contrast = 1.14
  processing.exposure = EXPOSURE
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
  curves.globalHue = NIGHT_GRADE.hue
  return curves
}

/** How far into the night the air's light is: 0 by day and at dusk, 1 at night. */
export function nightness(light: Color3): number {
  const level = 0.2126 * light.r + 0.7152 * light.g + 0.0722 * light.b
  const t = Math.min(1, Math.max(0, (NIGHT_GRADE.dusk - level) / (NIGHT_GRADE.dusk - NIGHT_GRADE.night)))
  return t * t * (3 - 2 * t)
}

export function castsShadow(mesh: AbstractMesh): boolean {
  // Batches of kit pieces are named after their piece: "Prop_Ladder_01@2,3". Disabled meshes are templates.
  return mesh.isEnabled() && !NO_SHADOW.test(mesh.name)
}

/**
 * The backdrop's far woods (see dress-battlefield.ts) stand further off than shadows reach, so none ever falls on them:
 * receiving, their thousands of tiny triangles each carried the shadow cascades' work through the shader for nothing.
 */
const BEYOND_SHADOWS = /^backdrop-far-/

/** Whether shadows can fall on a mesh. */
export function receivesShadow(mesh: AbstractMesh): boolean {
  return !BEYOND_SHADOWS.test(mesh.name)
}

/** What culling to a cascade needs of the shadow generator: each cascade's view and projection from the sun. */
interface Cascades {
  getCascadeTransformMatrix(cascade: number): Nullable<Matrix>
}

/**
 * Babylon draws every shadow caster into every cascade. A cascade is the sun's view of one slice of the camera's, so a
 * caster outside that view can't shade anything in the slice: this keeps, for each cascade, only the casters its view
 * takes in, by its sides and its far end. Not by its near end, toward the sun: whatever stands between the sun and the
 * slice shades it, and depth clamping draws it. Meshes Babylon must never cull, like the soldiers' crowds, are kept.
 */
export function castersInCascade(
  shadows: Cascades
): (cascade: number, casters: Nullable<Immutable<AbstractMesh[]>>, count: number) => AbstractMesh[] {
  const planes: Plane[][] = []
  const kept: AbstractMesh[][] = []
  return (cascade, casters, count) => {
    const inView = (kept[cascade] ??= [])
    inView.length = 0
    const transform = shadows.getCascadeTransformMatrix(cascade)
    if (!casters || !transform) {
      return inView
    }
    const view = (planes[cascade] ??= Frustum.GetPlanes(transform))
    Frustum.GetPlanesToRef(transform, view)
    // The near end, toward the sun, the first of Babylon's six: nothing is ever outside it.
    const near = view[0]
    if (near) {
      near.normal.setAll(0)
      near.d = Number.MAX_VALUE
    }
    for (let index = 0; index < count; index++) {
      const mesh = casters[index]
      if (mesh && (mesh.alwaysSelectAsActiveMesh || mesh.isInFrustum(view))) {
        inView.push(mesh)
      }
    }
    return inView
  }
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
  trimCascadeVaryings()
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
    mesh.receiveShadows = receivesShadow(mesh)
    if (castsShadow(mesh)) {
      casters.push(mesh)
    }
  }
  scene.meshes.forEach((mesh) => {
    mesh.receiveShadows = receivesShadow(mesh)
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
    shadowMap.getCustomRenderList = castersInCascade(shadows)
  }
  return shadows
}

/** Whether the sun casts shadows for a camera this high, by whether it did until now (see `SHADOW`). */
export function sunCastsShadows(height: number, casting: boolean): boolean {
  return height < (casting ? SHADOW.offAbove : SHADOW.onBelow)
}

/** The sun's shadows, switched by the camera's height. */
export interface SunShadows {
  /**
   * Builds the shaders that draw the sector without the sun's shadows, as from high up, while the battle loads, and
   * draws a frame with them for the renderer to set them up, then lets the sun cast shadows again: the first climb
   * finds them built, rather than every material building its own at once. Resolves with the shaders for shadows
   * still to build: wait for the scene to be ready after it.
   */
  warmUp(): Promise<void>
  dispose(): void
}

/**
 * Switches the sun's shadows off with the camera high up and on again as it comes down (see `SHADOW`). Off, the
 * cascades aren't drawn and the materials take their shaders without shadows, where emptying the cascades of casters
 * still drew both, empty, and had every material read them for every pixel. Each switch changes every receiving
 * material's shader.
 */
export function switchSunShadows(scene: Scene, sun: DirectionalLight, camera: Camera): SunShadows {
  let casting = sun.shadowEnabled
  let held = false
  const cast = (on: boolean) => {
    casting = on
    sun.shadowEnabled = on
  }
  const observer = scene.onBeforeRenderObservable.add(() => {
    const on = sunCastsShadows(camera.globalPosition.y, casting)
    // Set only when the height calls for a change, so one made elsewhere holds, as scripts/perf.mjs's does.
    if (!held && on !== casting) {
      cast(on)
    }
  })
  return {
    async warmUp() {
      held = true
      sun.shadowEnabled = false
      await scene.whenReadyAsync()
      await new Promise<void>((resolve) => scene.onAfterRenderObservable.addOnce(() => resolve()))
      held = false
      cast(sunCastsShadows(camera.globalPosition.y, casting))
      // Babylon counts a material it found ready in a frame as ready for the rest of it, whatever changes since: a new
      // frame's count has the loading's next check find the shaders for shadows still to build.
      scene.incrementRenderId()
    },
    dispose() {
      observer.remove()
    }
  }
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
  const mist = new ParticleSystem("mist", 3 * Math.max(1, spots.length), scene)
  mist.particleTexture = texture
  mist.emitter = Vector3.Zero()
  emitFrom(mist, spots, 14, [0.6, 2])
  // A colour at birth fading to one at death, not gradients: Babylon copies a gradient's colours into each particle, so
  // only these reach the puffs already alive when the light changes (see particle-light.ts).
  mist.color1 = new Color4(0.78, 0.79, 0.78, 0.09)
  mist.color2 = new Color4(0.7, 0.71, 0.7, 0.06)
  mist.colorDead = new Color4(0.75, 0.76, 0.75, 0)
  // Half as many puffs as it once had, each about 1.4 times the size, cover the hollows as well: some 500 lie there at
  // all times, costing the page as much as a shell's burst.
  mist.minSize = 14
  mist.maxSize = 28
  mist.minLifeTime = 24
  mist.maxLifeTime = 40
  mist.emitRate = 0.09 * spots.length
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
  const curves = grade(scene)
  const processing = scene.imageProcessingConfiguration
  let night = 0
  // The player's brightness, from the options, over the grade's own exposure by day and night.
  let brightness = 1
  const expose = () => {
    processing.exposure = EXPOSURE * (1 + NIGHT_GRADE.exposure * night) * brightness
  }
  const unlistenDisplay = displaySettings().listen((settings) => {
    brightness = settings.brightness
    expose()
  })

  const shadows = createShadows(scene, map, sun, camera)
  const sunShadows = shadows ? switchSunShadows(scene, sun, camera) : null
  // The soft spot rather than Synty's faceted puff: drawn many times over, the puff's hard edges show as discs.
  const smoke = createSmoke(scene, sprites.mist, smokeSources(map))
  const mist = createMist(scene, sprites.mist, mistSpots(map))
  smoke.start()
  mist.start()
  return {
    shadows,
    smoke,
    mist,
    update(light) {
      const now = nightness(light)
      if (Math.abs(now - night) < 0.005) {
        return
      }
      night = now
      curves.globalDensity = NIGHT_GRADE.density * night
      expose()
    },
    async warmUp() {
      await sunShadows?.warmUp()
    },
    dispose() {
      unlistenDisplay()
      smoke.dispose()
      mist.dispose()
      sunShadows?.dispose()
      shadows?.dispose()
    }
  }
}
