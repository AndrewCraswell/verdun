import { describe, expect, it } from "vitest"
import { railwayCourse } from "./railways.ts"
import type { GroundPoint } from "./trenches.ts"

/** How far each leg of a course turns from the one before, in radians. */
function turns(course: readonly GroundPoint[]): number[] {
  const headings = course
    .slice(1)
    .map(([x, z], index) => Math.atan2(x - (course[index]?.[0] ?? 0), z - (course[index]?.[1] ?? 0)))
  return headings.slice(1).map((heading, index) => {
    const turn = Math.abs(heading - (headings[index] ?? 0))
    return Math.min(turn, 2 * Math.PI - turn)
  })
}

describe("railwayCourse", () => {
  it("keeps a straight line as it is", () => {
    const points: GroundPoint[] = [
      [0, 0],
      [50, 0],
      [100, 0]
    ]
    expect(railwayCourse({ points })).toEqual(points)
  })

  it("eases a corner into a curve the track can take, from end to end of the line", () => {
    const course = railwayCourse({
      points: [
        [0, 0],
        [100, 0],
        [100, 100]
      ]
    })
    expect(course[0]).toEqual([0, 0])
    expect(course.at(-1)).toEqual([100, 100])
    expect(Math.max(...turns(course))).toBeLessThan(0.15)
    // It cuts the corner by several metres, but no more than a curve some 25 m round would.
    const corner = Math.min(...course.map(([x, z]) => Math.hypot(x - 100, z)))
    expect(corner).toBeGreaterThan(5)
    expect(corner).toBeLessThan(12)
  })

  it("takes no more than half of a short leg for each of its corners, and repeats no point", () => {
    const course = railwayCourse({
      points: [
        [0, 0],
        [30, 0],
        [30, 0],
        [40, 10],
        [70, 10]
      ]
    })
    expect(course[0]).toEqual([0, 0])
    expect(course.at(-1)).toEqual([70, 10])
    for (const [index, [x, z]] of course.slice(1).entries()) {
      const [px, pz] = course[index] ?? [0, 0]
      expect(Math.hypot(x - px, z - pz)).toBeGreaterThan(1e-6)
    }
    // The curves meet halfway along the diagonal leg between the corners.
    expect(course.some(([x, z]) => Math.hypot(x - 35, z - 5) < 1e-9)).toBe(true)
  })
})
