import type { Observable } from "@babylonjs/core/Misc/observable"
import type { Scene } from "@babylonjs/core/scene"

/**
 * Frame tracing: named spans of work, timed every frame, rolled up once a second into where the time goes (the hot
 * spots), and on request captured as a Chrome trace to open in Perfetto (ui.perfetto.dev) or chrome://tracing. While a
 * capture runs, spans are also marked with the User Timing API, so they show in the browser's own performance panel.
 *
 * Spans nest: a span's time includes the spans inside it, and its self time doesn't.
 */
export interface Tracer {
  /** Times a stretch of work under a name and returns its result. */
  span<T>(name: string, work: () => T): T
  /** Starts a span that `end` closes, for work that begins and ends in different callbacks. */
  begin(name: string): void
  end(name: string): void
  /** Marks the end of a frame. Call once a frame. */
  frame(): void
  /** The heaviest spans over the last full second, by time per frame. */
  hotSpots(count?: number): readonly SpanSummary[]
  /** Frames and their duration over the last full second. */
  readonly frames: { readonly perSecond: number; readonly averageMs: number; readonly worstMs: number }
  /** Records every span for some seconds, then resolves with a Chrome trace of them. */
  capture(seconds: number): Promise<ChromeTrace>
  readonly capturing: boolean
}

export interface SpanSummary {
  readonly name: string
  /** Milliseconds a frame spent in the span, including spans inside it. */
  readonly msPerFrame: number
  /** The same, less the spans inside it. */
  readonly selfMsPerFrame: number
  /** The longest single run of it. */
  readonly worstMs: number
  readonly callsPerFrame: number
}

/** The Trace Event format Chrome's tracing and Perfetto read. */
export interface ChromeTrace {
  readonly traceEvents: readonly {
    readonly name: string
    readonly ph: "X" | "i"
    readonly ts: number
    readonly dur?: number
    readonly pid: number
    readonly tid: number
    readonly s?: "g"
  }[]
  readonly displayTimeUnit: "ms"
}

interface Totals {
  total: number
  self: number
  worst: number
  calls: number
}

interface Open {
  readonly name: string
  readonly start: number
  /** Time spent in spans inside this one so far. */
  inner: number
}

/** A tracer reading time from `now`, in milliseconds. */
export function createTracer(now: () => number = () => performance.now()): Tracer {
  let window = new Map<string, Totals>()
  let summary: SpanSummary[] = []
  let framesInWindow = 0
  let windowStart = now()
  let lastFrame = windowStart
  let frameTotal = 0
  let frameWorst = 0
  let frames = { perSecond: 0, averageMs: 0, worstMs: 0 }
  const stack: Open[] = []
  let recording: {
    events: ChromeTrace["traceEvents"][number][]
    until: number
    done: (trace: ChromeTrace) => void
  } | null = null

  function open(name: string): void {
    stack.push({ name, start: now(), inner: 0 })
  }

  function close(name: string): void {
    // Close anything left open inside it, as when work throws.
    while (stack.length > 0) {
      const span = stack.pop()
      if (!span) {
        return
      }
      const end = now()
      const duration = end - span.start
      const parent = stack.at(-1)
      if (parent) {
        parent.inner += duration
      }
      const totals = window.get(span.name) ?? { total: 0, self: 0, worst: 0, calls: 0 }
      totals.total += duration
      totals.self += duration - span.inner
      totals.worst = Math.max(totals.worst, duration)
      totals.calls += 1
      window.set(span.name, totals)
      if (recording) {
        recording.events.push({ name: span.name, ph: "X", ts: span.start * 1000, dur: duration * 1000, pid: 1, tid: 1 })
        performance.measure(span.name, { start: span.start, end })
      }
      if (span.name === name) {
        return
      }
    }
  }

  return {
    span(name, work) {
      open(name)
      try {
        return work()
      } finally {
        close(name)
      }
    },
    begin: open,
    end: close,
    frame() {
      const time = now()
      const length = time - lastFrame
      lastFrame = time
      framesInWindow += 1
      frameTotal += length
      frameWorst = Math.max(frameWorst, length)
      if (recording) {
        recording.events.push({ name: "frame", ph: "i", ts: time * 1000, pid: 1, tid: 1, s: "g" })
        if (time >= recording.until) {
          const { events, done } = recording
          recording = null
          done({ traceEvents: events, displayTimeUnit: "ms" })
        }
      }
      if (time - windowStart >= 1000) {
        const count = framesInWindow
        summary = [...window.entries()]
          .map(([name, totals]) => ({
            name,
            msPerFrame: totals.total / count,
            selfMsPerFrame: totals.self / count,
            worstMs: totals.worst,
            callsPerFrame: totals.calls / count
          }))
          .sort((a, b) => b.selfMsPerFrame - a.selfMsPerFrame)
        frames = {
          perSecond: (count * 1000) / (time - windowStart),
          averageMs: frameTotal / count,
          worstMs: frameWorst
        }
        window = new Map()
        framesInWindow = 0
        frameTotal = 0
        frameWorst = 0
        windowStart = time
      }
    },
    hotSpots(count = 12) {
      return summary.slice(0, count)
    },
    get frames() {
      return frames
    },
    capture(seconds) {
      return new Promise((done) => {
        recording = { events: [], until: now() + seconds * 1000, done }
      })
    },
    get capturing() {
      return recording !== null
    }
  }
}

/**
 * Traces Babylon's own work in each frame: picking the meshes in view, render targets (shadow and depth maps), drawing
 * them, and post-processing; and every callback registered to run before or after each render, named after the
 * function. Call once the scene's observers are in place; callbacks added later are picked up a second later.
 */
export function traceScene(scene: Scene, tracer: Tracer): () => void {
  const removers: (() => void)[] = []
  const phase = <A, B>(before: Observable<A>, after: Observable<B>, name: string) => {
    const opened = before.add(() => tracer.begin(name))
    const closed = after.add(() => tracer.end(name))
    removers.push(
      () => before.remove(opened),
      () => after.remove(closed)
    )
  }
  phase(
    scene.onBeforeActiveMeshesEvaluationObservable,
    scene.onAfterActiveMeshesEvaluationObservable,
    "babylon: select meshes"
  )
  phase(
    scene.onBeforeRenderTargetsRenderObservable,
    scene.onAfterRenderTargetsRenderObservable,
    "babylon: render targets"
  )
  phase(scene.onBeforeDrawPhaseObservable, scene.onAfterDrawPhaseObservable, "babylon: draw")
  phase(scene.onAfterDrawPhaseObservable, scene.onAfterCameraRenderObservable, "babylon: post-process")

  const wrapped = new WeakSet<object>()
  const wrap = <T>(observable: Observable<T>, label: string) => {
    for (const observer of observable.observers) {
      if (wrapped.has(observer)) {
        continue
      }
      wrapped.add(observer)
      const callback = observer.callback
      const name = `${label}: ${callbackName(callback)}`
      observer.callback = (data, state) => tracer.span(name, () => callback(data, state))
    }
  }
  const sweep = () => {
    wrap(scene.onBeforeRenderObservable, "before render")
    wrap(scene.onAfterRenderObservable, "after render")
  }
  sweep()
  const timer = setInterval(sweep, 1000)
  return () => {
    clearInterval(timer)
    for (const remove of removers) {
      remove()
    }
  }
}

/** A name for a callback: its own, or the start of its source. */
function callbackName(callback: { readonly name: string; toString(): string }): string {
  if (callback.name && callback.name !== "callback") {
    return callback.name
  }
  return callback.toString().replace(/\s+/g, " ").slice(0, 48)
}

/** Saves a captured trace as a file, for Perfetto or chrome://tracing. */
export function downloadTrace(trace: ChromeTrace): void {
  const blob = new Blob([JSON.stringify(trace)], { type: "application/json" })
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = `verdun-trace-${new Date().toISOString().replace(/[:.]/g, "-")}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}
