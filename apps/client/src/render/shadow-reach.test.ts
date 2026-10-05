import { Frustum } from "@babylonjs/core/Maths/math.frustum"
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector"
import { describe, expect, it } from "vitest"
import { lowestGround, sunShadowInView } from "./shadow-reach.ts"

/**
 * A camera's view of the ground from x 0 to 10 and z 0 to 10, from 100 m below to 100 m above: as clip space has it,
 * x and z across, height in depth.
 */
const VIEW = Frustum.GetPlanes(Matrix.FromValues(0.2, 0, 0, 0, 0, 0, 0.01, 0, 0, 0.2, 0, 0, -1, -1, 0, 1))

/** A box standing on the ground from x to x + 1, z 4 to 5, `height` tall. */
const box = (x: number, height: number): [Vector3, Vector3] => [new Vector3(x, 0, 4), new Vector3(x + 1, height, 5)]

describe("whether a shadow can fall within the view", () => {
  it("keeps a caster in view, whichever way the light goes", () => {
    const [min, max] = box(4, 2)
    expect(sunShadowInView(min, max, new Vector3(-1, -1, 0), 0, VIEW)).toBe(true)
    expect(sunShadowInView(min, max, new Vector3(1, -1, 0), 0, VIEW)).toBe(true)
  })

  it("leaves out a caster off to the side whose shadow can't reach the view, as far as the sun's height lets it fall", () => {
    // 30 m east of the view, its shadow falling west from 5 m up, at 45 degrees: 5 m.
    const [min, max] = box(40, 5)
    expect(sunShadowInView(min, max, new Vector3(-1, -1, 0), 0, VIEW)).toBe(false)
    // Falling away from the view, however tall.
    const [, tower] = box(40, 60)
    expect(sunShadowInView(min, tower, new Vector3(1, -1, 0), 0, VIEW)).toBe(false)
    // Tall enough for its shadow to reach the view.
    expect(sunShadowInView(min, tower, new Vector3(-1, -1, 0), 0, VIEW)).toBe(true)
    // Or standing above ground that falls away to a hollow: the shadow goes on down to the floor given.
    expect(sunShadowInView(min, max, new Vector3(-1, -1, 0), -40, VIEW)).toBe(true)
  })

  it("keeps every caster when the sun is on the horizon, whose shadows reach as far as can be", () => {
    const [min, max] = box(400, 1)
    expect(sunShadowInView(min, max, new Vector3(-1, 0, 0), 0, VIEW)).toBe(true)
    expect(sunShadowInView(min, max, new Vector3(-1, 0.1, 0), 0, VIEW)).toBe(true)
  })

  it("takes the lowest ground as the map's lowest height less what shellfire can dig", () => {
    expect(lowestGround(new Float32Array([3, -2, 7]))).toBe(-7)
    expect(lowestGround([3, -2, 7], 1)).toBe(-3)
    expect(lowestGround([])).toBe(-5)
  })
})
