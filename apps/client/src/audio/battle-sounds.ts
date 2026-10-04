import type { TargetCamera } from "@babylonjs/core/Cameras/targetCamera"
import { Vector3 } from "@babylonjs/core/Maths/math.vector"
import type { Simulation } from "@verdun/sim"
import { ambienceZones } from "../level/ambience.ts"
import type { KitFiles } from "../level/kit-files.ts"
import {
  createBattleSoundModel,
  type BattleSoundOptions,
  type Listener,
  listenerSpace,
  SOUND_CUES,
  type SoundCue
} from "./battle-sound-model.ts"
import { getMixer } from "./mixer.ts"

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
/** Breathing in the mask, as loud as. */
const BREATHING_VOLUME = 0.3

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
 * The battle's sound effects, heard from the camera through the game's mixer: shots, shells, cracks, the batteries,
 * the fallen and the gas alarm, from scripts/build-sound-effects.py, each filtered for distance and anything in the
 * way, and coloured by the trench, dugout or ruins the listener is in.
 */
export async function createBattleSounds(
  files: BattleSoundFiles,
  sim: Simulation,
  camera: TargetCamera,
  options: BattleSoundOptions
): Promise<BattleSounds> {
  const mixer = getMixer()
  const decoded = new Map<SoundCue, AudioBuffer[]>()
  await Promise.all(
    [...files].map(async ([cue, variations]) => {
      // decodeAudioData detaches the buffer it's given, so decode copies and keep the kit's files intact.
      decoded.set(cue, await Promise.all(variations.map((data) => mixer.context.decodeAudioData(data.slice(0)))))
    })
  )
  const model = createBattleSoundModel(sim, options)
  const ruins = ambienceZones(sim.map).ruins
  let breathing: AudioBufferSourceNode | null = null

  return {
    step() {
      const listener = listenerOf(camera)
      if (sim.tick % SPACE_INTERVAL === 0) {
        mixer.setSpace(listenerSpace(sim, listener, options.soldier(), ruins))
      }
      const calls = model.step(listener)
      const shock = model.takeShock()
      if (shock > 0) {
        mixer.shock(MUFFLE * shock)
      }
      for (const call of calls) {
        const variations = decoded.get(call.cue)
        const buffer = variations?.[Math.floor(Math.random() * variations.length)]
        if (buffer) {
          const ears = EARS.has(call.cue)
          mixer.play({
            buffer,
            volume: call.volume,
            pan: call.pan,
            delay: call.delay,
            cutoff: call.cutoff,
            reverb: ears ? 0 : REVERB_SEND,
            detune: ears ? 0 : (Math.random() * 2 - 1) * DETUNE,
            bus: ears ? "ears" : "battle"
          })
        }
      }
    },
    update() {
      const masked = model.breathingInMask()
      const buffer = decoded.get("mask-breath")?.[0]
      if (masked && !breathing && buffer) {
        breathing = mixer.play({
          buffer,
          volume: BREATHING_VOLUME,
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
    }
  }
}
