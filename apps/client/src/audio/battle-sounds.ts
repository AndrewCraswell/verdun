import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Simulation } from "@verdun/sim"
import { ambienceZones } from "../level/ambience.ts"
import type { KitFiles } from "../level/kit-files.ts"
import { createAtmosphereModel } from "./atmosphere-model.ts"
import {
  createBattleSoundModel,
  type BattleSoundOptions,
  type Listener,
  type ListenerSpace,
  listenerSpace,
  type SoundCall,
  SOUND_CUES,
  type SoundCue
} from "./battle-sound-model.ts"
import { createFootstepModel } from "./footstep-model.ts"
import { createLevelSoundModel, fireLevel, type LevelSources } from "./level-sound-model.ts"
import { type Bed, getMixer } from "./mixer.ts"

/** The encoded variations of each cue, as read from the kit. */
export type BattleSoundFiles = ReadonlyMap<SoundCue, readonly ArrayBuffer[]>

/** Random detune per play, in cents either way, so repeats don't sound identical. */
const DETUNE = 80
/** After a near miss the battle drops by up to this share of its volume, the nearer the more (see Mixer.shock). */
const MUFFLE = 0.8
/** Share of each battle sound sent to the reverb of the listener's space. */
const REVERB_SEND = 0.35
/** Sounds heard inside the head, past the reverb and the muffling of a near miss. */
const EARS: ReadonlySet<SoundCue> = new Set(["ear-ring", "mask-breath"])
/** The listener's surroundings are looked up this often, in steps. */
const SPACE_INTERVAL = 10
/** Breathing in the mask, as loud as; and short, hard breathing while pinned down. */
const BREATHING_VOLUME = 0.3
const PINNED_BREATH_VOLUME = 0.25
/** The looping beds at full: rain, wind and the distant front (see atmosphere-model.ts). */
const BED_VOLUMES = {
  rain: 0.45,
  wind: 0.35,
  "front-roar": 0.8,
  fire: 0.5,
  "night-warm": 0.4,
  "night-cold": 0.35,
  "rain-trench": 0.4,
  "wire-wind": 0.3
} as const
/** Beds are re-levelled this often, in steps. */
const BED_INTERVAL = 10

/** Where a cue plays: inside the head, with the weather, or out on the battlefield. */
function busFor(cue: SoundCue): "ears" | "ambience" | "battle" {
  if (EARS.has(cue)) {
    return "ears"
  }
  return cue === "thunder" ? "ambience" : "battle"
}

function isManifest(value: unknown): value is Record<string, { variations: number }> {
  return typeof value === "object" && value !== null
}

/** Reads the kit's sound effects (sfx/sounds.json and its files), or null when the kit was built without them. */
export async function loadBattleSoundFiles(files: KitFiles): Promise<BattleSoundFiles | null> {
  try {
    const manifest: unknown = JSON.parse(new TextDecoder().decode(await files.read("sfx/sounds.json")))
    if (!isManifest(manifest)) {
      return null
    }
    const entries = await Promise.all(
      SOUND_CUES.map(async (cue) => {
        const count = manifest[cue]?.variations ?? 0
        const buffers = await Promise.all(
          Array.from({ length: count }, (_, index) => files.read(`sfx/${cue}-${index}.ogg`))
        )
        return [cue, buffers] as const
      })
    )
    return new Map(entries)
  } catch {
    return null
  }
}

export interface BattleSounds {
  /** Plays the sounds of the step the simulation just took. Call after every step. */
  step(): void
  /** Keeps continuous sounds, such as breathing in a gas mask, in step with the battle. Call every frame. */
  update(): void
  dispose(): void
}

/**
 * Decodes every variation, leaving out any the browser can't decode (a file cut short while the sound build was
 * writing it, say) with a warning: a missing sound must never stop the game.
 */
async function decodeAll(context: BaseAudioContext, files: BattleSoundFiles): Promise<Map<SoundCue, AudioBuffer[]>> {
  const decoded = new Map<SoundCue, AudioBuffer[]>()
  const failed: string[] = []
  await Promise.all(
    [...files].map(async ([cue, variations]) => {
      const buffers = await Promise.all(
        variations.map(async (data, index) => {
          try {
            // decodeAudioData detaches the buffer it's given, so decode copies and keep the kit's files intact.
            return await context.decodeAudioData(data.slice(0))
          } catch {
            failed.push(`${cue}-${index}`)
            return null
          }
        })
      )
      decoded.set(
        cue,
        buffers.filter((buffer): buffer is AudioBuffer => buffer !== null)
      )
    })
  )
  if (failed.length > 0) {
    console.warn(
      "Some sound effects couldn't be decoded and are left out; rebuild them with scripts/build-sound-effects.py:",
      failed
    )
  }
  return decoded
}

/** The camera as a listener: the point it looks at, its height above it, and its right across the ground. */
function listenerOf(camera: TargetCamera): Listener {
  const target = camera.getTarget()
  const right = camera.getDirection(Vector3.Right())
  const across = Math.hypot(right.x, right.z) || 1
  return {
    x: target.x,
    z: target.z,
    height: Math.max(0, camera.position.y - target.y),
    rightX: right.x / across,
    rightZ: right.z / across
  }
}

/**
 * The battle's sound effects, heard from the camera through the game's mixer: shots, shells, cracks, the batteries,
 * the fallen and the gas alarm, from scripts/build-sound-effects.py, each filtered for distance and anything in the
 * way, and coloured by the trench, dugout or ruins the listener is in.
 */
export interface BattleSoundPlayerOptions extends BattleSoundOptions {
  /** The level's braziers, fires and crows, when the battlefield is dressed. */
  readonly level?: LevelSources | null
  /** Lightning flashes, with each strike's distance in metres, for thunder to follow; without it thunder comes on its own. */
  readonly lightning?: { add(callback: (distance: number) => void): unknown } | null
}

/** Battle sounds that play nothing, for when they can't start. */
const SILENT: BattleSounds = { step: () => undefined, update: () => undefined, dispose: () => undefined }

export async function createBattleSounds(
  files: BattleSoundFiles,
  sim: Simulation,
  camera: TargetCamera,
  options: BattleSoundPlayerOptions
): Promise<BattleSounds> {
  try {
    return await startBattleSounds(files, sim, camera, options)
  } catch (error) {
    console.warn("Battle sounds failed to start; the battle goes on in silence.", error)
    return SILENT
  }
}

async function startBattleSounds(
  files: BattleSoundFiles,
  sim: Simulation,
  camera: TargetCamera,
  options: BattleSoundPlayerOptions
): Promise<BattleSounds> {
  const mixer = getMixer()
  if (import.meta.env.DEV) {
    // The sound mixer panel (M), for setting the mix by ear.
    void import("../dev/sound-mixer.ts").then(({ installSoundMixer }) => installSoundMixer(mixer))
  }
  const decoded = await decodeAll(mixer.context, files)
  const model = createBattleSoundModel(sim, options)
  const atmosphere = createAtmosphereModel(sim, { ownThunder: !options.lightning })
  const bed = (cue: keyof typeof BED_VOLUMES): Bed | null => {
    const buffer = decoded.get(cue)?.[0]
    return buffer ? mixer.bed(buffer) : null
  }
  const beds = {
    rain: bed("rain"),
    wind: bed("wind"),
    "front-roar": bed("front-roar"),
    fire: bed("fire"),
    "night-warm": bed("night-warm"),
    "night-cold": bed("night-cold"),
    "rain-trench": bed("rain-trench"),
    "wire-wind": bed("wire-wind")
  }
  const level = options.level ? createLevelSoundModel(options.level) : null
  const ruins = ambienceZones(sim.map).ruins
  const footsteps = createFootstepModel(sim, ruins)
  let breathing: AudioBufferSourceNode | null = null
  let panting: AudioBufferSourceNode | null = null
  let space: ListenerSpace = { trench: 0, dugout: 0, ruins: 0 }

  function play(call: SoundCall): void {
    const variations = decoded.get(call.cue)
    const buffer = variations?.[Math.floor(Math.random() * variations.length)]
    if (buffer) {
      const bus = busFor(call.cue)
      mixer.play({
        name: call.cue,
        buffer,
        volume: call.volume * mixer.tuning.level(call.cue),
        pan: call.pan,
        delay: call.delay,
        cutoff: call.cutoff,
        reverb: bus === "battle" ? REVERB_SEND : 0,
        detune: EARS.has(call.cue) ? 0 : (Math.random() * 2 - 1) * DETUNE,
        bus
      })
    }
  }
  options.lightning?.add((distance) => {
    const call = atmosphere.strike(listenerOf(camera), distance)
    if (call) {
      play(call)
    }
  })

  return {
    step() {
      const listener = listenerOf(camera)
      if (sim.tick % SPACE_INTERVAL === 0) {
        space = listenerSpace(sim, listener, options.soldier(), ruins)
        mixer.setSpace(space)
      }
      const calls = [
        ...model.step(listener),
        ...atmosphere.step(listener),
        ...(level?.step(listener) ?? []),
        ...footsteps.step(listener)
      ]
      if (sim.tick % BED_INTERVAL === 0) {
        const levels = atmosphere.levels(listener)
        const tuned = (cue: keyof typeof BED_VOLUMES) => BED_VOLUMES[cue] * mixer.tuning.level(cue)
        beds.rain?.setLevel(levels.rain * tuned("rain"))
        beds.wind?.setLevel(levels.wind * tuned("wind"))
        beds["front-roar"]?.setLevel(levels.roar * tuned("front-roar"))
        beds.fire?.setLevel(options.level ? fireLevel(options.level, listener) * tuned("fire") : 0)
        beds["night-warm"]?.setLevel(levels.nightWarm * tuned("night-warm"))
        beds["night-cold"]?.setLevel(levels.nightCold * tuned("night-cold"))
        mixer.daylight = levels.daylight
        beds["rain-trench"]?.setLevel(levels.rain * space.trench * tuned("rain-trench"))
        beds["wire-wind"]?.setLevel(levels.wire * tuned("wire-wind"))
      }
      const shock = model.takeShock()
      if (shock > 0) {
        mixer.shock(MUFFLE * shock)
      }
      for (const call of calls) {
        play(call)
      }
    },
    update() {
      const pinned = model.breathingPinned()
      const pant = decoded.get("pinned-breath")?.[0]
      if (pinned && !panting && pant) {
        panting = mixer.play({
          name: "pinned-breath",
          buffer: pant,
          volume: PINNED_BREATH_VOLUME * mixer.tuning.level("pinned-breath"),
          pan: 0,
          delay: 0,
          cutoff: 20000,
          reverb: 0,
          detune: 0,
          bus: "ears",
          loop: true
        })
      } else if (!pinned && panting) {
        panting.stop()
        panting = null
      }
      const masked = model.breathingInMask()
      const buffer = decoded.get("mask-breath")?.[0]
      if (masked && !breathing && buffer) {
        breathing = mixer.play({
          buffer,
          volume: BREATHING_VOLUME * mixer.tuning.level("mask-breath"),
          pan: 0,
          delay: 0,
          cutoff: 20000,
          reverb: 0,
          detune: 0,
          bus: "ears",
          loop: true
        })
      } else if (!masked && breathing) {
        breathing.stop()
        breathing = null
      }
    },
    dispose() {
      breathing?.stop()
      panting?.stop()
      for (const playing of Object.values(beds)) {
        playing?.stop()
      }
    }
  }
}
