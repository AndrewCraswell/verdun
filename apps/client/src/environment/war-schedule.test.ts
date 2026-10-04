import { warDayAt } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import { localSchedule, SCHEDULE_KEY, type ScheduleStore } from "./war-schedule.ts"

const DAY = 86_400_000
const WEEK = 7 * DAY
const NOW = Date.UTC(2026, 9, 4, 12)
const JUNE_1916 = Date.UTC(1916, 5, 20)

function memory(): ScheduleStore & { readonly items: Map<string, string> } {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value)
    },
    removeItem: (key) => {
      items.delete(key)
    }
  }
}

const weekOf = (schedule: ReturnType<typeof localSchedule>, at: number) => {
  const day = warDayAt(schedule, at)
  return day.phase === "turn" ? day.week : null
}

describe("the local war schedule", () => {
  it("begins in the battle's week, and keeps going a week a real day across visits", () => {
    const store = memory()
    const first = localSchedule({ week: JUNE_1916, now: NOW, store })
    expect(weekOf(first, NOW)).toBe(JUNE_1916)
    expect(store.items.has(SCHEDULE_KEY)).toBe(true)

    // Back the next day: the kept schedule, a week on.
    const next = localSchedule({ week: JUNE_1916, now: NOW + DAY, store })
    expect(next).toEqual(first)
    expect(weekOf(next, NOW + DAY)).toBe(JUNE_1916 + WEEK)
  })

  it("starts afresh without storage, with storage that throws, and over a kept schedule that's nonsense", () => {
    const broken: ScheduleStore = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
      removeItem: () => {
        throw new Error("blocked")
      }
    }
    for (const store of [null, broken]) {
      expect(weekOf(localSchedule({ week: JUNE_1916, now: NOW, store }), NOW)).toBe(JUNE_1916)
    }
    const garbled = memory()
    garbled.setItem(SCHEDULE_KEY, '{"begins":"soon"}')
    expect(weekOf(localSchedule({ week: JUNE_1916, now: NOW, store: garbled }), NOW)).toBe(JUNE_1916)
  })

  it("takes the war's date and the stand-to from the address in development, and forgets on reset", () => {
    const store = memory()
    localSchedule({ week: JUNE_1916, now: NOW, store })
    const verdun = localSchedule({
      week: JUNE_1916,
      now: NOW,
      store,
      search: new URLSearchParams("war=1916-02-21&standto=0")
    })
    expect(weekOf(verdun, NOW)).toBe(Date.UTC(1916, 1, 15))
    expect(verdun.standToMinutes).toBe(0)
    // Kept, so a reload without the parameters stays there.
    expect(weekOf(localSchedule({ week: JUNE_1916, now: NOW, store }), NOW)).toBe(Date.UTC(1916, 1, 15))
    // Not a week of the war: ignored.
    const peace = localSchedule({ week: JUNE_1916, now: NOW, store, search: new URLSearchParams("war=1920-01-01") })
    expect(weekOf(peace, NOW)).toBe(Date.UTC(1916, 1, 15))
    const reset = localSchedule({ week: JUNE_1916, now: NOW, store, search: new URLSearchParams("war=reset") })
    expect(weekOf(reset, NOW)).toBe(JUNE_1916)
  })
})
