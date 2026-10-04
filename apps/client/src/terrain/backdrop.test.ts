import { NullEngine } from "@babylonjs/core/Engines/nullEngine"
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial"
import { Scene } from "@babylonjs/core/scene"
import { createFlatMap, type Elevation } from "@verdun/map"
import { afterEach, describe, expect, it } from "vitest"
import { backdropGround, backdropTrees, createBackdrop, type Surroundings } from "./backdrop.ts"
import { SPLAT_ATTRIBUTE } from "./terrain-chunks.ts"

const engines: NullEngine[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) {
    engine.dispose()
  }
})

/**
 * A 1 km survey every 5 m, rising 1 m in 50 m to the east, at 200 m above the sea, with a 100 m sector at 2 m above its
 * own base of 300 m sitting 450 m in from its south-west corner.
 */
function setup() {
  const columns = 200
  const rows = 200
  const heights = new Float32Array((columns + 1) * (rows + 1))
  for (let row = 0; row <= rows; row++) {
    for (let column = 0; column <= columns; column++) {
      heights[row * (columns + 1) + column] = 100 + (column * 5) / 50
    }
  }
  const elevation: Elevation = { columns, rows, cellSize: 5, base: 200, heights }
  const surroundings: Surroundings = { elevation, sectorBase: 300, sectorOrigin: { x: 450, z: 450 } }
  const map = createFlatMap({ name: "sector", cellSize: 0.5, columns: 200, rows: 200 }, 2)
  return { map, surroundings }
}

/** The backdrop, drawn, and the height of its vertex at (x, z). */
function drawnBackdrop() {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const { map, surroundings } = setup()
  const backdrop = createBackdrop(scene, map, surroundings, new StandardMaterial("ground", scene))
  const positions = backdrop.getVerticesData("position") ?? []
  const heightAt = (x: number, z: number) => {
    for (let index = 0; index < positions.length; index += 3) {
      if (Math.abs((positions[index] ?? 0) - x) < 0.01 && Math.abs((positions[index + 2] ?? 0) - z) < 0.01) {
        return positions[index + 1] ?? 0
      }
    }
    return Number.NaN
  }
  return { map, surroundings, backdrop, heightAt }
}

describe("createBackdrop", () => {
  it("draws the surveyed ground round the sector every 10 m, easing into the sector's edge and sinking under it", () => {
    const { backdrop, heightAt } = drawnBackdrop()

    expect(backdrop.getTotalVertices()).toBe(101 * 101)
    expect(backdrop.getVerticesData(SPLAT_ATTRIBUTE)).toHaveLength(101 * 101 * 4)
    // Far out, the survey: 200 m + 100 m + 1 m per 50 m east, less the sector's 300 m base.
    expect(heightAt(-450, 0)).toBeCloseTo(0)
    expect(heightAt(540, 0)).toBeCloseTo(19.8)
    // At the sector's edge, just under it; inside it, well under.
    expect(heightAt(0, 50)).toBeCloseTo(2 - 0.25)
    expect(heightAt(50, 50)).toBeLessThan(-3)
    expect(backdrop.receiveShadows).toBe(false)
  })
})

describe("backdropGround", () => {
  it("gives the height of the ground as the backdrop draws it, at its vertices and across its triangles", () => {
    const { map, surroundings, heightAt } = drawnBackdrop()
    const ground = backdropGround(map, surroundings)

    for (const [x, z] of [
      [-450, 0],
      [-10, -10],
      [0, 50],
      [120, 130]
    ] as const) {
      expect(ground(x, z)).toBeCloseTo(heightAt(x, z))
    }
    // Far out, the survey, which rises evenly to the east: its triangles draw it as it is.
    expect(ground(-300.3, -200.7)).toBeCloseTo(149.7 / 50)
    // Off the sector's corner the ground bends, and each square is drawn as two triangles split from its near right
    // corner to its far left one: halfway across, the ground lies on that diagonal, not the other.
    const split = (heightAt(0, -10) + heightAt(-10, 0)) / 2
    const other = (heightAt(-10, -10) + heightAt(0, 0)) / 2
    expect(Math.abs(split - other)).toBeGreaterThan(0.02)
    expect(ground(-5, -5)).toBeCloseTo(split)
  })
})

describe("backdropTrees", () => {
  it("stands trees on the survey round the sector, never in it", () => {
    const { map, surroundings } = setup()
    const trees = backdropTrees(map, surroundings)

    expect(trees.length).toBeGreaterThan(50)
    expect(trees.every(({ x, z }) => x < -4 || z < -4 || x > 104 || z > 104)).toBe(true)
    // Each on the ground beneath it: about 1 m higher every 50 m east.
    const tree = trees[0]
    expect(tree?.y).toBeCloseTo((tree?.x ?? 0) / 50 + 9, 0)
  })
})
