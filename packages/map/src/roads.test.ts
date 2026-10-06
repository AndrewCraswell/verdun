import { describe, expect, it } from "vitest"
import { createFlatMap, sampleIndex } from "./format.ts"
import { findDebus, roadsBehindLines, type SideLines } from "./roads.ts"

describe("roadsBehindLines", () => {
  it("cuts a road where it crosses each side's rear limit, each piece serving the side behind whose lines it lies", () => {
    const roads = roadsBehindLines(
      [
        [
          [10, 0],
          [10, 100]
        ],
        [
          [0, 50],
          [40, 50]
        ]
      ],
      { french: 30, german: 70 },
      1
    )
    expect(roads).toEqual([
      {
        points: [
          [10, 0],
          [10, 30]
        ],
        behind: "french"
      },
      {
        points: [
          [10, 30],
          [10, 70]
        ],
        behind: null
      },
      {
        points: [
          [10, 70],
          [10, 100]
        ],
        behind: "german"
      },
      {
        points: [
          [0, 50],
          [40, 50]
        ],
        behind: null
      }
    ])
    expect(roadsBehindLines([[]], { french: 30, german: 70 }, 1)).toEqual([])
  })

  it("puts the French rear toward +z when the French face -z", () => {
    const [road] = roadsBehindLines(
      [
        [
          [0, 90],
          [0, 100]
        ]
      ],
      { french: 80, german: 20 },
      -1
    )
    expect(road?.behind).toBe("french")
  })
})

describe("findDebus", () => {
  // 100 m by 150 m: the French along z 100, the Germans along z 130 and 135, and a bank 6 m high across z 30 to 34
  // hiding the ground south of it from the German lines.
  const map = createFlatMap({ name: "bank", cellSize: 1, columns: 100, rows: 150 }, 0)
  for (let row = 30; row <= 34; row++) {
    for (let column = 0; column <= 100; column++) {
      map.heights[sampleIndex(map, column, row)] = 6
    }
  }
  const line = (z: number) =>
    [
      [0, z],
      [100, z]
    ] as const
  const french: SideLines = { side: "french", towardEnemy: 1, front: line(100), lines: [line(100)] }
  const german: SideLines = { side: "german", towardEnemy: -1, front: line(130), lines: [line(130), line(135)] }
  const road = {
    points: [
      [50, 0],
      [50, 100]
    ] as const,
    behind: "french" as const
  }

  it("stops a lorry on its side's road at the spot nearest the front the enemy can't see, facing the front", () => {
    const debus = findDebus(map, [road], french, german, () => false)
    expect(debus?.side).toBe("french")
    expect(debus?.seenBy).toBe(0)
    expect(debus?.z).toBeLessThan(30)
    expect(debus?.z).toBeGreaterThan(20)
    expect(debus?.heading).toBeCloseTo(0)
  })

  it("keeps off the places it's told to avoid, and finds nothing on roads that aren't its side's", () => {
    const debus = findDebus(map, [road], french, german, (_x, z) => z > 15)
    expect(debus?.z).toBeLessThanOrEqual(15)
    expect(findDebus(map, [{ ...road, behind: "german" }], french, german, () => false)).toBeNull()
  })

  it("takes the least-seen spot where the enemy overlooks the whole road", () => {
    const open = createFlatMap({ name: "open", cellSize: 1, columns: 100, rows: 150 }, 0)
    const southward = {
      points: [
        [50, 100],
        [50, 0]
      ] as const,
      behind: "french" as const
    }
    const debus = findDebus(
      open,
      [
        southward,
        {
          points: [
            [0, 0],
            [0, 0]
          ],
          behind: "french"
        }
      ],
      french,
      german,
      () => false
    )
    expect(debus?.seenBy).toBeGreaterThan(0)
    expect(debus?.heading).toBeCloseTo(0)
  })
})
