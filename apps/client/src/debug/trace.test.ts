import { describe, expect, it, vi } from "vitest"
import { createTracer } from "./trace.ts"

/** A tracer on a clock the test moves by hand. */
function tracerOnClock() {
  let time = 0
  const tracer = createTracer(() => time)
  return {
    tracer,
    advance(ms: number) {
      time += ms
    }
  }
}

describe("createTracer", () => {
  it("sums each span's time a frame over a second, apart from the spans inside it, heaviest first", () => {
    const { tracer, advance } = tracerOnClock()
    for (let frame = 0; frame < 10; frame++) {
      tracer.span("render", () => {
        advance(2)
        tracer.span("draw", () => advance(6))
      })
      tracer.span("sim", () => advance(1))
      advance(91)
      tracer.frame()
    }

    expect(tracer.frames.perSecond).toBeCloseTo(10)
    expect(tracer.frames.averageMs).toBeCloseTo(100)
    expect(tracer.hotSpots().map((spot) => [spot.name, spot.selfMsPerFrame, spot.msPerFrame])).toEqual([
      ["draw", 6, 6],
      ["render", 2, 8],
      ["sim", 1, 1]
    ])
    expect(tracer.hotSpots(1)).toHaveLength(1)
  })

  it("times work that starts and ends in different callbacks, and closes spans that throw", () => {
    const { tracer, advance } = tracerOnClock()
    tracer.begin("select meshes")
    advance(5)
    tracer.end("select meshes")
    expect(() =>
      tracer.span("broken", () => {
        tracer.begin("left open")
        advance(3)
        throw new Error("boom")
      })
    ).toThrow("boom")
    tracer.end("never begun")
    advance(992)
    tracer.frame()

    const spots = Object.fromEntries(tracer.hotSpots().map((spot) => [spot.name, spot.msPerFrame]))
    expect(spots).toEqual({ "select meshes": 5, "left open": 3, broken: 3 })
  })

  it("captures every span for a while as a Chrome trace, marking each frame", async () => {
    const { tracer, advance } = tracerOnClock()
    const measure = vi.spyOn(performance, "measure").mockImplementation(() => ({}) as PerformanceMeasure)
    const captured = tracer.capture(0.05)
    expect(tracer.capturing).toBe(true)
    tracer.span("sim", () => advance(10))
    advance(50)
    tracer.frame()
    const trace = await captured

    expect(tracer.capturing).toBe(false)
    expect(trace.traceEvents).toEqual([
      { name: "sim", ph: "X", ts: 0, dur: 10_000, pid: 1, tid: 1 },
      { name: "frame", ph: "i", ts: 60_000, pid: 1, tid: 1, s: "g" }
    ])
    expect(measure).toHaveBeenCalledWith("sim", { start: 0, end: 10 })
    measure.mockRestore()
  })
})
