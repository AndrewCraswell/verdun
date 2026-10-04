import type { WarDay } from "@verdun/sim"
import { countdownLabel, turnLabel } from "../environment/calendar.ts"

/** Where the war's calendar stands, for the HUD: the turn, the time to the next communiqué, and any wait. */
export interface WarStatus {
  readonly turn: string
  readonly countdown: string
  /** Shown across the screen while the battle waits: the stand-to after a cutoff, or between seasons. */
  readonly banner: string | null
  /** In the stand-to after a daily cutoff. */
  readonly standTo: boolean
}

/** The HUD's lines for the war's calendar at a real moment. */
export function warStatus(day: WarDay, paused: boolean, now: number): WarStatus {
  const countdown = countdownLabel(day, now)
  const standTo = day.phase === "turn" && day.standTo
  let banner: string | null = null
  if (paused) {
    banner = standTo ? `Stand-to. ${countdown}` : `${turnLabel(day)}. ${countdown}`
  }
  return { turn: turnLabel(day), countdown, banner, standTo }
}
