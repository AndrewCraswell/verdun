import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Color3 } from "@babylonjs/core/Maths/math.color"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, type Scenery } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import {
  castersInCascade,
  castsShadow,
  createAtmosphere,
  nightness,
  receivesShadow,
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

describe("castersInCascade", () => {
  it("keeps for a cascade the casters in the sun's view of it, and whatever stands between it and the sun", () => {
    const { scene } = field()
    // The sun overhead, looking down on twenty metres square from fifty up, a hundred deep.
    const transform = Matrix.LookAtLH(new Vector3(0, 50, 0), Vector3.Zero(), new Vector3(0, 0, 1)).multiply(
      Matrix.OrthoOffCenterLH(-10, 10, -10, 10, 0, 100)
    )
    const cull = castersInCascade({ getCascadeTransformMatrix: (cascade) => (cascade === 0 ? transform : null) })
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
