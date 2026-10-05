/**
 * One group of the player's settings as a live value, kept in the browser: the options screen changes it, whatever it
 * drives applies each change at once through `listen`, and every change is kept for the next visit.
 */
export interface Settings<T> {
  readonly current: T
  /** Changes some settings and keeps them; every listener hears. */
  change(update: Partial<T>): void
  /** Hears every change, the current settings first. Returns a function that stops listening. */
  listen(listener: (settings: T) => void): () => void
}

/** The little of `Storage` settings need; reads and writes may throw (private windows, blocked site data). */
export interface SettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * Settings kept under `key`, read through `read`, which keeps each within its range and puts anything missing or
 * broken at its default.
 */
export function createSettings<T extends object>(
  key: string,
  read: (stored: unknown) => T,
  storage: SettingsStorage | null
): Settings<T> {
  let current = read(null)
  try {
    current = read(JSON.parse(storage?.getItem(key) ?? "null"))
  } catch {
    // Storage blocked or the settings malformed: the defaults.
  }
  const listeners = new Set<(settings: T) => void>()
  return {
    get current() {
      return current
    },
    change(update) {
      current = read({ ...current, ...update })
      try {
        storage?.setItem(key, JSON.stringify(current))
      } catch {
        // Storage blocked: the settings last as long as the page.
      }
      for (const listener of listeners) {
        listener(current)
      }
    },
    listen(listener) {
      listeners.add(listener)
      listener(current)
      return () => listeners.delete(listener)
    }
  }
}

/** The browser's local storage, or null where it's blocked. */
export function browserStorage(): SettingsStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** A number from storage within a range, or the fallback. */
export function within(value: unknown, fallback: number, low: number, high: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback
}

/** One of a list of values from storage, or the fallback. */
export function oneOf<T>(value: unknown, values: readonly T[], fallback: T): T {
  return values.find((each) => each === value) ?? fallback
}
