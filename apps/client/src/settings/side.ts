import { browserStorage, createSettings, oneOf, type Settings, type SettingsStorage } from "./store.ts"

/**
 * The side the player fights for (S14 in docs/design/interface.md), chosen at the front door and kept between visits.
 * The battle comes up behind the front door for the side chosen, so changing it reloads the game.
 */
export const SIDES = ["french", "german"] as const
export type PlayerSide = (typeof SIDES)[number]

export interface SideSettings {
  readonly side: PlayerSide
}

export function readSide(stored: unknown): SideSettings {
  const record: Partial<Record<keyof SideSettings, unknown>> =
    typeof stored === "object" && stored !== null ? stored : {}
  return { side: oneOf(record.side, SIDES, "french") }
}

export function createSideSettings(storage: SettingsStorage | null): Settings<SideSettings> {
  return createSettings("verdun.side", readSide, storage)
}

let shared: Settings<SideSettings> | null = null

/** The page's choice of side, kept in the browser: what the front door and the battle both read. */
export function sideSettings(): Settings<SideSettings> {
  shared ??= createSideSettings(browserStorage())
  return shared
}
