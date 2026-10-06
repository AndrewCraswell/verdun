import { browserStorage, createSettings, oneOf, type Settings, type SettingsStorage } from "./store.ts"

/**
 * How the player plays (S13 in docs/design/interface.md), chosen at the front door and kept between visits: on the
 * sector's server, in the one battle everyone joins, which goes on whoever is playing; or alone, the battle stepped in
 * the browser. Changing it once the battle is loading starts the game again.
 */
export const MODES = ["multiplayer", "single"] as const
export type PlayMode = (typeof MODES)[number]

export interface ModeSettings {
  readonly mode: PlayMode
}

/** The mode stored, or `fallback` for anything missing or unknown. */
export function readMode(stored: unknown, fallback: PlayMode): ModeSettings {
  const record: Partial<Record<keyof ModeSettings, unknown>> =
    typeof stored === "object" && stored !== null ? stored : {}
  return { mode: oneOf(record.mode, MODES, fallback) }
}

export function createModeSettings(storage: SettingsStorage | null, fallback: PlayMode): Settings<ModeSettings> {
  return createSettings("verdun.mode", (stored) => readMode(stored, fallback), storage)
}

/** Where the game was built to find the sector's server, and the page it's on: what the choice of server goes by. */
export interface ServerPlace {
  /** The build's server (VERDUN_SERVER, as CI builds the live game with), or "" for none. */
  readonly built: string
  /** Whether this is the development build, which looks for `pnpm server` on its own host. */
  readonly development: boolean
  /** The page's host name. */
  readonly hostname: string
}

/** The server multiplayer is played on: the build's, or in development `pnpm server`'s; null where there's none. */
export function multiplayerServer(place: ServerPlace): string | null {
  if (place.built) {
    return place.built
  }
  return place.development ? `ws://${place.hostname}:2567` : null
}

/**
 * Multiplayer by default where the game knows a server, as the live game does; otherwise alone. A development build
 * starts alone, so `?play` stays the battle on the page.
 */
export function defaultMode(place: ServerPlace): PlayMode {
  return place.built ? "multiplayer" : "single"
}

/**
 * The server to join the battle on, or null to play it in the browser: `?server=` names one (`?server` alone, the page's
 * host's `pnpm server`); otherwise the multiplayer server when the player plays multiplayer.
 */
export function battleServer(search: URLSearchParams, mode: PlayMode, place: ServerPlace): string | null {
  const asked = search.get("server")
  if (asked !== null) {
    return asked || `ws://${place.hostname}:2567`
  }
  return mode === "multiplayer" ? multiplayerServer(place) : null
}

/** This page's place: the build's server, and whether it's the development build. */
export function serverPlace(): ServerPlace {
  const built: unknown = import.meta.env.VERDUN_SERVER
  return {
    built: typeof built === "string" ? built : "",
    development: import.meta.env.DEV,
    hostname: location.hostname
  }
}

let shared: Settings<ModeSettings> | null = null

/** The page's choice of how to play, kept in the browser: what the front door and the battle both read. */
export function modeSettings(): Settings<ModeSettings> {
  shared ??= createModeSettings(browserStorage(), defaultMode(serverPlace()))
  return shared
}
