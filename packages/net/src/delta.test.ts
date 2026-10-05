import { describe, expect, it } from "vitest"
import { apply, diff } from "./delta.ts"

/** What `next` comes to from `previous` by its patch, which must leave `previous` alone. */
function roundTrip(previous: unknown, next: unknown): unknown {
  const before = structuredClone(previous)
  const patch = diff(previous, next)
  const result = patch ? apply(previous, patch) : previous
  expect(previous).toEqual(before)
  return result
}

describe("what changed", () => {
  it("is nothing for the same values", () => {
    expect(diff({ a: [1, Float32Array.of(2)], b: "x" }, { a: [1, Float32Array.of(2)], b: "x" })).toBeNull()
    expect(diff(Number.NaN, Number.NaN)).toBeNull()
    expect(diff(new ArrayBuffer(4), new ArrayBuffer(4))).toBeNull()
  })

  it("sends only the fields, elements and runs that changed", () => {
    const previous = { tick: 1, keep: { a: 1 }, list: [1, 2, 3], gone: true }
    const next = { tick: 2, keep: { a: 1 }, list: [1, 5, 3], added: "new" }

    expect(diff(previous, next)).toEqual({
      o: { tick: { f: 2 }, list: { a: { 1: { f: 5 } } }, added: { f: "new" } },
      d: ["gone"]
    })
    expect(roundTrip(previous, next)).toEqual(next)
  })

  it("writes typed arrays in runs, close changes together and far ones apart", () => {
    const previous = new Float32Array(100)
    const next = previous.slice()
    next[3] = 1
    next[6] = 2
    next[90] = 3

    expect(diff(previous, next)).toEqual({
      t: [
        [3, Float32Array.of(1, 0, 0, 2)],
        [90, Float32Array.of(3)]
      ]
    })
    expect(roundTrip(previous, next)).toEqual(next)
    expect(diff(previous, previous.slice())).toBeNull()
  })

  it("writes array buffers as bytes", () => {
    const previous = new ArrayBuffer(16)
    const next = new ArrayBuffer(16)
    new Uint8Array(next)[9] = 7
    const result = roundTrip(previous, next)

    expect(result).toBeInstanceOf(ArrayBuffer)
    expect(result instanceof ArrayBuffer ? new Uint8Array(result) : null).toEqual(new Uint8Array(next))
  })

  it("replaces whole what changed shape or type", () => {
    expect(diff(Float32Array.of(1), Float32Array.of(1, 2))).toEqual({ f: Float32Array.of(1, 2) })
    expect(diff(Float32Array.of(1), Int32Array.of(1))).toEqual({ f: Int32Array.of(1) })
    expect(diff([1], [1, 2])).toEqual({ f: [1, 2] })
    expect(diff(new ArrayBuffer(2), new ArrayBuffer(3))).toEqual({ f: new ArrayBuffer(3) })
    expect(diff(null, { a: 1 })).toEqual({ f: { a: 1 } })
    expect(roundTrip({ a: 1 }, null)).toBeNull()
  })

  it("refuses a patch that doesn't fit what it patches", () => {
    expect(() => apply(1, { t: [[0, Float32Array.of(1)]] })).toThrow(
      "A patch of runs for something that isn't a typed array"
    )
    expect(() => apply(Float32Array.of(1), { t: [[0, [1]]] })).toThrow("A run of new values isn't one")
    expect(() => apply({}, { a: {} })).toThrow("An array's patch for something that isn't an array")
    expect(() => apply([], { o: {} })).toThrow("A record's patch for something that isn't a record")
    expect(() => apply({}, { o: [] })).toThrow("A patch's fields aren't a record")
    expect(() => apply({}, { o: { a: 1 } })).toThrow("The patch for a isn't one")
    expect(() => apply({}, { x: 1 })).toThrow("A patch isn't one")
    expect(() => apply(Float32Array.of(1), { t: 3 })).toThrow("A patch of runs for something that isn't a typed array")
  })
})
