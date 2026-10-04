/**
 * The player's volume settings, from the options screen: a level from 0 (silent) to 1 (as mixed) for the whole game and
 * for each kind of sound. They scale the mix after its tuning (tuning.ts), so the mix itself is never touched, and are
 * remembered between visits.
 */
export const VOLUME_CHANNELS = ["master", "effects", "voices", "ambience", "music"] as const
export type VolumeChannel = (typeof VOLUME_CHANNELS)[number]

/** Where the settings are kept between visits. */
const STORAGE_KEY = "verdun.volume"

export interface PlayerVolume {
  /** The channel's level, from 0 to 1; 1 until the player changes it. */
  level(channel: VolumeChannel): number
  /** Sets the channel's level, clamped to 0 to 1, and remembers it. */
  set(channel: VolumeChannel, level: number): void
  /** Called with a channel whenever its level changes. */
  onChange(listener: (channel: VolumeChannel) => void): void
}

function isChannel(name: string): name is VolumeChannel {
  return VOLUME_CHANNELS.some((channel) => channel === name)
}

function stored(): Map<VolumeChannel, number> {
  const levels = new Map<VolumeChannel, number>()
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "{}")
    if (typeof value === "object" && value !== null) {
      for (const [name, level] of Object.entries(value)) {
        if (isChannel(name) && typeof level === "number" && Number.isFinite(level)) {
          levels.set(name, Math.max(0, Math.min(1, level)))
        }
      }
    }
  } catch {
    // Storage blocked or the setting malformed: every channel at full.
  }
  return levels
}

/** The player's settings as last saved. */
export function createPlayerVolume(): PlayerVolume {
  const levels = stored()
  const listeners: ((channel: VolumeChannel) => void)[] = []
  return {
    level: (channel) => levels.get(channel) ?? 1,
    set(channel, level) {
      levels.set(channel, Math.max(0, Math.min(1, Number.isFinite(level) ? level : 1)))
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(levels)))
      } catch {
        // Private windows may refuse storage; the setting still holds until reload.
      }
      for (const listener of listeners) {
        listener(channel)
      }
    },
    onChange(listener) {
      listeners.push(listener)
    }
  }
}

/**
 * The gain a setting gives: the square of the slider's level, so its travel sounds even to the ear rather than all the
 * change bunching up at the bottom.
 */
export function volumeGain(level: number): number {
  return level * level
}

let shared: PlayerVolume | null = null

/** The one set of settings the mixer and the options screen share. */
export function playerVolume(): PlayerVolume {
  shared ??= createPlayerVolume()
  return shared
}
