import { describe, expect, it } from "vitest"
import { RIPPLE_PERIOD, RIPPLES_GLSL, RIPPLES_WGSL, ringStrength, rippleTilt } from "./ripples.ts"

/** The share of points on a 4 m patch of water, 5 cm apart, that a ring tilts at a moment. */
function rippled(time: number, rain: number): number {
  let tilted = 0
  let points = 0
  for (let x = 0; x < 4; x += 0.05) {
    for (let z = 0; z < 4; z += 0.05) {
      const [tiltX, tiltZ] = rippleTilt(x, z, time, rain)
      tilted += Math.hypot(tiltX, tiltZ) > 0.01 ? 1 : 0
      points++
    }
  }
  return tilted / points
}

describe("raindrops ringing the water", () => {
  it("leave still water still", () => {
    for (const time of [0, 0.3, 2.7, 7.9]) {
      expect(rippled(time, 0)).toBe(0)
    }
  })

  it("ring more of the water as the rain grows heavier, a layer of rings for each quarter", () => {
    const shower = rippled(1.3, 0.25)
    const steady = rippled(1.3, 0.5)
    const downpour = rippled(1.3, 1)
    expect(shower).toBeGreaterThan(0.02)
    expect(steady).toBeGreaterThan(shower * 1.3)
    expect(downpour).toBeGreaterThan(steady * 1.3)
  })

  it("tilt the water a little, and repeat after the period, so time can be wrapped there", () => {
    for (const [x, z] of [
      [0.13, 0.4],
      [1.7, 2.2],
      [3.05, 0.95]
    ] as const) {
      for (const time of [0.2, 1.1, 4.4]) {
        const now = rippleTilt(x, z, time, 1)
        const later = rippleTilt(x, z, time + RIPPLE_PERIOD, 1)
        expect(Math.hypot(...now)).toBeLessThan(4 * 0.35)
        expect(later[0]).toBeCloseTo(now[0], 6)
        expect(later[1]).toBeCloseTo(now[1], 6)
      }
    }
  })

  it("spread from where each drop strikes, as a wave that fades as it goes", () => {
    // Where a ring tilts the water most, in cells from where its drop struck, and how much, by its age.
    const crest = (age: number) => {
      let best = { radius: 0, strength: 0 }
      for (let radius = 0; radius <= 0.5; radius += 0.002) {
        const strength = Math.abs(ringStrength(radius, age, 1))
        if (strength > best.strength) {
          best = { radius, strength }
        }
      }
      return best
    }
    const young = crest(0.15)
    const middling = crest(0.5)
    const old = crest(0.85)
    expect(young.radius).toBeLessThan(middling.radius)
    expect(middling.radius).toBeLessThan(old.radius)
    expect(old.radius).toBeLessThanOrEqual(0.35)
    expect(young.strength).toBeGreaterThan(middling.strength)
    expect(middling.strength).toBeGreaterThan(old.strength)
    // Beyond its reach the water is still, and a layer not yet switched on rings nothing.
    expect(ringStrength(0.4, 0.9, 1)).toBe(0)
    expect(ringStrength(0.05, 0.1, 0)).toBe(0)
  })

  it("is the same four layers in both shading languages", () => {
    for (const code of [RIPPLES_GLSL, RIPPLES_WGSL]) {
      expect(code.match(/weatherRippleLayer\(at \+/g)).toHaveLength(4)
      expect(code).toContain("weatherRippleHash")
      expect(code).toContain("weatherRipples")
    }
    expect(RIPPLES_WGSL).toContain("fn weatherRipples(ground: vec2f, time: f32, rain: f32) -> vec2f")
    expect(RIPPLES_GLSL).toContain("vec2 weatherRipples(vec2 ground, float time, float rain)")
  })
})
