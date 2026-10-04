/**
 * The game's audio graph, in plain Web Audio:
 *
 *   voice: source -> low-pass (air, occlusion) -> pan -> gain -> battle bus -------------------------> master
 *                                                            \-> reverb send -> trench/dugout/ruins -> master
 *   beds:  source -> gain -> ambience bus ----------------------------------------------------------> master
 *   ears:  source -> gain -> ears bus (the ringing, and breathing in the mask: never muffled) --------> master
 *
 * The battle and ambience buses duck after a near miss. Reverb comes from impulse responses made here, so no recording's
 * licence is involved (BOOM's forbids using its sounds as impulse responses). One mixer serves the whole game; audio
 * starts on the player's first click or key press, as browsers require.
 */

import { createTuning, type Tuning } from "./tuning.ts"

/** How the listener's surroundings colour what they hear, each from 0 (not there) to 1. */
export interface Space {
  /** Down in a trench: tight, earthy reflections off walls a metre away, the sky above. */
  readonly trench: number
  /** In a dugout: small and dead. */
  readonly dugout: number
  /** Among Fleury's ruins: hard slapback off broken walls. */
  readonly ruins: number
}

export const OPEN: Space = { trench: 0, dugout: 0, ruins: 0 }

/** One sound to play through the mixer. */
export interface Voice {
  readonly buffer: AudioBuffer
  readonly volume: number
  /** -1 (left) to 1 (right). */
  readonly pan: number
  /** Seconds from now. */
  readonly delay: number
  /** Low-pass cutoff in hertz: air and anything in the way take the highs off distant sounds. */
  readonly cutoff: number
  /** Share sent to the reverb of the listener's space. */
  readonly reverb: number
  /** Detune in cents. */
  readonly detune: number
  readonly bus: "battle" | "ears" | "ambience"
  readonly loop?: boolean
  /** What's playing, for the mixer panel's readout. */
  readonly name?: string
}

/** A sound that started lately, for the mixer panel. */
export interface Played {
  readonly name: string
  readonly volume: number
  /** Seconds, on the mixer's clock. */
  readonly at: number
}

/** A looping bed whose level can be set while it plays. */
export interface Bed {
  /** Eases the bed toward `level` (0 to 1) over about a second. */
  setLevel(level: number): void
  stop(): void
}

export interface Mixer {
  readonly context: AudioContext
  /** The bus ambience beds play into. */
  readonly ambience: AudioNode
  /** Plays a voice, or drops it when MAX_VOICES are sounding and it is quieter than all of them. */
  play(voice: Voice): AudioBufferSourceNode | null
  /** Starts a looping bed on the ambience bus, silent until its level is set. */
  bed(buffer: AudioBuffer): Bed
  /** Fades the reverbs toward the listener's surroundings. */
  setSpace(space: Space): void
  /** A near miss: muffles the battle and the ambience by `depth` (0 to 1), and lets them back after the ringing. */
  shock(depth: number): void
  /** Voices sounding now. */
  readonly sounding: number
  /** The mix's levels: buses, sounds and beds. */
  readonly tuning: Tuning
  /** The latest sounds to start, newest last. */
  readonly recent: readonly Played[]
}

/** More voices than this at once is mud: the quietest gives way. */
export const MAX_VOICES = 48
/** After a near miss: how long the battle stays muffled and how long it takes to come back, in seconds. */
const SHOCK_HOLD = 0.4
const SHOCK_RECOVERY = 3
/** The ambience ducks by this share of the battle's duck. */
const AMBIENCE_DUCK = 0.6
/** Seconds the reverbs take to follow the listener into or out of a space. */
const SPACE_FADE = 0.4
/** Seconds a bed takes to reach a new level. */
const BED_FADE = 1
/** Sounds the mixer remembers having started, for the panel. */
const RECENT = 24
const BUSES = ["master", "battle", "ambience", "ears"] as const

interface Reverb {
  readonly seconds: number
  /** Early reflections: (delay in seconds, level). */
  readonly reflections: readonly (readonly [number, number])[]
  /** One-pole low-pass on the tail, in hertz: earth soaks up the highs. */
  readonly damping: number
  readonly level: number
}

/** Each space's reverb: walls 1.1 m away in a trench (6 ms there and back), a boxy dugout, slapback off ruins. */
const REVERBS: Readonly<Record<keyof Space, Reverb>> = {
  trench: {
    seconds: 0.45,
    reflections: [
      [0.0065, 0.6],
      [0.013, 0.35],
      [0.021, 0.2]
    ],
    damping: 2500,
    level: 0.7
  },
  dugout: {
    seconds: 0.25,
    reflections: [
      [0.004, 0.7],
      [0.007, 0.5],
      [0.011, 0.3]
    ],
    damping: 1400,
    level: 0.8
  },
  ruins: {
    seconds: 0.9,
    reflections: [
      [0.028, 0.5],
      [0.047, 0.35],
      [0.071, 0.25]
    ],
    damping: 6000,
    level: 0.5
  }
}

/** A reverb's impulse response, made from noise: reflections, then a decaying, darkening tail. */
function impulse(context: BaseAudioContext, reverb: Reverb, seed: number): AudioBuffer {
  const length = Math.ceil(reverb.seconds * context.sampleRate)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  const smoothing = Math.exp((-2 * Math.PI * reverb.damping) / context.sampleRate)
  let random = seed
  const noise = () => {
    random = (random * 1664525 + 1013904223) % 4294967296
    return random / 2147483648 - 1
  }
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    let low = 0
    for (let index = 0; index < length; index++) {
      const time = index / context.sampleRate
      low = low * smoothing + noise() * (1 - smoothing)
      data[index] = low * Math.exp((-6.9 * time) / reverb.seconds) * reverb.level
    }
    for (const [delay, level] of reverb.reflections) {
      const index = Math.floor((delay + channel * 0.0007) * context.sampleRate)
      if (index < length) {
        data[index] = (data[index] ?? 0) + level
      }
    }
  }
  return buffer
}

let shared: Mixer | null = null

/** The game's one mixer, made on first use. */
export function getMixer(): Mixer {
  shared ??= createMixer(new AudioContext({ latencyHint: "interactive" }))
  return shared
}

function createMixer(context: AudioContext): Mixer {
  const tuning = createTuning(import.meta.env.DEV)
  // Each bus feeds a trim the mix sets, so ducking and tuning never fight over one gain.
  const trims: Readonly<Record<(typeof BUSES)[number], GainNode>> = {
    master: context.createGain(),
    battle: context.createGain(),
    ambience: context.createGain(),
    ears: context.createGain()
  }
  const retrim = () => {
    for (const bus of BUSES) {
      trims[bus].gain.value = tuning.level(`bus:${bus}`)
    }
  }
  retrim()
  tuning.onChange(retrim)
  trims.master.connect(context.destination)
  const master = trims.master
  const battle = context.createGain()
  battle.connect(trims.battle).connect(master)
  const ambience = context.createGain()
  ambience.connect(trims.ambience).connect(master)
  const ears = context.createGain()
  ears.connect(trims.ears).connect(master)
  const recent: Played[] = []
  const send = context.createGain()
  const reverb = (name: keyof Space, seed: number): GainNode => {
    const level = context.createGain()
    level.gain.value = 0
    const convolver = context.createConvolver()
    convolver.buffer = impulse(context, REVERBS[name], seed)
    send.connect(level).connect(convolver).connect(battle)
    return level
  }
  const spaces: Readonly<Record<keyof Space, GainNode>> = {
    trench: reverb("trench", 1916),
    dugout: reverb("dugout", 1917),
    ruins: reverb("ruins", 1918)
  }

  // Browsers keep audio suspended until the player does something.
  const resume = () => {
    if (context.state !== "running") {
      void context.resume()
    }
  }
  for (const type of ["pointerdown", "keydown", "touchstart"]) {
    globalThis.addEventListener?.(type, resume, { capture: true })
  }

  const active: { readonly source: AudioBufferSourceNode; readonly volume: number }[] = []
  const forget = (source: AudioBufferSourceNode) => {
    const index = active.findIndex((voice) => voice.source === source)
    if (index >= 0) {
      active.splice(index, 1)
    }
  }

  return {
    context,
    ambience,
    get sounding() {
      return active.length
    },
    tuning,
    recent,
    play(voice) {
      if (voice.bus === "battle" && active.length >= MAX_VOICES) {
        let quietest = 0
        for (let index = 1; index < active.length; index++) {
          if ((active[index]?.volume ?? 1) < (active[quietest]?.volume ?? 1)) {
            quietest = index
          }
        }
        const victim = active[quietest]
        if (!victim || victim.volume >= voice.volume) {
          return null
        }
        victim.source.stop()
        forget(victim.source)
      }
      const source = context.createBufferSource()
      source.buffer = voice.buffer
      source.loop = voice.loop ?? false
      source.detune.value = voice.detune
      const filter = context.createBiquadFilter()
      filter.type = "lowpass"
      filter.frequency.value = voice.cutoff
      const pan = context.createStereoPanner()
      pan.pan.value = voice.pan
      const gain = context.createGain()
      gain.gain.value = voice.volume
      source.connect(filter).connect(pan).connect(gain)
      if (voice.bus === "ears") {
        gain.connect(ears)
      } else if (voice.bus === "ambience") {
        gain.connect(ambience)
      } else {
        gain.connect(battle)
        if (voice.reverb > 0) {
          const wet = context.createGain()
          wet.gain.value = voice.reverb
          gain.connect(wet).connect(send)
        }
        active.push({ source, volume: voice.volume })
      }
      source.onended = () => {
        forget(source)
        source.disconnect()
      }
      source.start(context.currentTime + Math.max(0, voice.delay))
      if (voice.name) {
        recent.push({ name: voice.name, volume: voice.volume, at: context.currentTime + Math.max(0, voice.delay) })
        recent.splice(0, Math.max(0, recent.length - RECENT))
      }
      return source
    },
    bed(buffer) {
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      const gain = context.createGain()
      gain.gain.value = 0
      source.connect(gain).connect(ambience)
      // Start somewhere in the loop, so beds made together don't repeat in step.
      source.start(context.currentTime, Math.random() * buffer.duration)
      return {
        setLevel(level) {
          gain.gain.setTargetAtTime(level, context.currentTime, BED_FADE / 3)
        },
        stop() {
          source.stop()
          source.disconnect()
        }
      }
    },
    setSpace(space) {
      const now = context.currentTime
      for (const name of ["trench", "dugout", "ruins"] as const) {
        spaces[name].gain.setTargetAtTime(space[name], now, SPACE_FADE / 3)
      }
    },
    shock(depth) {
      const now = context.currentTime
      for (const [bus, share] of [
        [battle, 1],
        [ambience, AMBIENCE_DUCK]
      ] as const) {
        bus.gain.cancelScheduledValues(now)
        bus.gain.setValueAtTime(bus.gain.value, now)
        bus.gain.linearRampToValueAtTime(1 - depth * share, now + 0.03)
        bus.gain.setValueAtTime(1 - depth * share, now + SHOCK_HOLD)
        bus.gain.linearRampToValueAtTime(1, now + SHOCK_HOLD + SHOCK_RECOVERY)
      }
    }
  }
}
