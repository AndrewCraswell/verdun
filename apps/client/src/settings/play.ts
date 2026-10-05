import { browserStorage, createSettings, oneOf, type Settings, type SettingsStorage } from "./store.ts"

/** Which captions show: none, the voices, or the voices and the warning sounds (whistles, the gas gong, shells coming). */
export const CAPTION_MODES = ["off", "voices", "all"] as const
export type CaptionMode = (typeof CAPTION_MODES)[number]

/** Settings for how the battle talks to the player and asks before acting (S3 in docs/design/interface.md). */
export interface PlaySettings {
  /** Captions for what's heard: the shouts in French and German, with their meaning, and on request the warnings. */
  readonly captions: CaptionMode
  /** Sector-wide fire (the bombardment, the whistle) asks for a second press, so a slip can't fire it. */
  readonly confirmSectorFire: boolean
}

export const DEFAULT_PLAY: PlaySettings = { captions: "voices", confirmSectorFire: true }

export function readPlay(stored: unknown): PlaySettings {
  if (typeof stored !== "object" || stored === null) {
    return DEFAULT_PLAY
  }
  const record: Partial<Record<keyof PlaySettings, unknown>> = stored
  return {
    captions: oneOf(record.captions, CAPTION_MODES, DEFAULT_PLAY.captions),
    confirmSectorFire:
      typeof record.confirmSectorFire === "boolean" ? record.confirmSectorFire : DEFAULT_PLAY.confirmSectorFire
  }
}

export function createPlaySettings(storage: SettingsStorage | null): Settings<PlaySettings> {
  return createSettings("verdun.play", readPlay, storage)
}

let shared: Settings<PlaySettings> | null = null

/** The page's play settings, kept in the browser: what the battle and the options screen both use. */
export function playSettings(): Settings<PlaySettings> {
  shared ??= createPlaySettings(browserStorage())
  return shared
}
