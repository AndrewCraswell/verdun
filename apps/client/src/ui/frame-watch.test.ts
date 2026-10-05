import { describe, expect, it } from "vitest"
import { createFrameWatch, JUDGED_OVER } from "./frame-watch.ts"

function run(watch: ReturnType<typeof createFrameWatch>, fps: number, seconds: number, watched = true): number | null {
  let said: number | null = null
  for (let frame = 0; frame < fps * seconds; frame++) {
    said = watch.frame(1 / fps, watched) ?? said
  }
  return said
}

describe("watching the frame rate", () => {
  it("suggests a lower setting once, after a stretch of slow battle", () => {
    const watch = createFrameWatch(false)
    expect(run(watch, 18, JUDGED_OVER - 1)).toBeNull()
    expect(run(watch, 18, 2)).toBe(18)
    expect(run(watch, 12, JUDGED_OVER * 2)).toBeNull()
  })

  it("says nothing when the battle runs well, when it isn't watched, or once it has said it before", () => {
    expect(run(createFrameWatch(false), 50, JUDGED_OVER * 2)).toBeNull()
    expect(run(createFrameWatch(false), 15, JUDGED_OVER * 2, false)).toBeNull()
    expect(run(createFrameWatch(true), 15, JUDGED_OVER * 2)).toBeNull()
    // Stalls don't count as slow frames.
    expect(createFrameWatch(false).frame(3, true)).toBeNull()
  })
})
