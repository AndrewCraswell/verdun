import { clockMoment, type WorldClock } from "@verdun/sim"

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
  return FRENCH_HOUR.format(clockMoment(clock))
}
