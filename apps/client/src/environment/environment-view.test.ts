import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera"
import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight"
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Particle } from "@babylonjs/core/Particles/particle"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, heightAt } from "@verdun/map"
import {
  createSimulation,
  enqueueCommand,
  type Simulation,
  stepSimulation,
  typicalWeather,
  WeatherPattern
} from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
import { fogDensityFor, lightDirection, lightingFor, lightLevel, sunColorAt, twilight } from "./daylight.ts"
import { createEnvironmentView, groundFogFor } from "./environment-view.ts"
import { dropsPerSecond } from "./precipitation.ts"

const engines: NullEngine[] = []
afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

const map = createFlatMap({ name: "field", cellSize: 1, columns: 100, rows: 100 })

function scene() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const camera = new ArcRotateCamera("camera", 0, 1, 60, new Vector3(50, 0, 50), scene)
  const sun = new DirectionalLight("sun", new Vector3(0, -1, 0), scene)
  const sky = new HemisphericLight("sky", Vector3.Up(), scene)
  return { scene, camera, sun, sky }
}

function at(sim: Simulation, utc: number): Simulation {
  enqueueCommand(sim, { type: "clock", at: utc })
  stepSimulation(sim)
  return sim
}

describe("daylight", () => {
  it("reads light levels from a moonless night to an overcast noon as 0 to 1", () => {
    expect(lightLevel(0.0005)).toBe(0)
    expect(lightLevel(0.25)).toBeGreaterThan(0.25)
    expect(lightLevel(0.25)).toBeLessThan(0.45)
    expect(lightLevel(50_000)).toBe(1)
  })

  it("shines light down from where the body stands in the sky", () => {
    const fromSouth = lightDirection({ altitude: 30, azimuth: 180 })
    expect(fromSouth.y).toBeCloseTo(-0.5)
    expect(fromSouth.z).toBeGreaterThan(0.8)
    expect(Math.abs(fromSouth.x)).toBeLessThan(1e-9)
    expect(lightDirection({ altitude: 0, azimuth: 90 }).x).toBeCloseTo(-1)
  })

  it("reddens the sun toward the horizon", () => {
    expect(sunColorAt(-5).b).toBeLessThan(0.3)
    expect(sunColorAt(8).b).toBeGreaterThan(sunColorAt(2).b)
    expect(sunColorAt(60).equals(sunColorAt(30))).toBe(true)
  })

  it("lights noon by the sun, a moonless night barely, and fades shadows under overcast", () => {
    const sim = createSimulation({ map, seed: 1 })
    const noon = lightingFor(at(sim, Date.UTC(1916, 5, 23, 11, 30)).environment)
    expect(noon.moonlit).toBe(false)
    expect(noon.keyIntensity).toBeGreaterThan(0.8)
    expect(noon.keyDirection.y).toBeLessThan(-0.8)
    expect(noon.shadowDarkness).toBeLessThan(0.6)

    const night = lightingFor(at(sim, Date.UTC(1916, 5, 30, 23)).environment)
    expect(night.keyIntensity).toBeLessThan(0.05)
    // Night is drawn dim and blue, not black.
    expect(night.skyIntensity * night.skyColor.r).toBeLessThan((noon.skyIntensity * noon.skyColor.r) / 2)
    expect(night.skyColor.b).toBeGreaterThan(night.skyColor.r)
    expect(night.fogColor.r).toBeLessThan(noon.fogColor.r)

    enqueueCommand(sim, {
      type: "forecast",
      forecast: { kind: "steady", weather: typicalWeather(WeatherPattern.Overcast, sim.wind) }
    })
    const overcast = lightingFor(at(sim, Date.UTC(1916, 5, 23, 11, 30)).environment)
    expect(overcast.shadowDarkness).toBeGreaterThan(0.85)
  })

  it("warms the haze at dawn and dusk, most at sunrise, not at noon or deep night", () => {
    expect(twilight(0)).toBe(1)
    expect(twilight(-3)).toBeGreaterThan(0.3)
    expect(twilight(-8)).toBe(0)
    expect(twilight(30)).toBe(0)
    const sim = createSimulation({ map, seed: 1 })
    // 23 June 1916 at Fleury: the sun rises about 03:50 UTC.
    const dawn = lightingFor(at(sim, Date.UTC(1916, 5, 23, 3, 50)).environment)
    const noon = lightingFor(at(sim, Date.UTC(1916, 5, 23, 11, 30)).environment)
    expect(dawn.fogColor.r / dawn.fogColor.b).toBeGreaterThan(noon.fogColor.r / noon.fogColor.b)
  })

  it("makes the full moon the key light on a clear winter night", () => {
    const sim = createSimulation({ map, seed: 1 })
    const night = lightingFor(at(sim, Date.UTC(1916, 10, 10, 0)).environment)
    expect(night.moonlit).toBe(true)
    expect(night.keyIntensity).toBeGreaterThan(0.05)
  })

  it("thickens the fog as visibility falls, short of hiding the ground", () => {
    const sim = createSimulation({ map, seed: 1 })
    const fair = lightingFor(sim.environment)
    enqueueCommand(sim, {
      type: "forecast",
      forecast: { kind: "steady", weather: typicalWeather(WeatherPattern.Fog, sim.wind) }
    })
    stepSimulation(sim)
    const fog = lightingFor(sim.environment)
    expect(fog.fogDensity).toBeGreaterThan(fair.fogDensity * 4)
    // Thinned for a camera high above, so the ground still shows through.
    expect(fogDensityFor(fog, 50)).toBe(fog.fogDensity)
    expect(Math.exp(-((fogDensityFor(fog, 260) * 260) ** 2))).toBeCloseTo(0.35)
    expect(fogDensityFor(fair, 260)).toBe(fair.fogDensity)
  })
})

describe("precipitation", () => {
  it("falls harder in heavier rain, though not in proportion", () => {
    expect(dropsPerSecond(0, 900)).toBe(0)
    expect(dropsPerSecond(1, 900)).toBe(900)
    expect(dropsPerSecond(10, 900)).toBeLessThan(9000)
    expect(dropsPerSecond(10, 900)).toBeGreaterThan(3000)
  })
})

describe("the environment view", () => {
  it("needs the scene's sun and sky", () => {
    const engine = new NullEngine()
    engines.push(engine)
    const bare = new Scene(engine)
    const camera = new ArcRotateCamera("camera", 0, 1, 60, Vector3.Zero(), bare)
    expect(createEnvironmentView(bare, createSimulation({ map, seed: 1 }), camera)).toBeNull()
  })

  it("lights the scene, rains around the camera, wets the ground and drifts the mist on the wind", () => {
    const { scene: battlefield, camera, sun, sky } = scene()
    const sim = createSimulation({ map, seed: 1 })
    const ground = new StandardMaterial("ground", battlefield)
    const smoke = new ParticleSystem("smoke", 10, battlefield)
    const mist = new ParticleSystem("mist", 10, battlefield)
    mist.emitRate = 4
    const view = createEnvironmentView(battlefield, sim, camera, {
      materials: [ground],
      air: { shadows: null, smoke, mist }
    })
    expect(view?.daylight.atmosphere).toBeNull()

    view?.update(0.016)
    expect(sun.intensity).toBeGreaterThan(0.5)
    expect(view?.precipitation.rain.emitRate).toBe(0)
    const dryGround = ground.diffuseColor.r

    const strikes: number[] = []
    view?.onLightning.add((distance) => strikes.push(distance))
    const storm = { ...typicalWeather(WeatherPattern.Storm, { x: 4, z: 0 }), wetness: 1 }
    enqueueCommand(sim, { type: "forecast", forecast: { kind: "steady", weather: storm } })
    stepSimulation(sim)
    for (let frame = 0; frame < 2000; frame++) {
      view?.update(0.016)
    }
    expect(view?.precipitation.rain.emitRate).toBeGreaterThan(1000)
    expect(view?.precipitation.rain.direction1.x).toBeGreaterThan(0)
    // Drops splash on the ground round the camera, puddles stand and ripple, and the grass bends to the wind.
    expect(view?.precipitation.splashes.emitRate).toBeGreaterThan(50)
    const splash = Vector3.Zero()
    const splashes = view?.precipitation.splashes
    if (splashes) {
      splashes.startPositionFunction?.(Matrix.Identity(), splash, new Particle(splashes), false)
    }
    expect(splash.y).toBeCloseTo(heightAt(map, splash.x, splash.z) + 0.03, 5)
    expect(view?.surface.waterShown).toBe(1)
    expect(view?.surface.rain).toBeGreaterThan(0.5)
    expect(view?.wind.strength).toBeGreaterThan(0.5)
    expect(view?.wind.towardX).toBeCloseTo(1)
    expect(ground.diffuseColor.r).toBeLessThan(dryGround * 0.7)
    expect(ground.specularPower).toBe(48)
    expect(smoke.gravity.x).toBeGreaterThan(0)
    expect(mist.emitRate).toBeGreaterThan(4)
    expect(sky.intensity).toBeGreaterThan(0)
    // Lightning flashed through the storm, each strike a few kilometres off.
    expect(strikes.length).toBeGreaterThan(0)
    expect(strikes.every((distance) => distance >= 1500 && distance <= 8000)).toBe(true)
    // An overcast storm throws no cloud shadows; the cloud pattern drifts east on the wind.
    expect(view?.surface.shadowDepth).toBeLessThan(0.1)
    expect(view?.surface.cloudOffsetX).toBeLessThan(0)
    view?.dispose()
  })

  it("lays fog in the low ground in fog, and on clear, calm, damp nights, and lets the wind stir it away", () => {
    const fair = { ...typicalWeather(WeatherPattern.Fair, { x: 1, z: 0 }), wetness: 0.15 }
    const fog = typicalWeather(WeatherPattern.Fog, { x: 1, z: 0 })
    expect(groundFogFor(fair, 1, 1)).toBeLessThan(0.15)
    expect(groundFogFor(fog, 1, 0.6)).toBeGreaterThan(0.6)
    const clearNight = { ...typicalWeather(WeatherPattern.Clear, { x: 1, z: 0 }), wetness: 0.7 }
    expect(groundFogFor(clearNight, 1, 0)).toBeGreaterThan(0.4)
    expect(groundFogFor(clearNight, 8, 0)).toBeLessThan(groundFogFor(clearNight, 1, 0) / 2)
  })

  it("lets snow fall when it is cold", () => {
    const { scene: battlefield, camera } = scene()
    const sim = createSimulation({ map, seed: 1 })
    const view = createEnvironmentView(battlefield, sim, camera)
    const snow = { ...typicalWeather(WeatherPattern.Rain, sim.wind), temperature: -3, snowFraction: 1 }
    enqueueCommand(sim, { type: "forecast", forecast: { kind: "steady", weather: snow } })
    stepSimulation(sim)
    view?.update(0.016)
    expect(view?.precipitation.snow.emitRate).toBeGreaterThan(0)
    expect(view?.surface.snow).toBe(0)
    expect(view?.precipitation.rain.emitRate).toBe(0)
    expect(view?.precipitation.splashes.emitRate).toBe(0)
    view?.dispose()
  })
})
