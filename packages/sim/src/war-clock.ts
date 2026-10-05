import { enqueueCommand, type Simulation } from "./simulation.ts"
import { type WarDay, warDayAt, type WarSchedule } from "./war-calendar.ts"

/** Drives a battle from the war's calendar: the week it is fought in, and whether it waits. */
export interface WarClock {
  readonly schedule: WarSchedule
  /** Where the war stands, as of the last update. */
  readonly day: WarDay
  /** Whether the battle waits: the stand-to after each cutoff, between seasons, before the war and after it. */
  readonly paused: boolean
  /** Reads the calendar at a real moment, moving the battle to a new week when a turn has begun. */
  update(now: number): void
}

/**
 * Keeps a battle on the war's calendar. At each daily cutoff the battle moves to the new week, by the `clock` command's
 * `week`, so the sky and weather go with it while the hour carries on; through the stand-to that follows, and between
 * seasons, the battle waits.
 */
export function createWarClock(sim: Simulation, schedule: WarSchedule, now = Date.now()): WarClock {
  let day = warDayAt(schedule, now)
  // The week last sent to the battle. Only a new turn moves it, so a dev key choosing another week isn't undone.
  let sent = sim.environment.clock.week
  const clock: WarClock = {
    schedule,
    get day() {
      return day
    },
    get paused() {
      return day.phase !== "turn" || day.standTo
    },
    update(at) {
      day = warDayAt(schedule, at)
      if (day.phase === "turn" && day.week !== sent) {
        sent = day.week
        enqueueCommand(sim, { type: "clock", week: day.week })
      }
    }
  }
  clock.update(now)
  return clock
}
