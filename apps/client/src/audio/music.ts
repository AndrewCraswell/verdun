import type { Scene } from "@babylonjs/core/scene"
import { isInTrench, type Simulation, type Squad } from "@verdun/sim"
import { getMixer } from "./mixer.ts"
import { createMusicModel, isAttacking, type Mood, type MusicCue } from "./music-model.ts"

/**
 * Where the soundtrack built by scripts/build-music.mjs is: served by the dev server, and copied into a build when it has
 * been built (vite.config.ts). music.json lists the tracks.
 */
const MUSIC_ROUTE = `${import.meta.env.BASE_URL}music/`

export interface Music {
  /** The track playing, or null in a silence. */
  readonly track: string | null
  readonly mood: Mood | null
  dispose(): void
}

interface Playing {
  readonly track: string
  readonly element: HTMLAudioElement
  readonly source: MediaElementAudioSourceNode
  readonly gain: GainNode
  ended: boolean
}

function isTrackList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((track) => typeof track === "string")
}

async function builtTracks(): Promise<string[] | null> {
  try {
    const response = await fetch(`${MUSIC_ROUTE}music.json`)
    const tracks: unknown = response.ok ? await response.json() : null
    return isTrackList(tracks) ? tracks : null
  } catch {
    return null
  }
}

/**
 * Plays the soundtrack for the player's squad: the theme, then tracks for the battle's mood (music-model.ts), streamed
 * one at a time through the mixer's music bus. Resolves null when no soundtrack has been built, and the game is silent
 * of music. `fighting` is how heavy the fighting along the front is, 0 to 1.
 */
export async function startMusic(
  scene: Scene,
  sim: Simulation,
  squad: Squad,
  fighting: () => number
): Promise<Music | null> {
  const tracks = await builtTracks()
  if (!tracks) {
    return null
  }
  const mixer = getMixer()
  const { context } = mixer
  const model = createMusicModel(tracks)
  let playing: Playing | null = null

  const fadeOut = (old: Playing, fade: number) => {
    old.gain.gain.setTargetAtTime(0, context.currentTime, fade / 3)
    setTimeout(
      () => {
        old.element.pause()
        old.source.disconnect()
        old.gain.disconnect()
        // Let go of the stream.
        old.element.removeAttribute("src")
        old.element.load()
      },
      fade * 1000 + 500
    )
  }
  const play = (cue: MusicCue) => {
    const element = new Audio(`${MUSIC_ROUTE}${cue.track}.ogg`)
    element.preload = "auto"
    const source = context.createMediaElementSource(element)
    const gain = context.createGain()
    gain.gain.value = 0
    source.connect(gain).connect(mixer.music)
    gain.gain.setTargetAtTime(1, context.currentTime, cue.fade / 3)
    const next: Playing = { track: cue.track, element, source, gain, ended: false }
    // A track that won't load or play counts as over, and the model moves on to the next.
    const over = () => {
      next.ended = true
    }
    element.addEventListener("ended", over)
    element.addEventListener("error", () => {
      console.warn(`Music ${cue.track} couldn't be played; rebuild the soundtrack with pnpm sound:music.`)
      over()
    })
    element.play().catch(over)
    if (playing) {
      fadeOut(playing, cue.fade)
    }
    playing = next
  }

  const inTrench = (x: number, z: number) => isInTrench(sim.map, x, z)
  const observer = scene.onBeforeRenderObservable.add(() => {
    // Browsers keep audio off until the player clicks or presses a key; the theme waits for that.
    if (context.state !== "running") {
      return
    }
    const cue = model.update(
      scene.getEngine().getDeltaTime() / 1000,
      { attacking: isAttacking(squad.order, inTrench), fighting: fighting(), daylight: mixer.daylight },
      playing?.ended ?? false
    )
    if (cue) {
      play(cue)
    }
  })

  return {
    get track() {
      return model.playing === null ? null : (playing?.track ?? null)
    },
    get mood() {
      return model.playing
    },
    dispose() {
      observer.remove()
      if (playing) {
        fadeOut(playing, 1)
        playing = null
      }
    }
  }
}
