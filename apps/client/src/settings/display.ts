import { browserStorage, createSettings, oneOf, type Settings, type SettingsStorage, within } from "./store.ts"

/**
 * The display settings from the options screen (S3 in docs/design/interface.md): which renderer draws the battle, the
 * scale it draws at, a cap on its frame rate, and its brightness. Kept in the browser between visits.
 *
 * The renderer is chosen as the engine is made, so changing it takes a reload. The rest apply at once.
 */

/** Automatic draws with WebGPU where the browser has it, WebGL elsewhere; WebGL forces the older renderer. */
export type Renderer = "automatic" | "webgl"

/** Frames a second at most, or 0 for as many as the screen shows. */
export const FRAME_CAPS = [0, 30, 60, 120, 144] as const
export type FrameCap = (typeof FRAME_CAPS)[number]

export interface DisplaySettings {
  readonly renderer: Renderer
  /** The share of the screen's resolution the battle is drawn at, from 0.5 to 1. */
  readonly renderScale: number
  readonly frameCap: FrameCap
  /** The picture's exposure, as a multiple of the grade's, from 0.6 to 1.6: nights dark but playable on any screen. */
  readonly brightness: number
}

export const DEFAULT_DISPLAY: DisplaySettings = { renderer: "automatic", renderScale: 1, frameCap: 0, brightness: 1 }

/** Settings from whatever was stored, each within its range, anything missing or broken at its default. */
export function readDisplay(stored: unknown): DisplaySettings {
  if (typeof stored !== "object" || stored === null) {
    return DEFAULT_DISPLAY
  }
  const record: Partial<Record<keyof DisplaySettings, unknown>> = stored
  return {
    renderer: record.renderer === "webgl" ? "webgl" : "automatic",
    renderScale: within(record.renderScale, DEFAULT_DISPLAY.renderScale, 0.5, 1),
    frameCap: oneOf(record.frameCap, FRAME_CAPS, DEFAULT_DISPLAY.frameCap),
    brightness: within(record.brightness, DEFAULT_DISPLAY.brightness, 0.6, 1.6)
  }
}

export type Display = Settings<DisplaySettings>

export function createDisplay(storage: SettingsStorage | null): Display {
  return createSettings("verdun.display", readDisplay, storage)
}

let shared: Display | null = null

/** The page's display settings, kept in the browser: what the engine and the options screen both use. */
export function displaySettings(): Display {
  shared ??= createDisplay(browserStorage())
  return shared
}

/**
 * Whether a frame is due under a cap: true when at least the cap's interval has passed since the last frame drawn, with
 * a little slack so a 60 Hz screen capped at 60 never skips a frame for being a hair early.
 */
export function frameDue(cap: FrameCap, sinceLast: number): boolean {
  return cap === 0 || sinceLast >= 1000 / cap - 2
}
