import { carveTrenches, createFlatMap, heightAt, sampleIndex, TRENCH_PROFILE, type Trench } from "@verdun/map"
import { describe, expect, it } from "vitest"
import { createRenderHeights } from "./render-heights.ts"

/** A flat 40 m x 40 m field at height 10 with a north-facing fire trench along z = 20. */
function trenchField() {
  const map = createFlatMap({ name: "field", cellSize: 0.5, columns: 80, rows: 80 }, 10)
  const trench: Trench = {
    kind: "fire",
    points: [
      [5, 20],
      [35, 20]
    ],
    facing: "north"
  }
  carveTrenches(map, [trench])
  return { ...map, trenches: [trench] }
}

describe("createRenderHeights", () => {
  it("pulls the ground down past the trench walls and under the lips, so it stays under the trench kit", () => {
    const map = trenchField()
    const { heights } = createRenderHeights(map, true)
    const height = (x: number, z: number) => heights[sampleIndex(map, x / map.cellSize, z / map.cellSize)]

    // The floor is drawn a little lower, under the kit's floor.
    expect(height(20, 20)).toBeLessThan(10 - TRENCH_PROFILE.floorDepth)
    // The sample just behind the rear wall is lowered to the floor beside it; the simulation keeps its parados.
    expect(heightAt(map, 20, 18.5)).toBeGreaterThan(10)
    expect(height(20, 18.5)).toBeLessThan(10 - TRENCH_PROFILE.floorDepth)
    // The crest of the lip is drawn lower than it is.
    expect(height(20, 18)).toBeLessThan(heightAt(map, 20, 18) - 0.2)
    // Beyond the lips, the ground is the simulation's.
    expect(height(20, 16)).toBe(heightAt(map, 20, 16))
    expect(height(20, 30)).toBe(10)
  })

  it("draws the simulation's ground unchanged until shaped for the trench kit", () => {
    const map = trenchField()
    const { heights, shade } = createRenderHeights(map, false)

    expect(heights).toEqual(map.heights)
    expect(shade.every((value) => value === 1)).toBe(true)
  })

  it("darkens the spoil either side of a trench", () => {
    const map = trenchField()
    const { shade } = createRenderHeights(map, true)

    expect(shade[sampleIndex(map, 40, 46)]).toBeLessThan(0.8)
    expect(shade[sampleIndex(map, 40, 60)]).toBe(1)
  })

  it("never raises the ground", () => {
    const map = trenchField()
    const { heights } = createRenderHeights(map, true)

    expect(heights.every((height, index) => height <= map.heights[index])).toBe(true)
  })

  it("recomputes a region after the map's heights change there", () => {
    const map = trenchField()
    const renderHeights = createRenderHeights(map, true)
    const index = sampleIndex(map, 10, 70)
    map.heights[index] = 3

    expect(renderHeights.heights[index]).toBe(10)
    renderHeights.update(9, 69, 11, 71)
    expect(renderHeights.heights[index]).toBe(3)
  })
})
