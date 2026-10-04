import { describe, expect, it } from "vitest"
import { blockReach, insideBlock, sightBlocks } from "./sight-shapes.ts"

describe("sightBlocks", () => {
  it("gives houses their art's boxes, turned with their heading and scaled", () => {
    const [shell] = sightBlocks({ kind: "ruin", x: 10, z: 20, heading: Math.PI / 2, variant: 9, scale: 2 })

    expect(shell).toEqual({
      kind: "box",
      x: 10,
      z: 20,
      yaw: Math.PI / 2,
      halfAcross: 14.3,
      halfAlong: 11.1,
      height: 9
    })
    // Turned a quarter, its across axis runs north-south.
    expect(shell && insideBlock(shell, 10, 20 + 14)).toBe(true)
    expect(shell && insideBlock(shell, 10 + 14, 20)).toBe(false)
    expect(shell && blockReach(shell)).toBeCloseTo(Math.sqrt(14.3 ** 2 + 11.1 ** 2))
  })

  it("keeps round footprints for trees and the like, and cuts everything down to a knocked-down height", () => {
    const [tree] = sightBlocks({ kind: "tree", x: 0, z: 0, heading: 0, variant: 0, scale: 1 })
    expect(tree).toEqual({ kind: "cylinder", x: 0, z: 0, radius: 0.6, height: 8 })
    expect(tree && insideBlock(tree, 0.5, 0)).toBe(true)
    expect(tree && insideBlock(tree, 0.5, 0.5)).toBe(false)
    expect(tree && blockReach(tree)).toBe(0.6)

    expect(sightBlocks({ kind: "tree", x: 0, z: 0, heading: 0, variant: 0, scale: 1 }, 0)).toEqual([])
    expect(
      sightBlocks({ kind: "landmark", x: 0, z: 0, heading: 0, variant: 0, scale: 1 }, 3).map((b) => b.height)
    ).toEqual([3, 3])
    expect(sightBlocks({ kind: "ruin", x: 0, z: 0, heading: 0, variant: 0, scale: 1 }, 0)).toEqual([])
  })
})
