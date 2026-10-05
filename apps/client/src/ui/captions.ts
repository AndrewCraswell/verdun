import type { EntityId } from "@verdun/sim"
import type { SoundCue } from "../audio/battle-sound-model.ts"
import type { CaptionMode } from "../settings/play.ts"
import { CAPTION_LINES } from "./caption-lines.ts"

/**
 * Captions (docs/design/interface.md#accessibility): every shout heard, with who and where it comes from and what it
 * means in English, the words as they were shouted after it; and, for players who ask, the sounds that warn: whistles,
 * the gas gong, a heavy shell coming in. Worked out from the sounds the battle plays, free of the DOM.
 */

export interface Caption {
  readonly key: string
  /** "Caporal Vincent, ahead", "The enemy, to the left". */
  readonly who: string
  /** "Gas! Masks on!" */
  readonly text: string
  /** The words as shouted: "Les gaz ! Masques !", or null for a sound. */
  readonly words: string | null
  readonly kind: "voice" | "sound"
  /** Heard this many times while showing. */
  readonly count: number
  /** Seconds left on screen. */
  readonly left: number
}

/** Each shout's meaning, and its words in each army's language (scripts/voice-lines.json). */
const SHOUTS: Readonly<Record<string, { readonly text: string; readonly fr: string; readonly de: string }>> = {
  charge: { text: "Forward! Forward!", fr: "En avant !", de: "Sprung auf! Marsch, marsch!" },
  cover: { text: "Get down!", fr: "À terre !", de: "Hinlegen!" },
  gas: { text: "Gas! Masks on!", fr: "Les gaz ! Masques !", de: "Gas! Masken auf!" },
  grenade: { text: "Grenade!", fr: "Grenade !", de: "Handgranate!" },
  hit: { text: "I'm hit!", fr: "Je suis touché !", de: "Ich bin getroffen!" },
  pinned: { text: "Machine gun! Keep down!", fr: "Mitrailleuse ! Baissez-vous !", de: "MG! Runter!" },
  follow: { text: "Follow me!", fr: "Suivez-moi !", de: "Folgt mir!" },
  hold: { text: "Halt! We hold here!", fr: "Halte ! On tient ici !", de: "Halt! Stellung halten!" },
  taken: { text: "The trench is ours!", fr: "La tranchée est à nous !", de: "Der Graben ist unser!" },
  surrender: { text: "I surrender! Don't shoot!", fr: "Je me rends ! Ne tirez pas !", de: "Kamerad! Kamerad!" },
  broken: { text: "My God... my God!", fr: "Mon Dieu... mon Dieu !", de: "Mein Gott... mein Gott!" }
}

/** The sounds that warn, captioned in "all". */
const SOUNDS: Partial<Record<SoundCue, string>> = {
  whistle: "Whistles blow",
  "gas-gong": "The gas gong sounds",
  "incoming-heavy": "A heavy shell coming in",
  "gas-shell": "Gas shells landing",
  charge: "A roar: men going over"
}

/** Heard quieter than this, a sound is too far off to caption. */
const AUDIBLE = 0.08
/** Seconds a caption stays up, and the most shown at once. */
const SHOWN = 3.5
const MOST = 3

/** "to the left", "ahead", "to the right", from the sound's pan, -1 to 1. */
function direction(pan: number): string {
  if (pan < -0.35) {
    return "to the left"
  }
  return pan > 0.35 ? "to the right" : "ahead"
}

/** A sound as the captions hear it: its cue, how loud and from where, and the man who shouted, for a shout. */
export interface HeardSound {
  readonly cue: SoundCue
  readonly volume: number
  readonly pan: number
  readonly speaker?: EntityId
  /** The take that played, by its id in scripts/voice-lines.json, so the caption matches it word for word. */
  readonly line?: string
}

/**
 * What a sound says as a caption, or null for one that isn't captioned in this mode. `nameOf` names a man the player
 * knows ("Caporal Vincent"), or gives null for one they don't, who goes by his side.
 */
export function captionOf(
  mode: CaptionMode,
  call: HeardSound,
  ourLanguage: "fr" | "de",
  nameOf: (soldier: EntityId) => string | null = () => null
): Omit<Caption, "count" | "left"> | null {
  if (mode === "off" || call.volume < AUDIBLE) {
    return null
  }
  const voice = /^voice-([a-z]+)-(fr|de)$/.exec(call.cue)
  if (voice) {
    const shout = SHOUTS[voice[1] ?? ""]
    const language = voice[2] === "de" ? "de" : "fr"
    if (!shout) {
      return null
    }
    const name = call.speaker === undefined ? null : nameOf(call.speaker)
    const take = call.line === undefined ? undefined : CAPTION_LINES[call.line]
    const side = language === ourLanguage ? "Ours" : "The enemy"
    return {
      key: name ? `${call.cue}:${call.speaker}` : call.cue,
      who: `${name ?? side}, ${direction(call.pan)}`,
      text: take?.meaning ?? shout.text,
      words: take?.words ?? shout[language],
      kind: "voice"
    }
  }
  const sound = mode === "all" ? SOUNDS[call.cue] : undefined
  return sound ? { key: call.cue, who: direction(call.pan), text: sound, words: null, kind: "sound" } : null
}

export interface Captions {
  /** Hears a sound the battle plays. */
  hear(call: HeardSound): void
  /** Moves the captions on by `seconds`; returns those showing, newest last. */
  update(seconds: number): readonly Caption[]
}

/** Captions as they come and go: the same one heard again while it shows counts up rather than repeating. */
export function createCaptions(
  mode: () => CaptionMode,
  ourLanguage: "fr" | "de",
  nameOf?: (soldier: EntityId) => string | null
): Captions {
  let showing: Caption[] = []
  return {
    hear(call) {
      const caption = captionOf(mode(), call, ourLanguage, nameOf)
      if (!caption) {
        return
      }
      const same = showing.find((each) => each.key === caption.key)
      showing = showing.filter((each) => each !== same)
      showing.push({ ...caption, count: (same?.count ?? 0) + 1, left: SHOWN })
      showing = showing.slice(-MOST)
    },
    update(seconds) {
      if (mode() === "off") {
        showing = []
      }
      showing = showing.map((each) => ({ ...each, left: each.left - seconds })).filter((each) => each.left > 0)
      return showing
    }
  }
}
