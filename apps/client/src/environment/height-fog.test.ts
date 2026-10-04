import { describe, expect, it } from "vitest"
import {
  createHeightFog,
  HEIGHT_FOG_GLSL,
  HEIGHT_FOG_WGSL,
  heightFogFor,
  heightFogTransmittance,
  heightFogVector
} from "./height-fog.ts"

/** The same transmittance by summing the density in small steps along the ray. */
function stepped(
  eye: { x: number; y: number; z: number },
  point: { x: number; y: number; z: number },
  fog: { density: number; falloff: number; base: number }
): number {
  const steps = 20_000
  const ray = { x: point.x - eye.x, y: point.y - eye.y, z: point.z - eye.z }
  const length = Math.sqrt(ray.x ** 2 + ray.y ** 2 + ray.z ** 2)
  let depth = 0
  for (let step = 0; step < steps; step++) {
    const y = eye.y + (ray.y * (step + 0.5)) / steps
    depth += fog.density * Math.exp(-fog.falloff * (y - fog.base)) * (length / steps)
  }
  return Math.exp(-depth)
}

describe("height fog", () => {
  const fog = { density: 3.912 / 300, falloff: 1 / 40, base: 10 }

  it("matches the fog summed along the ray, looking down, across and up", () => {
    const eye = { x: 0, y: 200, z: 0 }
    for (const point of [
      { x: 150, y: 12, z: 100 },
      { x: 300, y: 200, z: 0 },
      { x: 50, y: 15, z: 0 },
      { x: 0, y: 400, z: 10 }
    ]) {
      expect(heightFogTransmittance(eye, point, fog)).toBeCloseTo(stepped(eye, point, fog), 3)
    }
    const low = { x: 0, y: 11, z: 0 }
    expect(heightFogTransmittance(low, { x: 200, y: 11, z: 0 }, fog)).toBeCloseTo(
      stepped(low, { x: 200, y: 11, z: 0 }, fog),
      4
    )
  })

  it("lies low: the floor of a ravine is mostly hidden where a ridge 50 m higher at the same distance shows", () => {
    const eye = { x: 0, y: 150, z: -150 }
    const ravine = heightFogTransmittance(eye, { x: 0, y: 10, z: 100 }, fog)
    const ridge = heightFogTransmittance(eye, { x: 0, y: 60, z: 100 }, fog)
    expect(ravine).toBeLessThan(0.4)
    expect(ridge).toBeGreaterThan(ravine + 0.25)
  })

  it("thins to a deep, even haze in clear air and rain, and lies in a low layer in fog", () => {
    const fair = heightFogFor({ visibility: 20_000, precipitation: 0 })
    const thick = heightFogFor({ visibility: 200, precipitation: 0 })
    const rain = heightFogFor({ visibility: 2000, precipitation: 2 })
    expect(1 / thick.falloff).toBeCloseTo(40, 0)
    expect(1 / fair.falloff).toBeCloseTo(600, 0)
    expect(1 / rain.falloff).toBeCloseTo(600, 0)
    expect(thick.density).toBeGreaterThan(fair.density * 50)
  })

  it("hands shaders the same function in both languages, and its numbers as a vec4", () => {
    expect(HEIGHT_FOG_GLSL).toContain("float heightFogTransmittance(vec3 eye, vec3 point, vec4 fog)")
    expect(HEIGHT_FOG_WGSL).toContain("fn heightFogTransmittance(eye: vec3f, point: vec3f, fog: vec4f) -> f32")
    const made = { ...createHeightFog(12), density: 0.01, falloff: 0.02 }
    const vector = heightFogVector(made)
    expect([vector.x, vector.y, vector.z, vector.w]).toEqual([0.01, 0.02, 12, 0])
  })
})
