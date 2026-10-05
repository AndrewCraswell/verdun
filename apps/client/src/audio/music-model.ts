/**
 * Which piece of the soundtrack plays, and when. The game opens on its theme. After that each track is chosen for the
 * battle's mood when the one before ends, with a stretch of silence between them so the front can be heard. Zero hour is
 * the one thing that cuts a track short: the whistle brings in an attack track at once.
 */

import type { SquadOrder } from "@verdun/sim"

export type Mood = "theme" | "waiting" | "dread" | "attack"

/** The main theme, La Verdun: the main menu's music, and the battle's first track when the menu hasn't played it. */
export const THEME = "la-verdun"

/** Each mood's tracks, by the slug scripts/build-music.mjs gives each master. */
export const MOOD_TRACKS: Readonly<Record<Mood, readonly string[]>> = {
  theme: [THEME],
  waiting: ["awaiting-the-whistle", "tactical-silence", "sacred-stillness"],
  dread: ["trench-dread", "four-descending-notes", "mournful-ostinato", "the-unresolved-drum"],
  attack: ["the-unresolved-charge", "the-unresolved-bugle-call", "muddy-forward-momentum", "the-advance-gains-ground"]
}

/** What the music listens to. */
export interface Situation {
  /** The player's men are over the top: following the barrage, advancing or out on a raid. */
  readonly attacking: boolean
  /** How heavy the fighting along the front is, 0 to 1 (atmosphere-model.ts). */
  readonly fighting: number
  /** How light it is, 0 (night) to 1 (day). */
  readonly daylight: number
}

/** Fighting this heavy, or darkness this deep, turns waiting into dread. */
const DREAD_FIGHTING = 0.35
const DREAD_DARKNESS = 0.25
/** Seconds of quiet before the theme, and between tracks outside an attack. */
const FIRST_SILENCE = 2
const SILENCE: readonly [number, number] = [25, 70]
/** Seconds a track takes to fade in, and to give way to the attack. */
export const FADE_IN = 3
export const CUT_FADE = 2.5

/**
 * Whether a squad's order takes it over the top: behind the barrage, on a raid, or advancing to ground outside a trench.
 * `inTrench` says whether a point is in a trench, so moving along one to another bay isn't an attack.
 */
export function isAttacking(order: SquadOrder, inTrench: (x: number, z: number) => boolean): boolean {
  switch (order.kind) {
    case "creep":
    case "raid":
      return true
    case "advance":
      return !inTrench(order.x, order.z)
    default:
      return false
  }
}

export function moodOf(situation: Situation): Mood {
  if (situation.attacking) {
    return "attack"
  }
  return situation.fighting >= DREAD_FIGHTING || situation.daylight < DREAD_DARKNESS ? "dread" : "waiting"
}

/** Start `track`, fading in over `fade` seconds and fading out whatever was playing over the same time. */
export interface MusicCue {
  readonly track: string
  readonly mood: Mood
  readonly fade: number
}

export interface MusicModel {
  /**
   * Advances `seconds`; `ended` says the last cued track has finished playing. Returns a track to start, or null to
   * carry on as things are.
   */
  update(seconds: number, situation: Situation, ended: boolean): MusicCue | null
  /** The mood of what's playing, or null in a silence. */
  readonly playing: Mood | null
}

export interface MusicModelOptions {
  /** Open on the theme; false starts with a track for the mood, after the usual silence. */
  readonly theme?: boolean
}

/**
 * The soundtrack's choices among `available` tracks: those the build has. A mood with none of its tracks built borrows
 * from the others, so a partial build still plays.
 */
export function createMusicModel(
  available: readonly string[],
  random: () => number = Math.random,
  { theme: opensOnTheme = true }: MusicModelOptions = {}
): MusicModel {
  const built = new Set(available)
  const tracks = (mood: Mood): readonly string[] => {
    const own = MOOD_TRACKS[mood].filter((track) => built.has(track))
    return own.length > 0 ? own : available
  }
  // Each mood deals its tracks from a shuffled deck, so none repeats until the rest have played.
  const decks = new Map<Mood, string[]>()
  let last: string | null = null
  const deal = (mood: Mood): string | undefined => {
    let deck = decks.get(mood) ?? []
    if (deck.length === 0) {
      deck = tracks(mood)
        .map((track) => ({ track, key: random() }))
        .sort((a, b) => a.key - b.key)
        .map(({ track }) => track)
      // A fresh deck mustn't start with the track that just played: tracks are dealt from the end.
      if (deck.length > 1 && deck.at(-1) === last) {
        deck.reverse()
      }
      decks.set(mood, deck)
    }
    return deck.pop()
  }

  let playing: Mood | null = null
  // After the menu's theme, the battle opens on its own sounds for a while before the first track.
  let silence = opensOnTheme ? FIRST_SILENCE : SILENCE[0] + random() * (SILENCE[1] - SILENCE[0])
  let theme = opensOnTheme
  const start = (mood: Mood, fade: number): MusicCue | null => {
    const track = deal(mood)
    if (track === undefined) {
      return null
    }
    last = track
    playing = mood
    return { track, mood, fade }
  }

  return {
    get playing() {
      return playing
    },
    update(seconds, situation, ended) {
      if (available.length === 0) {
        return null
      }
      const mood = moodOf(situation)
      if (playing !== null && ended) {
        playing = null
        // Into the attack's next track without a pause; otherwise let the front be heard for a while.
        silence = mood === "attack" ? 0 : SILENCE[0] + random() * (SILENCE[1] - SILENCE[0])
      }
      if (mood === "attack" && playing !== null && playing !== "attack") {
        theme = false
        return start("attack", CUT_FADE)
      }
      if (playing !== null) {
        return null
      }
      silence -= seconds
      if (silence > 0 && mood !== "attack") {
        return null
      }
      const next = theme && mood !== "attack" ? "theme" : mood
      theme = false
      return start(next, FADE_IN)
    }
  }
}
