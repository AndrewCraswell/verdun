import { describe, expect, it } from "vitest"
import { createFixedStepper } from "./stepper.ts"

describe("createFixedStepper", () => {
  it("runs one step per full step of elapsed time and carries the remainder", () => {
    const stepper = createFixedStepper(0.05)

    expect(stepper.advance(0.03)).toBe(0)
    expect(stepper.alpha).toBeCloseTo(0.6)
    expect(stepper.advance(0.03)).toBe(1)
    expect(stepper.alpha).toBeCloseTo(0.2)
    expect(stepper.advance(0.1)).toBe(2)
  })

  it("drops the backlog after a long stall instead of catching up", () => {
    const stepper = createFixedStepper(0.05, 5)

    expect(stepper.advance(10)).toBe(5)
    expect(stepper.alpha).toBe(0)
    expect(stepper.advance(0.05)).toBe(1)
  })

  it("ignores negative elapsed time", () => {
    const stepper = createFixedStepper(0.05)

    expect(stepper.advance(-1)).toBe(0)
    expect(stepper.alpha).toBe(0)
  })

  it("rejects non-positive step lengths", () => {
    expect(() => createFixedStepper(0)).toThrow(RangeError)
  })
})
