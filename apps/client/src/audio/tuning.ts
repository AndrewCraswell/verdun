/**
 * The mix: a level for each bus, each battle sound and each ambience bed, multiplying what the code sets. 1 leaves a
 * sound as it is. These are the shipped values; in dev builds the sound mixer panel (M) adjusts them live and its Copy
 * button gives the values to paste here.
 */
const TUNING: Readonly<Record<string, number>> = {}

/** Where dev builds keep the panel's changes between reloads. */
const STORAGE_KEY = "verdun.soundTuning"

export interface Tuning {
  /** The level for a bus ("bus:battle"), a sound ("rifle-fr-near") or a bed ("ambience:wood"); 1 unless tuned. */
  level(name: string): number
  set(name: string, level: number): void
  /** Every level that differs from 1, for the panel's Copy button. */
  changed(): Record<string, number>
  /** Called with a name whenever its level changes. */
  onChange(listener: (name: string) => void): void
}

function stored(): Record<string, number> {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? "{}")
    if (typeof value !== "object" || value === null) {
      return {}
    }
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number")
    )
  } catch {
    return {}
  }
}

/** The shipped mix, with a dev build's own adjustments over it when `remember` is set. */
export function createTuning(remember: boolean): Tuning {
  const levels = new Map(Object.entries({ ...TUNING, ...(remember ? stored() : {}) }))
  const listeners: ((name: string) => void)[] = []
  const changed = () => Object.fromEntries([...levels].filter(([, level]) => level !== 1))
  return {
    level: (name) => levels.get(name) ?? 1,
    set(name, level) {
      levels.set(name, level)
      if (remember) {
        try {
          globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(changed()))
        } catch {
          // Private windows may refuse storage; the change still holds until reload.
        }
      }
      for (const listener of listeners) {
        listener(name)
      }
    },
    changed,
    onChange(listener) {
      listeners.push(listener)
    }
  }
}
