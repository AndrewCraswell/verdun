import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Texture } from "@babylonjs/core/Materials/Textures/texture"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap } from "@verdun/map"
import { type Flare, Side } from "@verdun/sim"
import { afterEach, describe, expect, it } from "vitest"
import { createNightLight, type FlareView, flareViews, NIGHT_LIGHT_COUNT } from "./night-light.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

function setup() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const state = {
    darkness: 0,
    fires: [new Vector3(10, 1, 10), new Vector3(200, 1, 200), new Vector3(12, 1, 11)],
    flares: [] as FlareView[]
  }
  const material = new StandardMaterial("ground", scene)
  const night = createNightLight(
    scene,
    {
      darkness: () => state.darkness,
      focus: () => new Vector3(0, 0, 0),
      fires: () => state.fires,
      flares: () => state.flares
    },
    new Texture(null, scene),
    [material]
  )
  return { night, state, material }
}

describe("createNightLight", () => {
  it("raises the materials' light limit to fit, and keeps the lights off by day", () => {
    const { night, material } = setup()

    night.update(0.016)

    expect(material.maxSimultaneousLights).toBe(NIGHT_LIGHT_COUNT)
    expect(night.lit).toBe(false)
    expect(night.lights.every((light) => !light.isEnabled())).toBe(true)
  })

  it("lights the fires nearest the camera after dark, and switches off again at dawn without flickering at dusk", () => {
    const { night, state } = setup()
    state.darkness = 0.9

    night.update(0.016)

    expect(night.lit).toBe(true)
    const [, , , nearest, next] = night.lights
    expect(nearest?.position.x).toBe(10)
    expect(next?.position.x).toBe(12)
    expect(nearest?.intensity).toBeGreaterThan(0)
    // Between the thresholds the lights stay as they were.
    state.darkness = 0.4
    night.update(0.016)
    expect(night.lit).toBe(true)
    state.darkness = 0.1
    night.update(0.016)
    expect(night.lit).toBe(false)
  })

  it("draws every flare in the air and lights the ground under the nearest", () => {
    const { night, state } = setup()
    state.darkness = 1
    state.flares = [
      { x: 5, y: 60, z: 5, brightness: 1 },
      { x: 300, y: 50, z: 300, brightness: 0.5 }
    ]

    night.update(0.016)

    expect(night.flareSprites.filter((sprite) => sprite.isVisible)).toHaveLength(2)
    expect(night.lights[0]?.position.y).toBe(60)
    expect(night.lights[0]?.intensity).toBeGreaterThan(night.lights[1]?.intensity ?? 0)
    // Burnt out: the sprites hide, the lights go dark.
    state.flares = []
    night.update(0.016)
    expect(night.flareSprites.some((sprite) => sprite.isVisible)).toBe(false)
    expect(night.lights[0]?.intensity).toBe(0)
  })

  it("flashes for a moment where a rifle fires near the camera, and only at night", () => {
    const { night, state } = setup()
    const flash = () => night.lights.at(-1)

    night.flash([{ x: 3, y: 2, z: 4 }])
    night.update(0.016)
    expect(flash()?.intensity ?? 0).toBe(0)

    state.darkness = 1
    night.update(0.016)
    night.flash([
      { x: 500, y: 2, z: 500 },
      { x: 3, y: 2, z: 4 }
    ])
    night.update(0.016)
    expect(flash()?.position.x).toBe(3)
    expect(flash()?.intensity).toBeGreaterThan(0)
    night.update(0.2)
    expect(flash()?.intensity).toBe(0)
    night.dispose()
  })
})

describe("flareViews", () => {
  it("places each flare over the ground, flaring up, burning steady and guttering out", () => {
    const map = createFlatMap({ name: "field", cellSize: 1, columns: 100, rows: 100 }, 5)
    const flare: Flare = {
      side: Side.French,
      fromX: 10,
      fromZ: 10,
      x: 50,
      z: 50,
      vx: 1,
      vz: 0,
      firedAt: 100,
      burnsOutAt: 260
    }
    const at = (tick: number) => flareViews(map, [flare], tick)[0]

    expect(at(100)?.brightness).toBeCloseTo(0.3)
    const hanging = at(160)
    expect(hanging?.brightness).toBe(1)
    expect(hanging?.y).toBeGreaterThan(5 + 40)
    expect(at(255)?.brightness).toBeLessThan(0.5)
  })
})
