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

  it("hides what's behind the church's nave, tower and apse, the tower standing tallest at its west end", () => {
    const blocks = sightBlocks({ kind: "landmark", x: 100, z: 50, heading: Math.PI / 2, variant: 1, scale: 1 })
    const tower = blocks.find((block) => block.height === Math.max(...blocks.map(({ height }) => height)))

    expect(blocks).toHaveLength(3)
    // Its apse faces east, so its tower stands west of its middle.
    expect(tower?.x).toBeCloseTo(93.75)
    expect(tower?.z).toBeCloseTo(50)
    expect(tower?.height).toBe(8.5)
  })

  it("keeps round footprints for trees and the like, and cuts everything down to a knocked-down height", () => {
    const [tree] = sightBlocks({ kind: "tree", x: 0, z: 0, heading: 0, variant: 0, scale: 1 })
    expect(tree).toEqual({ kind: "cylinder", x: 0, z: 0, radius: 0.6, height: 8 })
    expect(tree && insideBlock(tree, 0.5, 0)).toBe(true)
    expect(tree && insideBlock(tree, 0.5, 0.5)).toBe(false)
    expect(tree && blockReach(tree)).toBe(0.6)

    expect(sightBlocks({ kind: "tree", x: 0, z: 0, heading: 0, variant: 0, scale: 1 }, 0)).toEqual([])
    // An orchard's fruit tree, a man and a half high.
    expect(sightBlocks({ kind: "fruit-tree", x: 0, z: 0, heading: 0, variant: 2, scale: 1 })).toEqual([
      { kind: "cylinder", x: 0, z: 0, radius: 0.3, height: 2.8 }
    ])
    expect(
      sightBlocks({ kind: "landmark", x: 0, z: 0, heading: 0, variant: 0, scale: 1 }, 3).map((b) => b.height)
    ).toEqual([3, 3])
    expect(sightBlocks({ kind: "ruin", x: 0, z: 0, heading: 0, variant: 0, scale: 1 }, 0)).toEqual([])
  })
})
