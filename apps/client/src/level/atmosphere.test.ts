import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Mesh } from "@babylonjs/core/Meshes/mesh"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, type Scenery } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { nearestDepth, recordNearestDepth } from "../render/nearest-depth.ts"
import {
  cascadeEnd,
  castersInCascade,
  castsShadow,
  createAtmosphere,
  nightness,
  receivesShadow,
  shadowCasters,
  sunCastsShadows,
  switchSunShadows
} from "./atmosphere.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

const at = (kind: Scenery["kind"], x: number, z: number): Scenery => ({ kind, x, z, heading: 0, variant: 0, scale: 1 })

/** A field with a hollow in the middle for mist, a ruin and a wreck for smoke. */
function field() {
  const map = {
    ...createFlatMap({ name: "field", cellSize: 1, columns: 200, rows: 200 }, 10),
    scenery: [at("ruin", 50, 50), at("wrecked-plane", 120, 80)]
  }
  for (let row = 90; row <= 110; row++) {
    for (let column = 90; column <= 110; column++) {
      map.heights[row * 201 + column] = 6
    }
  }
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const camera = new ArcRotateCamera("camera", 0, 1, 60, new Vector3(100, 10, 100), scene)
  const sprites = { smoke: new Texture(null, scene), mist: new Texture(null, scene) }
  return { map, scene, camera, sprites }
}

describe("castsShadow", () => {
  it("lets solid pieces cast and skips the small, flat or already shadowed ones", () => {
    const { scene } = field()

    expect(castsShadow(CreateBox("Env_Tree_Dead_04#1", { size: 1 }, scene))).toBe(true)
    expect(castsShadow(CreateBox("Bld_City_Destroyed_01#3", { size: 1 }, scene))).toBe(true)
    expect(castsShadow(CreateBox("terrain-0-0", { size: 1 }, scene))).toBe(true)
    expect(castsShadow(CreateBox("Prop_Trench_Planks_01#2", { size: 1 }, scene))).toBe(false)
    expect(castsShadow(CreateBox("Env_Trench_Deep_Straight_01#4", { size: 1 }, scene))).toBe(false)
    // Batches of kit pieces, by their piece: a tree casts, grass and litter don't.
    expect(castsShadow(CreateBox("Gen_Env_Tree_Dead_02@1,2", { size: 1 }, scene))).toBe(true)
    expect(castsShadow(CreateBox("Gen_Env_Grass_01@1,2", { size: 1 }, scene))).toBe(false)
    expect(castsShadow(CreateBox("Chr_Attach_French_Helmet_01@0,0", { size: 1 }, scene))).toBe(false)
    // The ground beyond the sector and its far woods don't; the woods next to the sector do.
    expect(castsShadow(CreateBox("backdrop", { size: 1 }, scene))).toBe(false)
    expect(castsShadow(CreateBox("backdrop-far-Gen_Env_Tree_Dead_01", { size: 1 }, scene))).toBe(false)
    expect(castsShadow(CreateBox("backdrop-Gen_Env_Tree_Dead_01", { size: 1 }, scene))).toBe(true)
    // Flares and gunfire are drawn see-through, which a shadow map leaves out anyway.
    expect(castsShadow(CreateBox("flare-canopy-0", { size: 1 }, scene))).toBe(false)
    expect(castsShadow(CreateBox("flare-halo-11", { size: 1 }, scene))).toBe(false)
    expect(castsShadow(CreateBox("bullet-streaks", { size: 1 }, scene))).toBe(false)
    expect(castsShadow(CreateBox("tracer-rounds", { size: 1 }, scene))).toBe(false)
    expect(castsShadow(CreateBox("muzzle-flashes", { size: 1 }, scene))).toBe(false)
  })
})

describe("shadowCasters", () => {
  /** Babylon tells of meshes added a moment after they're made. */
  const told = () => new Promise((resolve) => setTimeout(resolve, 10))

  it("follows the casters as meshes come and go, and never keeps one disposed before Babylon told of it", async () => {
    const { scene } = field()
    const tree = CreateBox("Env_Tree_Dead_04#1", { size: 1 }, scene)
    const farWood = CreateBox("backdrop-far-Gen_Env_Tree_Dead_01", { size: 1 }, scene)
    await told()
    const casters = shadowCasters(scene)
    expect(casters).toEqual([tree])
    expect(farWood.receiveShadows).toBe(false)

    const ruin = CreateBox("Bld_City_Destroyed_01#3", { size: 1 }, scene)
    // A grenade's parts, merged as soon as they're made: gone before Babylon tells of them.
    const parts = [CreateBox("f1-body", { size: 1 }, scene), CreateBox("f1-igniter", { size: 1 }, scene)]
    const grenade = Mesh.MergeMeshes(parts, true)
    await told()
    expect(casters).toEqual([tree, ruin, grenade])
    expect(ruin.receiveShadows).toBe(true)

    tree.dispose()
    expect(casters).toEqual([ruin, grenade])
  })
})

describe("receivesShadow", () => {
  it("lets shadows fall on everything but the far woods, beyond where they reach", () => {
    const { scene } = field()

    expect(receivesShadow(CreateBox("terrain-0-0", { size: 1 }, scene))).toBe(true)
    expect(receivesShadow(CreateBox("backdrop-Gen_Env_Tree_Dead_01", { size: 1 }, scene))).toBe(true)
    expect(receivesShadow(CreateBox("backdrop-far-Gen_Env_Tree_Dead_01@2,3", { size: 1 }, scene))).toBe(false)
  })
})

/** A camera seeing from half a metre to two kilometres, looking `forward`. */
function looking(forward: Vector3) {
  return { minZ: 0.5, maxZ: 2000, getDirectionToRef: (_axis: Vector3, result: Vector3) => result.copyFrom(forward) }
}

/**
 * The sun's shadow figures (see atmosphere.ts), on a camera looking level toward the west, into a sun from the west
 * (`sunFrom`): every shadow falls straight toward it.
 */
const SPLIT = {
  numCascades: 2,
  lambda: 0.85,
  shadowMaxZ: 160,
  minDistance: 0,
  maxDistance: 1,
  camera: looking(new Vector3(-1, 0, 0))
} as const

/** The way the sun's light goes from `elevation` degrees up. */
function sunFrom(elevation: number): Vector3 {
  const radians = (elevation * Math.PI) / 180
  return new Vector3(Math.cos(radians), -Math.sin(radians), 0)
}

describe("cascadeEnd", () => {
  it("splits the view where Babylon does: the first slice ends about 20 m out, the last where shadows end", () => {
    expect(cascadeEnd(SPLIT, 0)).toBeCloseTo(19.64, 2)
    expect(cascadeEnd(SPLIT, 1)).toBeCloseTo(160)
    // Evenly, with lambda at 0.
    expect(cascadeEnd({ ...SPLIT, lambda: 0 }, 0)).toBeCloseTo(80.25)
    // A generator without a camera of its own follows whichever is drawing.
    expect(cascadeEnd({ ...SPLIT, camera: null }, 0)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe("castersInCascade", () => {
  // The sun overhead, looking down on twenty metres square from fifty up, a hundred deep.
  const transform = Matrix.LookAtLH(new Vector3(0, 50, 0), Vector3.Zero(), new Vector3(0, 0, 1)).multiply(
    Matrix.OrthoOffCenterLH(-10, 10, -10, 10, 0, 100)
  )

  it("keeps for a cascade the casters in the sun's view of it, and whatever stands between it and the sun", () => {
    const { scene } = field()
    const cull = castersInCascade({
      ...SPLIT,
      getCascadeTransformMatrix: (cascade) => (cascade === 0 ? transform : null),
      getLight: () => ({ direction: sunFrom(90) })
    })
    const box = (name: string, x: number, y: number, z: number) => {
      const mesh = CreateBox(name, { size: 1 }, scene)
      mesh.position.set(x, y, z)
      mesh.computeWorldMatrix(true)
      return mesh
    }
    const inside = box("inside", 2, 0, 3)
    const beside = box("beside", 30, 0, 0)
    const sunward = box("between the slice and the sun", 0, 80, 0)
    const beyond = box("beyond the far end", 0, -80, 0)
    const crowd = box("crowd", 100, 0, 100)
    crowd.alwaysSelectAsActiveMesh = true
    const casters = [inside, beside, sunward, beyond, crowd]

    expect(cull(0, casters, casters.length)).toEqual([inside, sunward, crowd])
    // A cascade the generator doesn't have, or nothing to cast.
    expect(cull(1, casters, casters.length)).toEqual([])
    expect(cull(0, null, 0)).toEqual([])
  })

  it("leaves a crowd out of slices nearer than its men's shadows fall, and out of all when it draws no one", () => {
    const { scene } = field()
    let sun = sunFrom(45)
    const cull = castersInCascade({
      ...SPLIT,
      getCascadeTransformMatrix: () => transform,
      getLight: () => ({ direction: sun })
    })
    const crowd = (name: string, depth?: number) => {
      const mesh = CreateBox(name, { size: 1 }, scene)
      mesh.alwaysSelectAsActiveMesh = true
      if (depth !== undefined) {
        recordNearestDepth(mesh, depth)
      }
      return mesh
    }
    const near = crowd("near", 10)
    // A shadow falls 4.9 m toward the camera from a man with the sun at 45 degrees: the first slice ends at 19.64 m.
    const close = crowd("just past the first slice", 24)
    const far = crowd("in the play view", 35)
    const empty = crowd("no one drawn", Number.POSITIVE_INFINITY)
    const unmeasured = crowd("not measured")
    const casters = [near, close, far, empty, unmeasured]

    expect(nearestDepth(unmeasured)).toBe(Number.NEGATIVE_INFINITY)
    expect(cull(0, casters, casters.length)).toEqual([near, close, unmeasured])
    expect(cull(1, casters, casters.length)).toEqual([near, close, far, unmeasured])
    // From a sun at 30 degrees they fall 8.5 m: a man 27 m off can shade the first slice, and one 29 m off can't.
    sun = sunFrom(30)
    recordNearestDepth(far, 27)
    expect(cull(0, casters, casters.length)).toEqual([near, close, far, unmeasured])
    recordNearestDepth(far, 29)
    expect(cull(0, casters, casters.length)).toEqual([near, close, unmeasured])
    // Beyond where shadows end, and their reach past it, no slice wants them.
    recordNearestDepth(far, 170)
    expect(cull(1, casters, casters.length)).toEqual([near, close, unmeasured])
    // A low sun casts too far to bound: every crowd drawing someone casts into every slice.
    sun = sunFrom(8)
    recordNearestDepth(far, 100)
    expect(cull(0, casters, casters.length)).toEqual([near, close, far, unmeasured])
    // So does a sun below the horizon.
    sun = new Vector3(0, 1, 0)
    expect(cull(0, casters, casters.length)).toEqual([near, close, far, unmeasured])
  })

  it("reaches only as far toward the camera as the way it looks lets the shadows fall", () => {
    const { scene } = field()
    let forward = new Vector3(1, 0, 0)
    const cull = castersInCascade({
      ...SPLIT,
      camera: looking(forward),
      getCascadeTransformMatrix: () => transform,
      getLight: () => ({ direction: sunFrom(45) })
    })
    const man = CreateBox("man", { size: 1 }, scene)
    man.alwaysSelectAsActiveMesh = true
    const casters = [man]
    // With the sun behind it his shadow falls away from the camera: past the first slice's 19.64 m he can't shade it.
    recordNearestDepth(man, 20)
    expect(cull(0, casters, casters.length)).toEqual([])
    recordNearestDepth(man, 19)
    expect(cull(0, casters, casters.length)).toEqual([man])
    // Looking straight down, as from high over the field, the shadow keeps its depth.
    forward.set(0, -1, 0)
    recordNearestDepth(man, 20)
    expect(cull(0, casters, casters.length)).toEqual([])
    // Looking level into a sun 30 degrees up, over a soldier's shoulder, all 8.5 m of the shadow along the ground falls
    // toward the camera.
    forward = new Vector3(-1, -0.0001, 0)
    const into = castersInCascade({
      ...SPLIT,
      camera: looking(forward),
      getCascadeTransformMatrix: () => transform,
      getLight: () => ({ direction: sunFrom(30) })
    })
    recordNearestDepth(man, 19.64 + 8.4)
    expect(into(0, casters, casters.length)).toEqual([man])
    recordNearestDepth(man, 19.64 + 8.6)
    expect(into(0, casters, casters.length)).toEqual([])
  })
})

describe("sunCastsShadows", () => {
  it("takes the sun's shadows away above 200 m and gives them back below 180 m, holding them between", () => {
    expect(sunCastsShadows(60, true)).toBe(true)
    expect(sunCastsShadows(195, true)).toBe(true)
    expect(sunCastsShadows(200, true)).toBe(false)
    expect(sunCastsShadows(185, false)).toBe(false)
    expect(sunCastsShadows(175, false)).toBe(true)
  })
})

/** Draws frames, a task apart, until the promise settles. */
async function drawUntil(scene: Scene, promise: Promise<void>): Promise<void> {
  let settled = false
  void promise.finally(() => {
    settled = true
  })
  while (!settled) {
    scene.render()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  await promise
}

describe("switchSunShadows", () => {
  it("builds the shaders without shadows as the battle loads, then switches them by the camera's height", async () => {
    const { scene } = field()
    const sun = new DirectionalLight("sun", new Vector3(0, -1, 0), scene)
    const eye = new TargetCamera("eye", new Vector3(100, 40, 100), scene)
    scene.activeCamera = eye
    const switched = switchSunShadows(scene, sun, eye)
    const from = (height: number) => {
      eye.position.y = height
      // The camera's place is worked out as a frame draws, after the switch has looked at the last one's.
      scene.render()
      scene.render()
      return sun.shadowEnabled
    }

    const warming = switched.warmUp()
    // Off while the battle loads, however low the camera.
    expect(from(40)).toBe(false)
    await drawUntil(scene, warming)
    expect(sun.shadowEnabled).toBe(true)

    expect(from(195)).toBe(true)
    expect(from(205)).toBe(false)
    expect(from(185)).toBe(false)
    expect(from(175)).toBe(true)
    // A switch made elsewhere, as scripts/perf.mjs makes, holds until the height calls for one.
    sun.shadowEnabled = false
    expect(from(60)).toBe(false)
    expect(from(205)).toBe(false)
    expect(from(60)).toBe(true)

    switched.dispose()
    expect(from(205)).toBe(true)
  })
})

describe("createAtmosphere", () => {
  it("needs the scene's sun and sky to work with", () => {
    const { map, scene, camera, sprites } = field()

    expect(createAtmosphere(scene, map, camera, sprites)).toBeNull()
  })

  it("grades the image and lets smoke and mist drift, shadowless where the engine can't", async () => {
    const { map, scene, camera, sprites } = field()
    const sun = new DirectionalLight("sun", new Vector3(0, -1, 0), scene)
    const sky = new HemisphericLight("sky", Vector3.Up(), scene)

    const atmosphere = createAtmosphere(scene, map, camera, sprites)

    // The sun's place and the light's strength follow the clock and weather, in `environment/`, not the level.
    expect(sun.direction.y).toBe(-1)
    expect(sky.intensity).toBe(1)
    expect(scene.imageProcessingConfiguration.colorCurvesEnabled).toBe(true)
    // The null engine has no texture arrays for cascades.
    expect(atmosphere?.shadows).toBeNull()
    expect(atmosphere?.smoke.isStarted()).toBe(true)
    expect(atmosphere?.mist.isStarted()).toBe(true)
    // Nor anything to build for the sector seen from high up, without them.
    await atmosphere?.warmUp()
    expect(sun.shadowEnabled).toBe(true)
    atmosphere?.dispose()
  })

  it("tints the picture blue at night, and leaves the day's and dusk's colours alone", () => {
    const { map, scene, camera, sprites } = field()
    const lights = [
      new DirectionalLight("sun", new Vector3(0, -1, 0), scene),
      new HemisphericLight("sky", Vector3.Up(), scene)
    ]
    const atmosphere = createAtmosphere(scene, map, camera, sprites)
    const processing = scene.imageProcessingConfiguration
    expect(lights).toHaveLength(2)

    atmosphere?.update(new Color3(1, 1, 1))
    expect(processing.colorCurves?.globalDensity).toBe(0)
    expect(processing.exposure).toBeCloseTo(1.18)

    atmosphere?.update(new Color3(0.08, 0.09, 0.13))
    expect(processing.colorCurves?.globalHue).toBe(222)
    expect(processing.colorCurves?.globalDensity).toBeCloseTo(65)
    expect(processing.exposure).toBeGreaterThan(1.18)

    // Dusk's light, about a third of midday's, keeps its own warm haze.
    expect(nightness(new Color3(0.4, 0.35, 0.3))).toBe(0)
    expect(nightness(new Color3(0.2, 0.2, 0.25))).toBeGreaterThan(0)
    expect(nightness(new Color3(0.2, 0.2, 0.25))).toBeLessThan(1)
    atmosphere?.dispose()
  })
})
