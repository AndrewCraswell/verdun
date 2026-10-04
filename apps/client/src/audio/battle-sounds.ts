import {
  type AudioEngineV2,
  CreateAudioBusAsync,
  CreateSoundAsync,
  CreateSoundBufferAsync,
  LastCreatedAudioEngine
} from "@babylonjs/core/AudioV2/abstractAudio/audioEngineV2"
import type { StaticSound } from "@babylonjs/core/AudioV2/abstractAudio/staticSound"
import { CreateAudioEngineAsync } from "@babylonjs/core/AudioV2/webAudio/webAudioEngine"
import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Simulation } from "@verdun/sim"
import type { KitFiles } from "../level/kit-files.ts"
import {
  createBattleSoundModel,
  type BattleSoundOptions,
  type Listener,
  SOUND_CUES,
  type SoundCue
} from "./battle-sound-model.ts"

/** The encoded variations of each cue, as read from the kit. */
export type BattleSoundFiles = ReadonlyMap<SoundCue, readonly ArrayBuffer[]>

/** Copies of each variation that can sound at once, each panned on its own. */
const VOICES_PER_VARIATION = 2
/** Random detune per play, in cents either way, so repeats don't sound identical. */
const DETUNE = 80
/**
 * After a near miss the battle drops by up to this share of its volume (the nearer, the more), stays down this many
 * seconds while the ears ring, then comes back over MUFFLE_RECOVERY seconds.
 */
const MUFFLE = 0.8
const MUFFLE_HOLD = 0.4
const MUFFLE_RECOVERY = 3

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
 * The battle's sound effects, heard from the camera: shots, shells, cracks, the batteries, the fallen and the gas
 * alarm, from scripts/build-sound-effects.py. Shares the ambience's audio engine when there is one.
 */
export async function createBattleSounds(
  files: BattleSoundFiles,
  sim: Simulation,
  camera: TargetCamera,
  options: BattleSoundOptions
): Promise<BattleSounds> {
  const engine: AudioEngineV2 =
    LastCreatedAudioEngine() ?? (await CreateAudioEngineAsync({ resumeOnInteraction: true }))
  // Everything but the ringing in the ears goes through one bus, so a near miss can muffle the battle.
  const battle = await CreateAudioBusAsync("battle", {}, engine)
  const voices = new Map<SoundCue, StaticSound[][]>()
  await Promise.all(
    [...files].map(async ([cue, variations]) => {
      const out = cue === "ear-ring" ? {} : { outBus: battle }
      const sounds = await Promise.all(
        variations.map(async (data, index) => {
          const buffer = await CreateSoundBufferAsync(data, {}, engine)
          return Promise.all(
            Array.from({ length: VOICES_PER_VARIATION }, (_, copy) =>
              CreateSoundAsync(
                `${cue}-${index}-${copy}`,
                buffer,
                { maxInstances: 1, stereoEnabled: true, ...out },
                engine
              )
            )
          )
        })
      )
      voices.set(cue, sounds)
    })
  )
  const turn = new Map<StaticSound[], number>()
  const model = createBattleSoundModel(sim, options)
  const breathing = voices.get("mask-breath")?.[0]?.[0] ?? null
  let breathingOn = false
  /** When the muffled battle starts coming back, in milliseconds (performance.now), or null when it isn't muffled. */
  let recoverAt: number | null = null

  return {
    step() {
      const calls = model.step(listenerOf(camera))
      const shock = model.takeShock()
      if (shock > 0) {
        battle.setVolume(1 - MUFFLE * shock, { duration: 0.03 })
        recoverAt = performance.now() + MUFFLE_HOLD * 1000
      }
      for (const call of calls) {
        const variations = voices.get(call.cue)
        const copies = variations?.[Math.floor(Math.random() * variations.length)]
        if (!copies || copies.length === 0) {
          continue
        }
        const next = turn.get(copies) ?? 0
        turn.set(copies, (next + 1) % copies.length)
        const voice = copies[next]
        if (voice) {
          voice.stereo.pan = call.pan
          voice.pitch = (Math.random() * 2 - 1) * DETUNE
          voice.play({ volume: call.volume, waitTime: call.delay })
        }
      }
    },
    update() {
      if (recoverAt !== null && performance.now() >= recoverAt) {
        recoverAt = null
        battle.setVolume(1, { duration: MUFFLE_RECOVERY })
      }
      const masked = model.breathingInMask()
      if (breathing && masked !== breathingOn) {
        breathingOn = masked
        if (masked) {
          breathing.play({ loop: true, volume: 0.3 })
        } else {
          breathing.stop()
        }
      }
    },
    dispose() {
      for (const variations of voices.values()) {
        for (const copies of variations) {
          for (const voice of copies) {
            voice.dispose()
          }
        }
      }
    }
  }
}
