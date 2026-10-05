/**
 * The player's interface settings (S3 in docs/design/interface.md): the HUD's size, the strength of the screen effects,
 * the backing behind its text, colour vision, contrast and the prompts. Kept in the browser between visits.
 */

export type ColourVision = "default" | "deuteranopia" | "protanopia" | "tritanopia"

/** The parts of the HUD the player can set to show always, only when something changes, or never. */
export const HUD_ZONES = ["soldier", "roster", "sector", "log", "fire", "hints"] as const
export type HudZoneSetting = (typeof HUD_ZONES)[number]
/** Always, in full as in the overview; when something there changes (and in the overview); or never. */
export type ZoneShowing = "always" | "changes" | "hidden"
const SHOWINGS: readonly ZoneShowing[] = ["always", "changes", "hidden"]

/** The keys the player can hold down or press once to turn on and again to turn off. */
export const PRESS_ACTIONS = ["run", "crouch", "prone", "grenade"] as const
export type PressAction = (typeof PRESS_ACTIONS)[number]
export type PressMode = "hold" | "toggle"
const MODES: readonly PressMode[] = ["hold", "toggle"]

export interface InterfaceSettings {
  /** The whole HUD's size, from 0.75 to 2. */
  readonly scale: number
  /** How strongly the screen effects show, from 0 (off) to 1. */
  readonly effects: number
  /** How dark the plates and shading behind the HUD's text are, from 0.5 to 1.5. */
  readonly backing: number
  readonly vision: ColourVision
  readonly highContrast: boolean
  /** Whether the first-session prompts show. */
  readonly hints: boolean
  /** How each part of the HUD shows. */
  readonly zones: Readonly<Record<HudZoneSetting, ZoneShowing>>
  /** The hour by the 24-hour clock, as the army kept it, or the 12-hour. */
  readonly clock: "24" | "12"
  /** The size of the marks on the ground and the aim cursor, from 0.75 to 2. */
  readonly markers: number
  /** For each of these keys, whether it works while held or is pressed once to turn on and again to turn off. */
  readonly presses: Readonly<Record<PressAction, PressMode>>
}

export const DEFAULT_SETTINGS: InterfaceSettings = {
  scale: 1,
  effects: 1,
  backing: 1,
  vision: "default",
  highContrast: false,
  hints: true,
  zones: {
    soldier: "changes",
    roster: "changes",
    sector: "changes",
    log: "changes",
    fire: "changes",
    hints: "changes"
  },
  clock: "24",
  markers: 1,
  presses: { run: "hold", crouch: "toggle", prone: "toggle", grenade: "hold" }
}

const VISIONS: readonly ColourVision[] = ["default", "deuteranopia", "protanopia", "tritanopia"]

function number(value: unknown, fallback: number, low: number, high: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback
}

/** A record of a choice per key, each kept if it's one of the choices and its default otherwise. */
function choices<K extends string, V extends string>(
  value: unknown,
  keys: readonly K[],
  allowed: readonly V[],
  defaults: Readonly<Record<K, V>>
): Record<K, V> {
  const stored: Record<string, unknown> = typeof value === "object" && value !== null ? { ...value } : {}
  const result: Record<K, V> = { ...defaults }
  for (const key of keys) {
    result[key] = allowed.find((choice) => choice === stored[key]) ?? defaults[key]
  }
  return result
}

/** Settings from whatever was stored, each kept within its range, anything missing or broken at its default. */
export function readSettings(stored: unknown): InterfaceSettings {
  if (typeof stored !== "object" || stored === null) {
    return DEFAULT_SETTINGS
  }
  const record: Partial<Record<keyof InterfaceSettings, unknown>> = stored
  const vision = VISIONS.find((name) => name === record.vision) ?? DEFAULT_SETTINGS.vision
  return {
    scale: number(record.scale, DEFAULT_SETTINGS.scale, 0.75, 2),
    effects: number(record.effects, DEFAULT_SETTINGS.effects, 0, 1),
    backing: number(record.backing, DEFAULT_SETTINGS.backing, 0.5, 1.5),
    vision,
    highContrast: typeof record.highContrast === "boolean" ? record.highContrast : DEFAULT_SETTINGS.highContrast,
    hints: typeof record.hints === "boolean" ? record.hints : DEFAULT_SETTINGS.hints,
    zones: choices(record.zones, HUD_ZONES, SHOWINGS, DEFAULT_SETTINGS.zones),
    clock: record.clock === "12" ? "12" : "24",
    markers: number(record.markers, DEFAULT_SETTINGS.markers, 0.75, 2),
    presses: choices(record.presses, PRESS_ACTIONS, MODES, DEFAULT_SETTINGS.presses)
  }
}

export interface SettingsStore {
  load(): InterfaceSettings
  save(settings: InterfaceSettings): void
}

/**
 * The settings as one live value the HUD and the menu share: the menu changes them, the HUD applies each change at
 * once, and every change is kept for the next visit. Neither needs the other.
 */
export interface InterfaceSettingsHub {
  readonly current: InterfaceSettings
  /** Changes some settings and keeps them; every listener hears. */
  change(update: Partial<InterfaceSettings>): void
  /** Hears every change, the current settings first. Returns a function that stops listening. */
  listen(listener: (settings: InterfaceSettings) => void): () => void
}

export function createSettingsHub(store: SettingsStore): InterfaceSettingsHub {
  let current = store.load()
  const listeners = new Set<(settings: InterfaceSettings) => void>()
  return {
    get current() {
      return current
    },
    change(update) {
      current = readSettings({ ...current, ...update })
      store.save(current)
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

let shared: InterfaceSettingsHub | null = null

/** The page's one hub, kept in the browser: what the HUD and the menu both use. */
export function interfaceSettings(): InterfaceSettingsHub {
  shared ??= createSettingsHub(browserSettingsStore())
  return shared
}

/** The browser's local storage, where it's allowed; elsewhere the defaults, every visit. */
export function browserSettingsStore(key = "verdun.interface"): SettingsStore {
  return {
    load() {
      try {
        return readSettings(JSON.parse(localStorage.getItem(key) ?? "null"))
      } catch {
        return DEFAULT_SETTINGS
      }
    },
    save(settings) {
      try {
        localStorage.setItem(key, JSON.stringify(settings))
      } catch {
        // Storage blocked: the settings last as long as the page.
      }
    }
  }
}
