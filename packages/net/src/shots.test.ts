import { type ShotEvent, type SimEvent, TICK_RATE } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { createShotThinning, FAR_SHOTS, putShots, shotColumns, takeShots } from "./shots.ts"
import { cellGrid } from "./soldier-cells.ts"

/** 200 m square in 100 m cells: 0 and 1 along the south, 2 and 3 north of them. */
const grid = cellGrid(200, 200, 100)

function shot(shooter: number, from: [number, number], to: [number, number], hit = false): ShotEvent {
  return {
    type: "shot",
    shooter,
    target: shooter === 2 ? -1 : shooter + 100,
    hit,
    from: { x: from[0], y: 1.5, z: from[1] },
    to: { x: to[0], y: 0.9, z: to[1] }
  }
}

describe("shots", () => {
  it("are taken out of the steps, the other events left", () => {
    const burst: SimEvent = { type: "flare", side: 0, x: 1, z: 2 }
    const fired = shot(1, [10, 10], [150, 150])
    const { steps, shots } = takeShots([{ tick: 4, events: [fired, burst] }])

    expect(steps).toEqual([{ tick: 4, events: [burst] }])
    expect(shots).toEqual([{ tick: 4, event: fired }])
  })

  it("are grouped by the cells they're fired from and land in, and the far few are one a gun now and then", () => {
    const thin = createShotThinning(grid, TICK_RATE)
    const shots = [
      { tick: 0, event: shot(1, [10, 10], [150, 150]) },
      { tick: 0, event: shot(1, [11, 10], [150, 150]) },
      { tick: 0, event: shot(2, [150, 10], [150, 10]) },
      ...Array.from({ length: FAR_SHOTS + 2 }, (_, index) => ({
        tick: 1,
        event: shot(10 + index, [10, 10], [150, 150])
      }))
    ]
    const groups = thin(shots)

    expect(groups.map((group) => [group.from, group.to, group.all.length])).toEqual([
      [0, 3, 2 + FAR_SHOTS + 2],
      [1, 1, 1]
    ])
    // The first gun once (not its second shot), then the others up to the stretch's few.
    expect(groups[0]?.far.map((each) => each.event.shooter)).toEqual([1, 10, 11])
    expect(groups[0]?.far.length).toBe(FAR_SHOTS)
    // A gun heard far is heard again only after a while.
    expect(thin([{ tick: 2, event: shot(1, [10, 10], [150, 150]) }])[0]?.far).toEqual([])
    expect(thin([{ tick: 2 + 2 * TICK_RATE, event: shot(1, [10, 10], [150, 150]) }])[0]?.far.length).toBe(1)
  })

  it("go as columns and come back into their steps, to the centimetre", () => {
    const first = shot(1, [10.004, 20], [150, 150.5], true)
    const second = shot(2, [30, 40], [-5, 300])
    const columns = shotColumns(
      [
        { tick: 9, event: first },
        { tick: 10, event: second }
      ],
      10,
      0.01
    )
    const burst: SimEvent = { type: "flare", side: 0, x: 1, z: 2 }
    const steps = putShots([{ tick: 10, events: [burst] }], columns, 10, 0.01)

    expect(steps.map((step) => step.tick)).toEqual([9, 10])
    expect(steps[0]?.events).toEqual([{ ...first, from: { x: 10, y: 1.5, z: 20 }, to: { x: 150, y: 0.9, z: 150.5 } }])
    // Off the map, a shot's end is kept to its edge.
    expect(steps[1]?.events).toEqual([burst, { ...second, to: { x: 0, y: 0.9, z: 300 } }])
    expect(() => putShots([], { t: [1] }, 10, 0.01)).toThrow("The server sent shots this client can't read")
    expect(() => putShots([], null, 10, 0.01)).toThrow("The server sent shots this client can't read")
  })
})
