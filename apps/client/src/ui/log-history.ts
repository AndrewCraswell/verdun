import type { LogMessage } from "../hud/battle-log.ts"

/**
 * The battle log's history (H14 in docs/design/interface.md): every line of the last hour of battle, kept after the
 * log on screen lets it go, because lines scroll away in the busy moments when they matter most. Opened from the menu.
 */

/** A line of the log as the history keeps it: with the battle's hour it was last said at. */
export interface HistoryLine {
  readonly message: LogMessage
  /** "07:12", by the battle's clock. */
  readonly hour: string
}

/** How much the history keeps: an hour of battle, and never more than this many lines. */
const KEEP_SECONDS = 3600
const KEEP_LINES = 300

export interface LogHistory {
  /** Reads the log on screen as it is now, at a simulation step and the battle's hour. */
  observe(messages: readonly LogMessage[], tick: number, hour: string): void
  /** The lines of the last hour, newest first. */
  readonly lines: readonly HistoryLine[]
}

export function createLogHistory(tickRate: number): LogHistory {
  const kept = new Map<number, HistoryLine>()
  let lines: HistoryLine[] = []
  let lastTick = 0
  return {
    observe(messages, tick, hour) {
      let changed = false
      // Time going backwards is a new battle: start afresh.
      if (tick < lastTick) {
        kept.clear()
        changed = true
      }
      lastTick = tick
      for (const message of messages) {
        const known = kept.get(message.id)
        // Repeated lines merge on screen ("4 prisoners taken"): the history takes the latest wording and time.
        if (known && known.message.tick === message.tick && known.message.text === message.text) {
          continue
        }
        kept.delete(message.id)
        kept.set(message.id, { message, hour: known && known.message.tick === message.tick ? known.hour : hour })
        changed = true
      }
      for (const [id, line] of kept) {
        if (tick - line.message.tick > KEEP_SECONDS * tickRate || kept.size > KEEP_LINES) {
          kept.delete(id)
          changed = true
        }
      }
      if (changed) {
        lines = [...kept.values()].reverse()
      }
    },
    get lines() {
      return lines
    }
  }
}
