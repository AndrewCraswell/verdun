import { scheduleForWeek, type WarSchedule } from "@verdun/sim"

/** Where the schedule is kept between visits. */
export const SCHEDULE_KEY = "verdun.war-schedule"

/** The little of `Storage` the schedule needs; reads and writes may throw (private windows, blocked site data). */
export interface ScheduleStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

const isSchedule = (value: unknown): value is WarSchedule =>
  typeof value === "object" &&
  value !== null &&
  "begins" in value &&
  "breakDays" in value &&
  "standToMinutes" in value &&
  Number.isFinite(value.begins) &&
  Number.isFinite(value.breakDays) &&
  Number.isFinite(value.standToMinutes)

function stored(store: ScheduleStore | null): WarSchedule | null {
  try {
    const text = store?.getItem(SCHEDULE_KEY)
    const value: unknown = text ? JSON.parse(text) : null
    return isSchedule(value) ? value : null
  } catch {
    return null
  }
}

function keep(store: ScheduleStore | null, schedule: WarSchedule): void {
  try {
    store?.setItem(SCHEDULE_KEY, JSON.stringify(schedule))
  } catch {
    // Without storage the war starts afresh next visit; nothing else depends on it.
  }
}

/** A date from `?war=`, as 00:00 UTC on it, or null when it isn't one. */
function dateOf(text: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  if (!match) {
    return null
  }
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isFinite(utc) ? utc : null
}

export interface ScheduleOptions {
  /** The week to begin in when there is no schedule yet: the battle's own. */
  readonly week: number
  readonly now: number
  /** Where the schedule is kept, or null when there is no storage. */
  readonly store: ScheduleStore | null
  /** Dev parameters from the address, honoured only in development: `war` and `standto`. */
  readonly search?: URLSearchParams
}

/**
 * The war's schedule for local play, kept between visits so the war goes on a week a real day, as it will on a server.
 * In development, `?war=1916-02-21` starts the war's calendar so that today's turn is the week of that date,
 * `?war=reset` forgets the kept schedule, and `?standto=0` (any number of minutes) sets the pause after each cutoff.
 * Falls back to beginning in the battle's own week, and to a fresh schedule if the kept one names no week of the war.
 */
export function localSchedule({ week, now, store, search }: ScheduleOptions): WarSchedule {
  const standTo = search?.get("standto")
  const minutes = standTo === null || standTo === undefined || standTo === "" ? Number.NaN : Number(standTo)
  const options = Number.isFinite(minutes) && minutes >= 0 ? { standToMinutes: minutes } : {}
  const war = search?.get("war")
  if (war === "reset") {
    try {
      store?.removeItem(SCHEDULE_KEY)
    } catch {
      // Nothing kept, nothing to forget.
    }
  }
  const chosen = war ? dateOf(war) : null
  if (chosen !== null) {
    try {
      const schedule = scheduleForWeek(chosen, now, options)
      keep(store, schedule)
      return schedule
    } catch {
      // Not a week of the war: carry on as if it hadn't been asked for.
    }
  }
  const kept = war === "reset" ? null : stored(store)
  if (kept) {
    return { ...kept, ...options }
  }
  const schedule = scheduleForWeek(week, now, options)
  keep(store, schedule)
  return schedule
}

/** The browser's local storage, or null where it is blocked. */
export function browserStore(): ScheduleStore | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
