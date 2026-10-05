/**
 * Which sounds give way when the mixer runs out of voices (mixer.ts, MAX_VOICES): a man's shout, a round cracking past
 * or a whistle must be heard over a distant battery, however loud the battery. Sounds rank by what they tell the
 * player, and only within a rank does the quieter give way.
 */

/** What a sound tells the player, from most to least needed. */
export const Priority = {
  /** Shouts, whistles, the gas alarm, a heavy shell coming in, rounds cracking or zipping past. */
  Urgent: 3,
  /** The fight close by: rifles, guns and bursts near, rounds striking, men hit or falling. */
  Near: 2,
  /** The battle further off and the life of the line: far guns and bursts, the batteries, footsteps, crows. */
  Far: 1
} as const
export type Priority = (typeof Priority)[keyof typeof Priority]

const URGENT: ReadonlySet<string> = new Set(["whistle", "gas-gong", "incoming-heavy", "crack", "bullet-whizz"])
const NEAR: ReadonlySet<string> = new Set(["throw", "death", "pain", "charge", "cheer", "debris", "flare", "gas-shell"])

/** How much a cue matters when voices run short. */
export function priorityOf(cue: string): Priority {
  if (cue.startsWith("voice-") || URGENT.has(cue)) {
    return Priority.Urgent
  }
  if (cue.endsWith("-near") || cue.startsWith("bullet-") || cue.startsWith("bolt-") || NEAR.has(cue)) {
    return Priority.Near
  }
  return Priority.Far
}

/** A voice sounding, as far as giving way goes. */
export interface Sounding {
  readonly priority: Priority
  readonly volume: number
}

/**
 * Which of the voices sounding should stop to make room for `incoming`: the least needed, the quietest among those.
 * Null when every one of them matters at least as much as `incoming`, which is dropped instead.
 */
export function giveWay(sounding: readonly Sounding[], incoming: Sounding): number | null {
  let weakest = -1
  for (let index = 0; index < sounding.length; index++) {
    const voice = sounding[index]
    const current = sounding[weakest]
    if (voice && (!current || outranks(current, voice))) {
      weakest = index
    }
  }
  const victim = sounding[weakest]
  return victim && outranks(incoming, victim) ? weakest : null
}

/** Whether `a` matters more than `b`: its priority, then its loudness. */
function outranks(a: Sounding, b: Sounding): boolean {
  return a.priority !== b.priority ? a.priority > b.priority : a.volume > b.volume
}
