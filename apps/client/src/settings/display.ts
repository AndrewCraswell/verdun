/**
 * The display settings from the options screen (S3 in docs/design/interface.md): which renderer draws the battle, and
 * the scale it draws at. Kept in the browser between visits.
 *
 * The renderer is chosen as the engine is made, so changing it takes a reload. The scale applies at once.
 */

/** Automatic draws with WebGPU where the browser has it, WebGL elsewhere; WebGL forces the older renderer. */
export type Renderer = "automatic" | "webgl"

export interface DisplaySettings {
  readonly renderer: Renderer
  /** The share of the screen's resolution the battle is drawn at, from 0.5 to 1. */
  readonly renderScale: number
}

export const DEFAULT_DISPLAY: DisplaySettings = { renderer: "automatic", renderScale: 1 }

/** Where the settings are kept between visits. */
const DISPLAY_KEY = "verdun.display"

/** Settings from whatever was stored, each within its range, anything missing or broken at its default. */
export function readDisplay(stored: unknown): DisplaySettings {
  if (typeof stored !== "object" || stored === null) {
    return DEFAULT_DISPLAY
  }
  const record: Partial<Record<keyof DisplaySettings, unknown>> = stored
  const scale = record.renderScale
  return {
    renderer: record.renderer === "webgl" ? "webgl" : "automatic",
    renderScale:
      typeof scale === "number" && Number.isFinite(scale)
        ? Math.min(1, Math.max(0.5, scale))
        : DEFAULT_DISPLAY.renderScale
  }
}

/** The little of `Storage` the settings need; reads and writes may throw (private windows, blocked site data). */
export interface DisplayStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface Display {
  readonly current: DisplaySettings
  /** Changes some settings and keeps them; every listener hears. */
  change(update: Partial<DisplaySettings>): void
  /** Hears every change, the current settings first. Returns a function that stops listening. */
  listen(listener: (settings: DisplaySettings) => void): () => void
}

export function createDisplay(store: DisplayStore | null): Display {
  let current = DEFAULT_DISPLAY
  try {
    current = readDisplay(JSON.parse(store?.getItem(DISPLAY_KEY) ?? "null"))
  } catch {
    // Storage blocked or the setting malformed: the defaults.
  }
  const listeners = new Set<(settings: DisplaySettings) => void>()
  return {
    get current() {
      return current
    },
    change(update) {
      current = readDisplay({ ...current, ...update })
      try {
        store?.setItem(DISPLAY_KEY, JSON.stringify(current))
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

let shared: Display | null = null

/** The page's display settings, kept in the browser: what the engine and the options screen both use. */
export function displaySettings(): Display {
  if (!shared) {
    let store: DisplayStore | null = null
    try {
      store = globalThis.localStorage ?? null
    } catch {
      // Blocked: the defaults, every visit.
    }
    shared = createDisplay(store)
  }
  return shared
}
