import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { SpotLight } from "@babylonjs/core/Lights/spotLight"
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage"
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import "@babylonjs/core/Rendering/depthRendererSceneComponent"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it } from "vitest"
import { advanceRain, createRain, rainDrops, type RainMotion, streakWidth, wrapped } from "./rain.ts"

const engines: NullEngine[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function scene(): Scene {
  const engine = new NullEngine()
  engines.push(engine)
  return new Scene(engine)
}

describe("how much rain falls", () => {
  it("draws more drops in heavier rain, though not in proportion, up to all there are", () => {
    expect(rainDrops(0)).toBe(0)
    expect(rainDrops(0.01)).toBe(0)
    expect(rainDrops(1)).toBe(8000)
    expect(rainDrops(4)).toBeGreaterThan(rainDrops(1) * 2)
    expect(rainDrops(4)).toBeLessThan(rainDrops(1) * 4)
    expect(rainDrops(100)).toBe(32_768)
  })
})

describe("a streak", () => {
  // A pixel one metre off at 1080 rows and a 0.8 radian field of view.
  const pixel = (2 * Math.tan(0.4)) / 1080

  it("is as wide as the drop close to, and at least a pixel and a half wide further off, fainter by as much", () => {
    const near = streakWidth(0.5, pixel)
    expect(near.width).toBeCloseTo(0.0015)
    expect(near.coverage).toBe(1)
    const far = streakWidth(10, pixel)
    expect(far.width).toBeCloseTo(10 * pixel * 1.5)
    expect(far.coverage).toBeLessThan(0.2)
    // However wide it's drawn, it hides as much of what's behind it as the drop would.
    expect(far.width * far.coverage).toBeCloseTo(near.width * near.coverage)
  })
})

describe("the box of drops round the camera", () => {
  it("wraps every drop into the box, so drops leaving one side come in at the other", () => {
    for (const seed of [-1000, -14.9, 0, 3.3, 29.99, 845.2]) {
      for (const centre of [-500, 0, 12, 1234.5]) {
        const at = wrapped(seed, centre, 30)
        expect(Math.abs(at - centre)).toBeLessThanOrEqual(15)
        // A drop a whole box further on is the same drop.
        expect(wrapped(seed + 30, centre, 30)).toBeCloseTo(at, 6)
      }
    }
    // As the camera moves a little, drops away from the box's edges stay where they are.
    expect(wrapped(10, 2, 30)).toBeCloseTo(wrapped(10, 2.5, 30), 9)
  })

  it("moves the rain on with the fall and the wind, wrapped where the pattern repeats", () => {
    const motion: RainMotion = { fallen: 0, driftX: 0, driftZ: 0, sheetFallen: 0 }
    advanceRain(motion, 1, 2, -3)
    expect(motion.fallen).toBeCloseTo(6.5)
    expect(motion.sheetFallen).toBeCloseTo(6.5)
    expect(motion.driftX).toBeCloseTo(2)
    expect(motion.driftZ).toBeCloseTo(17)
    for (let second = 0; second < 1000; second++) {
      advanceRain(motion, 1, 2, -3)
    }
    expect(motion.fallen).toBeGreaterThanOrEqual(0)
    expect(motion.fallen).toBeLessThan(160)
    expect(motion.sheetFallen).toBeLessThan(9.6)
    expect(motion.driftX).toBeLessThan(20)
    expect(motion.driftZ).toBeGreaterThanOrEqual(0)
  })
})

describe("the rain", () => {
  it("draws its streaks and sheets in the engine's own shading language, from both languages' code", () => {
    const world = scene()
    const rain = createRain(world)
    for (const name of ["rainStreaks", "rainSheets"]) {
      const glsl = `${ShaderStore.ShadersStore[`${name}VertexShader`]}${ShaderStore.ShadersStore[`${name}PixelShader`]}`
      const wgsl = `${ShaderStore.ShadersStoreWGSL[`${name}VertexShader`]}${ShaderStore.ShadersStoreWGSL[`${name}PixelShader`]}`
      expect(glsl).toContain("gl_Position")
      expect(glsl).toContain("gl_FragColor")
      expect(wgsl).toContain("@vertex")
      expect(wgsl).toContain("@fragment")
      // Lit alike in both.
      expect(glsl).toContain("rainLit(")
      expect(wgsl).toContain("rainLit(")
    }
    const material = rain.streaks.material
    expect(material).toBeInstanceOf(ShaderMaterial)
    expect(material instanceof ShaderMaterial ? material.options.shaderLanguage : null).toBe(ShaderLanguage.GLSL)
    expect(material?.needAlphaBlending()).toBe(true)
    expect(rain.streaks.getTotalVertices()).toBe(32_768 * 4)
    rain.dispose()
    expect(world.meshes).toHaveLength(0)
  })

  it("shows as many drops as the rate asks, slanted by the wind, and none when it stops", () => {
    const world = scene()
    const camera = new ArcRotateCamera("camera", 0, 1, 20, new Vector3(10, 0, 10), world)
    const lights = [
      new HemisphericLight("sky", Vector3.Up(), world),
      new DirectionalLight("sun", new Vector3(0, -1, 0.3), world)
    ]
    expect(world.lights).toEqual(lights)
    const flare = new SpotLight("flare", new Vector3(10, 30, 10), Vector3.Down(), 2, 1, world)
    flare.intensity = 2
    flare.range = 100
    const rain = createRain(world)
    expect(rain.streaks.isEnabled()).toBe(false)
    expect(rain.sheets.isEnabled()).toBe(false)

    rain.fall(4, 3, -1)
    expect(rain.drops).toBe(rainDrops(4))
    expect(rain.wind).toEqual({ x: 3, z: -1 })
    expect(rain.streaks.isEnabled()).toBe(true)
    expect(rain.sheets.isEnabled()).toBe(true)
    // Before each frame the rain is moved to the camera, to be sorted as near it.
    world.render()
    expect(rain.streaks.position.equalsWithEpsilon(camera.globalPosition, 1e-6)).toBe(true)
    expect(rain.sheets.position.equalsWithEpsilon(camera.globalPosition, 1e-6)).toBe(true)

    rain.fall(0, 3, -1)
    expect(rain.drops).toBe(0)
    expect(rain.streaks.isEnabled()).toBe(false)
    expect(rain.sheets.isEnabled()).toBe(false)
    // Stopped, it's left where it was.
    camera.radius = 40
    world.render()
    expect(rain.streaks.position.equalsWithEpsilon(camera.globalPosition, 1e-6)).toBe(false)
    rain.dispose()
  })

  it("leaves the sheets out in drizzle and on the low graphics setting, and lets the streaks fall", () => {
    const world = scene()
    world.activeCamera = new ArcRotateCamera("camera", 0, 1, 20, new Vector3(10, 0, 10), world)
    const rain = createRain(world)
    rain.fall(0.2, 0, 0)
    expect(rain.streaks.isEnabled()).toBe(true)
    expect(rain.sheets.isEnabled()).toBe(false)
    rain.fall(1, 0, 0)
    expect(rain.sheets.isEnabled()).toBe(true)
    rain.dispose()

    const low = createRain(world, { sheets: false })
    low.fall(4, 0, 0)
    expect(low.streaks.isEnabled()).toBe(true)
    expect(low.sheets.isEnabled()).toBe(false)
    low.dispose()
  })

  it("fades its sheets into the ground by the depth of field's depth map, once there is one", () => {
    const world = scene()
    const camera = new ArcRotateCamera("camera", 0, 1, 20, Vector3.Zero(), world)
    const rain = createRain(world)
    const sheets = rain.sheets.material
    rain.fall(2, 0, 0)
    // No sun, sky or flare, and no depth map: lit by the haze alone, and never meeting the ground.
    world.render()
    const before = sheets?.getActiveTextures() ?? []
    expect(before).toHaveLength(2)
    const depthMap = world.enableDepthRenderer(camera).getDepthMap()
    world.render()
    expect(before).not.toContain(depthMap)
    expect(sheets?.getActiveTextures()).toContain(depthMap)
    expect(sheets?.getActiveTextures()).toHaveLength(2)
    rain.dispose()
  })
})
