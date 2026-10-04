import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import { Scene } from "@babylonjs/core/scene"
import { afterEach, describe, expect, it } from "vitest"
import { airLight, lightParticles, litByAir } from "./particle-light.ts"

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

describe("airLight", () => {
  it("reads how the air is lit from the fog's colour, against midday's", () => {
    const world = scene()
    world.fogColor = new Color3(0.557, 0.576, 0.561)
    const midday = airLight(world)
    expect(midday.r).toBeCloseTo(1)
    expect(midday.b).toBeCloseTo(1)

    world.fogColor = new Color3(0.03, 0.035, 0.05)
    expect(airLight(world).g).toBeLessThan(0.1)

    // Brighter than midday lifts the colours, but only so far.
    world.fogColor = new Color3(1, 1, 1)
    expect(airLight(world).r).toBeCloseTo(1.3)
  })
})

describe("litByAir", () => {
  it("picks out smoke, dust and mist from what glows", () => {
    const world = scene()
    const smoke = new ParticleSystem("burst-smoke-field", 10, world)
    smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD
    const fireball = new ParticleSystem("burst-fireball-field", 10, world)
    fireball.blendMode = ParticleSystem.BLENDMODE_STANDARD
    const sparks = new ParticleSystem("burst-sparks", 10, world)
    sparks.blendMode = ParticleSystem.BLENDMODE_ADD

    expect([smoke, fireball, sparks].filter(litByAir)).toEqual([smoke])
  })
})

describe("lightParticles", () => {
  it("relights the particles already alive, made in the light before", () => {
    const world = scene()
    const mist = new ParticleSystem("mist", 10, world)
    mist.color1 = new Color4(0.8, 0.8, 0.8, 0.09)
    mist.color2 = new Color4(0.8, 0.8, 0.8, 0.09)
    mist.colorDead = new Color4(0.8, 0.8, 0.8, 0)
    mist.emitter = Vector3.Zero()
    mist.emitRate = 100
    mist.minLifeTime = 30
    mist.maxLifeTime = 30
    // Warmed up as it starts, as the atmosphere's mist is: puffs born before any light was set.
    mist.preWarmCycles = 2
    mist.start()
    const [puff] = mist.particles
    const light = lightParticles([mist])

    // Born by day, then night falls: a puff born white goes dark at once.
    light.update(new Color3(0.1, 0.1, 0.1))
    expect(puff?.color.r).toBeCloseTo(0.8 * 0.1 ** 1.5)
    expect(puff?.color.a).toBeCloseTo(0.09)
    // And comes back with the day.
    light.update(new Color3(1, 1, 1))
    expect(puff?.color.r).toBeCloseTo(0.8)
  })

  it("darkens each colour from its midday colour faster than the light, gradients too", () => {
    const world = scene()
    const mist = new ParticleSystem("mist", 10, world)
    mist.color1 = new Color4(0.8, 0.8, 0.8, 0.09)
    mist.colorDead = new Color4(0.7, 0.7, 0.7, 0)
    const smoke = new ParticleSystem("smoke", 10, world)
    smoke.addColorGradient(0, new Color4(0.2, 0.2, 0.2, 0.4))
    const light = lightParticles([mist, smoke])

    light.update(new Color3(0.1, 0.1, 0.2))

    // The light raised to 1.5: a tenth of midday's leaves about a thirtieth of the colour.
    expect(mist.color1.r).toBeCloseTo(0.8 * 0.1 ** 1.5)
    expect(mist.color1.b).toBeCloseTo(0.8 * 0.2 ** 1.5)
    expect(mist.color1.a).toBeCloseTo(0.09)
    expect(mist.colorDead.g).toBeCloseTo(0.7 * 0.1 ** 1.5)
    expect(smoke.getColorGradients()?.[0]?.color1.r).toBeCloseTo(0.2 * 0.1 ** 1.5)

    // Back in daylight, the colours they were made with.
    light.update(new Color3(1, 1, 1))
    expect(mist.color1.r).toBeCloseTo(0.8)
    // Too small a change to bother with.
    light.update(new Color3(1, 1, 0.995))
    expect(mist.color1.b).toBeCloseTo(0.8)
  })
})
