import type { EntityId } from "@verdun/sim"
import type { SoundCue } from "../audio/battle-sound-model.ts"
import type { CaptionMode } from "../settings/play.ts"
import { CAPTION_LINES } from "./caption-lines.ts"

/**
 * Captions (docs/design/interface.md#accessibility), kept short, because the player has a battle to watch: one line
 * each, an arrow for where it came from tinted by side, the name of a man of the player's own squad, and what was
 * shouted, in English. "Voices" captions only what the player can act on: gas, grenades, take cover, and their own
 * squad's orders. "All" adds everyone's other shouts and the warning sounds: whistles, the gas gong, shells coming in.
 * Worked out from the sounds the battle plays, free of the DOM.
 */

export interface Caption {
  /** What it's known by on screen: its meaning, so the same shout from several men shows once. */
  readonly key: string
  /** Whose side it came from, for the arrow's tint; null for a sound. */
  readonly side: "ours" | "theirs" | null
  readonly direction: "left" | "ahead" | "right"
  /** A man of the player's own squad: "Vincent". */
  readonly name: string | null
  /** "Gas! Masks on!" */
  readonly text: string
  /** Seconds left on screen. */
  readonly left: number
}

/** Shouts captioned even in "voices": the ones that ask something of the player. */
const ALWAYS = new Set(["gas", "grenade", "cover"])
/** Shouts captioned in "voices" when a man of the player's own squad gives them: his orders. */
const OWN_ORDERS = new Set(["charge", "follow", "hold"])

/** Each kind of shout's usual meaning, for a take the captions don't know by its line. */
const SHOUTS: Readonly<Record<string, string>> = {
  charge: "Forward!",
  cover: "Get down!",
  gas: "Gas! Masks on!",
  grenade: "Grenade!",
  hit: "I'm hit!",
  pinned: "Machine gun! Keep down!",
  follow: "Follow me!",
  hold: "Hold here!",
  taken: "The trench is ours!",
  surrender: "I surrender!",
  broken: "My God!"
}

/** The sounds that warn, captioned in "all". */
const SOUNDS: Partial<Record<SoundCue, string>> = {
  whistle: "Whistles",
  "gas-gong": "Gas gong",
  "incoming-heavy": "Heavy shell incoming",
  "gas-shell": "Gas shells"
}

/** Heard quieter than this, a sound is too far off to caption. */
const AUDIBLE = 0.08
/** Seconds a caption stays up, and the most shown at once. */
const SHOWN = 2.5
const MOST = 2

function directionOf(pan: number): Caption["direction"] {
  if (pan < -0.35) {
    return "left"
  }
  return pan > 0.35 ? "right" : "ahead"
}

/** A sound as the captions hear it: its cue, how loud and from where, and for a shout, who and which take. */
export interface HeardSound {
  readonly cue: SoundCue
  readonly volume: number
  readonly pan: number
  readonly speaker?: EntityId
  /** The take that played, by its id in scripts/voice-lines.json, so the caption says what was actually shouted. */
  readonly line?: string
}

/**
 * What a sound says as a caption, or null for one that isn't captioned in this mode. `nameOf` names a man of the
 * player's own squad ("Vincent"), and gives null for anyone else.
 */
export function captionOf(
  mode: CaptionMode,
  call: HeardSound,
  ourLanguage: "fr" | "de",
  nameOf: (soldier: EntityId) => string | null = () => null
): Omit<Caption, "left"> | null {
  if (mode === "off" || call.volume < AUDIBLE) {
    return null
  }
  const direction = directionOf(call.pan)
  const voice = /^voice-([a-z]+)-(fr|de)$/.exec(call.cue)
  if (!voice) {
    const sound = mode === "all" ? SOUNDS[call.cue] : undefined
    return sound ? { key: sound, side: null, direction, name: null, text: sound } : null
  }
  const shout = voice[1] ?? ""
  const usual = SHOUTS[shout]
  if (!usual) {
    return null
  }
  const name = call.speaker === undefined ? null : nameOf(call.speaker)
  const wanted = mode === "all" || ALWAYS.has(shout) || (name !== null && OWN_ORDERS.has(shout))
  if (!wanted) {
    return null
  }
  const text = (call.line === undefined ? undefined : CAPTION_LINES[call.line]?.meaning) ?? usual
  return { key: text, side: voice[2] === ourLanguage ? "ours" : "theirs", direction, name, text }
}

export interface Captions {
  /** Hears a sound the battle plays. */
  hear(call: HeardSound): void
  /** Moves the captions on by `seconds`; returns those showing, newest last. */
  update(seconds: number): readonly Caption[]
}

/** Captions as they come and go: the same meaning heard again while it shows refreshes it rather than stacking. */
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
      showing = [...showing.filter((each) => each.key !== caption.key), { ...caption, left: SHOWN }].slice(-MOST)
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
