/**
 * The war's calendar: which week of the war is being fought at a real moment, in which season, and when the next daily
 * turn comes (docs/design/war-map-and-season.md#seasons-and-the-war, docs/time-and-weather.md).
 *
 * One game is the war on the Western Front, from 4 August 1914 to the armistice on 11 November 1918. Each real day is
 * one week of the war, ending at the daily cutoff; each year of the war is a season, with a week off between seasons.
 * Counting weeks from Tuesday 4 August 1914 gives the seasons their lengths: 22 weeks in 1914, 52 in 1915, 1916 and
 * 1917, and 45 in 1918, the last being the week of the armistice.
 *
 * Pure arithmetic on real and war time, so the war-map server, the sector servers and every client agree on the date
 * without being told it. A sector moves its battle to a new week with the `clock` command's `week`.
 */

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/** The first week of the war: Tuesday 4 August 1914, when Germany invaded Belgium and Britain declared war. */
export const WAR_BEGINS = Date.UTC(1914, 7, 4)
/** The armistice: 11 November 1918. The war's last week is the one it falls in. */
export const ARMISTICE = Date.UTC(1918, 10, 11)
/** The years of the war, each a season. */
export const SEASONS = [1914, 1915, 1916, 1917, 1918] as const
export type Season = (typeof SEASONS)[number]

/** How a war is scheduled in real time. Plain data, so it saves with the war map. */
export interface WarSchedule {
  /** The real moment the war's first turn begins, in milliseconds since 1970 UTC: a daily cutoff. */
  readonly begins: number
  /** Real days off between seasons: the year's memorial, rewards and the next year's announcement. */
  readonly breakDays: number
  /** Real minutes of stand-to after each cutoff, while the war moves on and the battle pauses. */
  readonly standToMinutes: number
}

/** The working assumptions: a week off between seasons, ten minutes of stand-to. The cutoff hour is set by `begins`. */
export const DEFAULT_SCHEDULE = { breakDays: 7, standToMinutes: 10 } as const
/** The daily cutoff, in hours UTC: the fewest players online, a working assumption until there is telemetry. */
export const CUTOFF_HOUR = 5

/** Where the war stands at a real moment. */
export type WarDay =
  | { readonly phase: "before"; readonly startsAt: number }
  | {
      readonly phase: "turn"
      readonly season: Season
      /** The turn within the season, from 1. */
      readonly turn: number
      readonly turns: number
      /** The week of the war being fought: 00:00 UTC on its first day. */
      readonly week: number
      /** Whether the war is in its stand-to: the turn has just begun and the battle waits. */
      readonly standTo: boolean
      /** The real moment the next turn begins (the next cutoff), or the season's end. */
      readonly nextCutoff: number
    }
  | { readonly phase: "between"; readonly season: Season; readonly nextSeason: Season; readonly resumesAt: number }
  | { readonly phase: "over"; readonly endedAt: number }

/** The weeks of a season: those starting in its year, counted from the first week of the war, up to the armistice. */
export function seasonWeeks(season: Season): number[] {
  const weeks: number[] = []
  for (let week = WAR_BEGINS; week <= ARMISTICE; week += WEEK) {
    if (new Date(week).getUTCFullYear() === season) {
      weeks.push(week)
    }
  }
  return weeks
}

/** The week of the war a war date falls in: 00:00 UTC on the Tuesday it began. */
export function warWeekOf(utc: number): number {
  return WAR_BEGINS + Math.floor((utc - WAR_BEGINS) / WEEK) * WEEK
}

/** Real days from the war's start to the start of each season. */
function seasonStarts(schedule: WarSchedule): { season: Season; startDay: number; turns: number }[] {
  let day = 0
  return SEASONS.map((season) => {
    const turns = seasonWeeks(season).length
    const start = { season, startDay: day, turns }
    day += turns + schedule.breakDays
    return start
  })
}

/** Where the war stands at a real moment, `now` in milliseconds since 1970 UTC. */
export function warDayAt(schedule: WarSchedule, now: number): WarDay {
  if (now < schedule.begins) {
    return { phase: "before", startsAt: schedule.begins }
  }
  const day = Math.floor((now - schedule.begins) / DAY)
  const starts = seasonStarts(schedule)
  for (const [index, { season, startDay, turns }] of starts.entries()) {
    if (day >= startDay && day < startDay + turns) {
      const turn = day - startDay + 1
      const turnBegan = schedule.begins + day * DAY
      return {
        phase: "turn",
        season,
        turn,
        turns,
        week: seasonWeeks(season)[turn - 1]!,
        standTo: now - turnBegan < schedule.standToMinutes * 60_000,
        nextCutoff: turnBegan + DAY
      }
    }
    const next = starts[index + 1]
    if (next && day >= startDay + turns && day < next.startDay) {
      return {
        phase: "between",
        season,
        nextSeason: next.season,
        resumesAt: schedule.begins + next.startDay * DAY
      }
    }
  }
  const last = starts[starts.length - 1]!
  return { phase: "over", endedAt: schedule.begins + (last.startDay + last.turns) * DAY }
}

/** The most recent daily cutoff at or before a real moment. */
export function lastCutoff(now: number, cutoffHour = CUTOFF_HOUR): number {
  return Math.floor((now - cutoffHour * HOUR) / DAY) * DAY + cutoffHour * HOUR
}

/**
 * A schedule that puts a given week of the war on today's turn: for the prototype and for testing, a war that began
 * as many real days ago, counting the breaks between seasons, as it takes to reach that week.
 */
export function scheduleForWeek(
  week: number,
  now: number,
  options: Partial<Omit<WarSchedule, "begins">> = {}
): WarSchedule {
  const schedule = { ...DEFAULT_SCHEDULE, ...options, begins: 0 }
  const target = warWeekOf(week)
  const season = SEASONS.find((year) => seasonWeeks(year).includes(target))
  if (season === undefined) {
    throw new RangeError(`${new Date(week).toISOString()} is not a week of the war`)
  }
  const start = seasonStarts(schedule).find((each) => each.season === season)!
  const turnsBefore = start.startDay + seasonWeeks(season).indexOf(target)
  return { ...schedule, begins: lastCutoff(now) - turnsBefore * DAY }
}
