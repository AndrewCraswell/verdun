/**
 * Watching the frame rate (S23 in docs/design/interface.md): when the battle has run slowly for a while, suggest the
 * low graphics setting, once. Counted only while the battle is in front of the player and running, so loading, the
 * menus and a tab in the background don't count against it.
 */

/** Frames a second below which the battle is slow. */
export const SLOW_FPS = 24
/** Seconds of battle the frame rate is judged over. */
export const JUDGED_OVER = 20

export interface FrameWatch {
  /**
   * A frame of `seconds`, drawn while the battle was `watched` (shown and running). Returns the frame rate to suggest
   * a lower setting at, the one time it's due; null otherwise.
   */
  frame(seconds: number, watched: boolean): number | null
}

export function createFrameWatch(alreadySuggested: boolean): FrameWatch {
  let done = alreadySuggested
  let time = 0
  let frames = 0
  return {
    frame(seconds, watched) {
      // A long gap is a stall or a tab coming back, not the frame rate.
      if (done || !watched || seconds <= 0 || seconds > 0.5) {
        return null
      }
      time += seconds
      frames += 1
      if (time < JUDGED_OVER) {
        return null
      }
      const fps = frames / time
      time = 0
      frames = 0
      if (fps >= SLOW_FPS) {
        return null
      }
      done = true
      return Math.round(fps)
    }
  }
}
