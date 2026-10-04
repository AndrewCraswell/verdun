import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it } from "vitest"
import { createNightLight, NIGHT_LIGHT_COUNT } from "./night-light.ts"

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
    fires: [new Vector3(10, 1, 10), new Vector3(200, 1, 200), new Vector3(12, 1, 11)]
  }
  const material = new StandardMaterial("ground", scene)
  const night = createNightLight(
    scene,
    {
      darkness: () => state.darkness,
      focus: () => new Vector3(0, 0, 0),
      fires: () => state.fires
    },
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
    const [nearest, next] = night.lights
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
