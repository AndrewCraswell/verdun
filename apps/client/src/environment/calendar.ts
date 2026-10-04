import { clockMoment, type WarDay, type WorldClock } from "@verdun/sim"

/**
 * What players see of time: the week of the war, and the battle's hour by a French clock. Never a speed ratio: "one real
 * day is a week of the war" and the hour are all anyone needs (see docs/time-and-weather.md).
 *
 * Both go through the browser's time-zone data, which has France's history: GMT through 1915, then summer time an hour
 * ahead from 14 June 1916, 24 March 1917 and 9 March 1918 until early October. The Germans kept Berlin time, an hour
 * or two ahead; the game shows the French clock on both sides, since the battlefield is in France.
 */
const WEEK_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })
const FRENCH_HOUR = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
})

/** "Week of 21 February 1916": the week of the war being fought, as the campaign's communiqué and the HUD give it. */
export function weekLabel(week: number): string {
  return `Week of ${WEEK_DATE.format(week)}`
}

/** "07:12": the battle's hour by French civil time. */
export function battleHour(clock: Readonly<WorldClock>): string {
  return hourAt(clockMoment(clock))
}

/** "19:42": the French civil time of a moment, `utc` in milliseconds since 1970, for sunrise, sunset and the like. */
export function hourAt(utc: number): string {
  return FRENCH_HOUR.format(utc)
}

/** A real span as players read it: "5 h 12 min", "12 min", "3 days". */
function span(milliseconds: number): string {
  const minutes = Math.max(0, Math.ceil(milliseconds / 60_000))
  if (minutes >= 48 * 60) {
    return `${Math.round(minutes / (24 * 60))} days`
  }
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`
}

/** "Day 23 of 52, 1916": the turn within the season, or where the war stands between them. */
export function turnLabel(day: WarDay): string {
  switch (day.phase) {
    case "turn":
      return `Day ${day.turn} of ${day.turns}, ${day.season}`
    case "between":
      return `The ${day.season} season is over`
    case "before":
      return "The war has not begun"
    case "over":
      return "The armistice is signed"
  }
}

/** "Next communiqué in 5 h 12 min", or "Stand-to" while the war moves on, at a real moment `now`. */
export function countdownLabel(day: WarDay, now: number): string {
  switch (day.phase) {
    case "turn":
      return day.standTo ? "Stand-to: the communiqué is coming in" : `Next communiqué in ${span(day.nextCutoff - now)}`
    case "between":
      return `${day.nextSeason} begins in ${span(day.resumesAt - now)}`
    case "before":
      return `The war begins in ${span(day.startsAt - now)}`
    case "over":
      return "The last communiqué is published"
  }
}
