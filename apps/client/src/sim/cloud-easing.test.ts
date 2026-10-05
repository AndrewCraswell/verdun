import { describe, expect, it } from "vitest"
import { createCloudEasing } from "./cloud-easing.ts"

describe("easing the smoke between the server's word", () => {
  it("drifts the cloud from what was shown to what was sent, over the time the next word takes", () => {
    const field = { concentration: Float32Array.of(0, 10) }
    const easing = createCloudEasing(field)
    easing.synced(0, Float32Array.of(0, 10))
    easing.advance(0)
    // The next word, 500 ms on: the smoke has moved from the second cell to the first.
    easing.synced(500, Float32Array.of(10, 0))
    field.concentration.set([10, 0])
    easing.advance(500)
    expect([...field.concentration]).toEqual([0, 10])

    easing.advance(750)
    expect([...field.concentration]).toEqual([5, 5])
    easing.advance(1000)
    expect([...field.concentration]).toEqual([10, 0])
    // Never past it, and left alone once there.
    field.concentration[0] = 3
    easing.advance(1500)
    expect(field.concentration[0]).toBe(3)
  })

  it("leaves the cloud as it is when a word brings none", () => {
    const field = { concentration: Float32Array.of(4) }
    const easing = createCloudEasing(field)
    easing.synced(0, null)
    easing.advance(100)
    expect(field.concentration[0]).toBe(4)
  })
})
