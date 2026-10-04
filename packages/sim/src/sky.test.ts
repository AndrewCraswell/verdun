import { describe, expect, it } from "vitest"
import { FLEURY, illuminanceUnder, interpolate, sightRange, skyAt, snowGlow } from "./sky.ts"

const at = (iso: string) => skyAt(Date.parse(iso), FLEURY)

describe("the sky over Fleury", () => {
  it("puts the sun where it was on midsummer 1916", () => {
    // Sunrise at Verdun on 24 June 1916 was at 03:33 UTC, 04:33 by French summer time; the sun stood 64° at noon.
    expect(at("1916-06-24T03:33:00Z").sun.altitude).toBeCloseTo(-0.3, 0)
    const noon = at("1916-06-24T11:38:00Z").sun
    expect(noon.altitude).toBeGreaterThan(63)
    expect(noon.altitude).toBeLessThan(65)
    expect(noon.azimuth).toBeGreaterThan(170)
    expect(noon.azimuth).toBeLessThan(190)
  })

  it("lights the ground by day, dimly by twilight and hardly at all at night", () => {
    expect(at("1916-06-24T11:38:00Z").clearIlluminance).toBeGreaterThan(80_000)
    const dusk = at("1916-06-23T20:20:00Z")
    expect(dusk.sun.altitude).toBeLessThan(-3)
    expect(dusk.clearIlluminance).toBeGreaterThan(1)
    expect(dusk.clearIlluminance).toBeLessThan(100)
    expect(at("1916-12-20T23:00:00Z").clearIlluminance).toBeLessThan(0.5)
  })

  it("is lit by a full moon and dark under a new one", () => {
    // Full moon high in the sky on 9 November 1916; new moon on 30 June.
    const full = at("1916-11-10T00:00:00Z")
    expect(full.moon.phase).toBeGreaterThan(0.97)
    expect(full.clearIlluminance).toBeGreaterThan(0.15)
    const dark = at("1916-06-30T23:00:00Z")
    expect(dark.moon.phase).toBeLessThan(0.03)
    expect(dark.clearIlluminance).toBeLessThan(0.01)
  })

  it("dims under cloud, a quarter of the light under a full overcast", () => {
    const sky = at("1916-06-24T11:38:00Z")
    expect(illuminanceUnder(sky, 0)).toBe(sky.clearIlluminance)
    expect(illuminanceUnder(sky, 0.5)).toBeGreaterThan(0.9 * sky.clearIlluminance)
    expect(illuminanceUnder(sky, 1)).toBeCloseTo(0.25 * sky.clearIlluminance)
  })
})

describe("sight range", () => {
  it("closes in at night: tens of metres without a moon, about 150 m by a full one", () => {
    expect(sightRange(0.002, 30_000)).toBeGreaterThan(20)
    expect(sightRange(0.002, 30_000)).toBeLessThan(40)
    expect(sightRange(0.25, 30_000)).toBeGreaterThan(120)
    expect(sightRange(0.25, 30_000)).toBeLessThan(200)
  })

  it("stretches over snow at night, as a man shows up against it", () => {
    expect(snowGlow(0, 1)).toBe(1)
    expect(snowGlow(20, 0)).toBeCloseTo(4.5)
    expect(snowGlow(20, 1)).toBeGreaterThan(snowGlow(20, 0))
    expect(snowGlow(2, 0)).toBeLessThan(snowGlow(8, 0))
    // A moonless night over snow: a man is made out at about twice the distance.
    const bare = sightRange(0.002, 30_000)
    expect(sightRange(0.002 * snowGlow(20, 0), 30_000)).toBeGreaterThan(bare * 1.6)
  })

  it("is limited by fog, not light, by day", () => {
    expect(sightRange(50_000, 30_000)).toBe(10_000)
    expect(sightRange(50_000, 200)).toBe(120)
  })

  it("interpolates tables, clamped at both ends", () => {
    const table = [
      [0, 0],
      [10, 100]
    ] as const
    expect(interpolate(table, -5)).toBe(0)
    expect(interpolate(table, 5)).toBe(50)
    expect(interpolate(table, 50)).toBe(100)
  })
})
