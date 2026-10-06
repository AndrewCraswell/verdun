import { describe, expect, it } from "vitest"
import { type ControlPoint, georeference } from "./georeference.ts"

/** A scan at 4 m a pixel, turned 3 degrees, its top-left corner at Lambert-93 870 000 E, 6 910 000 N. */
function scanPixel(x: number, y: number): [number, number] {
  const turn = (3 * Math.PI) / 180
  const dx = (x - 870_000) / 4
  const dy = (6_910_000 - y) / 4
  return [dx * Math.cos(turn) - dy * Math.sin(turn) + 40, dx * Math.sin(turn) + dy * Math.cos(turn) + 25]
}

const place = (name: string, x: number, y: number): ControlPoint => ({ name, ground: [x, y], pixel: scanPixel(x, y) })

describe("georeference", () => {
  it("recovers an affine scan exactly from three points, and places others on it", () => {
    const fit = georeference([
      place("Douaumont", 877_685, 6_904_629),
      place("Verdun", 873_790, 6_898_173),
      place("Vaux", 880_008, 6_902_840)
    ])
    expect(fit.order).toBe(1)
    expect(fit.rms).toBeLessThan(1e-6)
    const [u, v] = fit.toPixel(877_436, 6_902_210)
    const [eu, ev] = scanPixel(877_436, 6_902_210)
    expect(u).toBeCloseTo(eu, 6)
    expect(v).toBeCloseTo(ev, 6)
  })

  it("names the point that misses, in metres on the ground", () => {
    const points = [
      place("Douaumont", 877_685, 6_904_629),
      place("Verdun", 873_790, 6_898_173),
      place("Vaux", 880_008, 6_902_840),
      place("Souville", 877_815, 6_901_437)
    ]
    const wrong = { ...points[3]!, pixel: [points[3]!.pixel[0] + 50, points[3]!.pixel[1]] as const }
    const fit = georeference([...points.slice(0, 3), wrong])
    const worst = [...fit.residuals].sort((a, b) => b.metres - a.metres)[0]
    expect(worst?.name).toBe("Souville")
    expect(fit.rms).toBeGreaterThan(20)
  })

  it("fits a second-order polynomial from eight points, and refuses too few or a line of them", () => {
    const eight = [
      place("a", 860_000, 6_895_000),
      place("b", 885_000, 6_895_000),
      place("c", 860_000, 6_912_000),
      place("d", 885_000, 6_912_000),
      place("e", 872_000, 6_903_000),
      place("f", 866_000, 6_908_000),
      place("g", 880_000, 6_899_000),
      place("h", 875_000, 6_910_000)
    ]
    expect(georeference(eight).order).toBe(2)
    expect(georeference(eight).rms).toBeLessThan(1e-3)
    expect(() => georeference(eight.slice(0, 2))).toThrow("3 control points")
    expect(() => georeference(eight.slice(0, 5), 2)).toThrow("6 control points")
    expect(() =>
      georeference([place("a", 860_000, 6_895_000), place("b", 861_000, 6_895_000), place("c", 862_000, 6_895_000)])
    ).toThrow("line")
  })

  it("stretches the scan through every point when made exact, easing each one's miss in around it", () => {
    // A sheet with a crease: the points east of 875 000 drawn 12 pixels too far right.
    const grid = Array.from({ length: 16 }, (_, index) => {
      const x = 870_000 + (index % 4) * 3000
      const y = 6_900_000 + Math.floor(index / 4) * 3000
      const [u, v] = scanPixel(x, y)
      return { name: `grid ${index}`, ground: [x, y], pixel: [x > 875_000 ? u + 12 : u, v] } as const
    })
    const loose = georeference(grid, 1)
    const exact = georeference(grid, 1, true)
    expect(loose.rms).toBeGreaterThan(5)
    // The residuals still say how much the sheet is bent; but the exact fit passes through each point.
    expect(exact.rms).toBeCloseTo(loose.rms, 6)
    for (const point of grid) {
      const [u, v] = exact.toPixel(point.ground[0], point.ground[1])
      expect(u).toBeCloseTo(point.pixel[0], 6)
      expect(v).toBeCloseTo(point.pixel[1], 6)
    }
    // Between points, it takes up the crease on its own side.
    const [u] = exact.toPixel(879_500, 6_904_500)
    expect(u - scanPixel(879_500, 6_904_500)[0]).toBeGreaterThan(8)
  })
})
