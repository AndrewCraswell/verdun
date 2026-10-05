import { readFileSync } from "node:fs"
import { decodeElevation, generateFleurySector, heightAt } from "@verdun/map"
import { type WorldPoint } from "@verdun/sim"
import { createLineOfSight } from "@verdun/sim/physics"
import { describe, expect, it } from "vitest"
import { createTerrainSight } from "./terrain-sight.ts"

const elevation = readFileSync(new URL("../../../../packages/map/data/fleury-elevation.bin", import.meta.url))
const map = generateFleurySector({ seed: 1916, elevation: decodeElevation(new Uint8Array(elevation).buffer) })

/** A man's eye at a ground point, or a point just above the ground there. */
const eye = (x: number, z: number, above = 1.6): WorldPoint => ({ x, y: heightAt(map, x, z) + above, z })

describe("the page's sight lines", () => {
  it("agree with the simulation's physics nearly everywhere on the battlefield", async () => {
    const physics = await createLineOfSight(map)
    const terrain = createTerrainSight(map)
    // A fixed spread of eyes and targets, up to a couple of hundred metres apart.
    let seed = 1
    const next = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    let agreed = 0
    let blocked = 0
    const pairs = 600
    for (let pair = 0; pair < pairs; pair++) {
      const x = 40 + next() * 520
      const z = 40 + next() * 320
      const from = eye(x, z)
      const to = eye(x + (next() - 0.5) * 300, z + (next() - 0.5) * 300, next() < 0.5 ? 1.6 : 0.4)
      const expected = physics.isClear(from, to)
      blocked += expected ? 0 : 1
      agreed += terrain.isClear(from, to) === expected ? 1 : 0
    }
    physics.dispose()

    // Both kinds of answer come up, and they agree on all but a few grazing lines.
    expect(blocked).toBeGreaterThan(pairs / 10)
    expect(agreed / pairs).toBeGreaterThan(0.95)
  })

  it("sees across a short stretch of open ground, and not through the ground itself", () => {
    const terrain = createTerrainSight(map)
    const from = eye(300, 200)

    expect(terrain.isClear(from, eye(301, 201))).toBe(true)
    expect(terrain.isClear(from, { ...eye(320, 200), y: heightAt(map, 320, 200) - 2 })).toBe(false)
    expect(terrain.isClear(from, from)).toBe(true)
    expect(terrain.rebuildRegion(0, 0, 1, 1)).toBe(1)
  })
})
