import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, type Scenery } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { castsShadow, createAtmosphere } from "./atmosphere.ts"

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
  })
})

describe("createAtmosphere", () => {
  it("needs the scene's sun and sky to work with", () => {
    const { map, scene, camera, sprites } = field()

    expect(createAtmosphere(scene, map, camera, sprites)).toBeNull()
  })

  it("grades the image and lets smoke and mist drift, shadowless where the engine can't", () => {
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
    atmosphere?.dispose()
  })
})
