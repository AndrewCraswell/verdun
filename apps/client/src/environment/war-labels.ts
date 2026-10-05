import type { WarDay } from "@verdun/sim"

/**
 * The war's dates and turns as players read them (docs/time-and-weather.md#what-players-see): the week being fought,
 * the turn within the season, and the time to the next communiqué. Kept apart from the battle's clock, which needs the
 * simulation, so the menus can show them before the battle has loaded.
 */
const WEEK_DATE = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })

/** "Week of 21 February 1916": the week of the war being fought, as the campaign's communiqué and the HUD give it. */
export function weekLabel(week: number): string {
  return `Week of ${WEEK_DATE.format(week)}`
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
