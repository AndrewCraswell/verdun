import { type Listener, placeSound, type SoundCall } from "./battle-sound-model.ts"

interface Positioned {
  readonly position: { readonly x: number; readonly z: number }
}

/** The level's own sound sources: what level/dress-battlefield.ts dresses the battlefield with. */
export interface LevelSources {
  readonly life: {
    /** Flames in the braziers by the dugouts. */
    readonly braziers: readonly Positioned[]
    readonly crows: {
      readonly flocks: readonly {
        readonly state: "perched" | "circling" | "landing"
        readonly perch: { readonly x: number; readonly z: number }
      }[]
    }
  }
  /** Fires shells have started, burning for a minute or so. */
  readonly aftermath: { readonly fires: readonly Positioned[] }
}

/** Fire is heard within this many metres of the nearest flame, louder the closer. */
const FIRE_RANGE = 30
/** Crows taking off are heard within this many metres. */
const CROW_RANGE = 200

/** How loud the crackle of fire is for the listener, from 0 to 1: by the nearest brazier or burning wreck. */
export function fireLevel(sources: LevelSources, listener: Listener): number {
  let nearest = Infinity
  for (const flame of [...sources.life.braziers, ...sources.aftermath.fires]) {
    nearest = Math.min(nearest, Math.hypot(flame.position.x - listener.x, flame.position.z - listener.z))
  }
  // The camera's height counts too: from up high every fire is far.
  const distance = Math.hypot(nearest, listener.height * 0.5)
  return Math.max(0, 1 - distance / FIRE_RANGE) ** 2
}

export interface LevelSoundModel {
  /** Crows taking off since the last call. Call after every step. */
  step(listener: Listener): SoundCall[]
}

/** The level's own sounds: crows cawing as a flock takes off from the wire. Fire is a bed set from `fireLevel`. */
export function createLevelSoundModel(sources: LevelSources): LevelSoundModel {
  const states = sources.life.crows.flocks.map((flock) => flock.state)
  return {
    step(listener) {
      const calls: SoundCall[] = []
      for (const [index, flock] of sources.life.crows.flocks.entries()) {
        const before = states[index]
        states[index] = flock.state
        const { x, z } = flock.perch
        if (
          before === "perched" &&
          flock.state === "circling" &&
          Math.hypot(x - listener.x, z - listener.z) < CROW_RANGE
        ) {
          const call = placeSound(listener, "crow", x, z)
          if (call) {
            calls.push(call)
          }
        }
      }
      return calls
    }
  }
}
