import type { BattlefieldMap, SceneryKind, Trench } from "@verdun/map"
import { getMixer } from "../audio/mixer.ts"

/** The ambience in the level kit, under audio/<name>.ogg. */
export const AMBIENCE_FILES = ["no-mans-land", "wood", "rear", "ruins", "guns-far-1", "guns-far-2"] as const
export type AmbienceAudio = Readonly<Record<(typeof AMBIENCE_FILES)[number], ArrayBuffer>>

/** Loudest each bed gets, where its zone is strongest. */
const BED_LEVELS = { "no-mans-land": 0.55, wood: 0.5, rear: 0.35, ruins: 0.4 } as const
/** Distant guns: one every few seconds, quiet, from a random side. */
const GUNS = { minGap: 4, maxGap: 14, minVolume: 0.12, maxVolume: 0.35 } as const
/** How fast beds fade toward their new levels, per second. */
const FADE_RATE = 1.2
const CELL_METERS = 20

export interface AmbienceZones {
  /** 1 in no man's land, falling away behind the lines. */
  noMansLand(x: number, z: number): number
  /** How thickly wooded the ground around a point is, from 0 to 1. */
  wood(x: number, z: number): number
  /** How many ruins stand around a point, from 0 to 1. */
  ruins(x: number, z: number): number
}

function meanZ(trench: Trench): number {
  return trench.points.reduce((sum, [, z]) => sum + z, 0) / trench.points.length
}

/** Counts scenery of some kinds in coarse cells, so density near any point is a few lookups. */
function densityOf(map: BattlefieldMap, kinds: readonly SceneryKind[], full: number) {
  const counts = new Map<string, number>()
  for (const item of map.scenery) {
    if (kinds.includes(item.kind)) {
      const key = `${Math.floor(item.x / CELL_METERS)},${Math.floor(item.z / CELL_METERS)}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  return (x: number, z: number) => {
    const column = Math.floor(x / CELL_METERS)
    const row = Math.floor(z / CELL_METERS)
    let total = 0
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        total += counts.get(`${column + dx},${row + dz}`) ?? 0
      }
    }
    return Math.min(1, total / full)
  }
}

/** Where on the map each ambience belongs. */
export function ambienceZones(map: BattlefieldMap): AmbienceZones {
  const fire = map.trenches.filter((trench) => trench.kind === "fire")
  const south = Math.max(...fire.filter((trench) => trench.facing === "north").map(meanZ), 0)
  const north = Math.min(...fire.filter((trench) => trench.facing === "south").map(meanZ), Infinity)
  return {
    noMansLand(_x, z) {
      const behind = Math.max(south - z, z - north, 0)
      return Math.max(0, 1 - behind / 80)
    },
    wood: densityOf(map, ["tree", "stump", "log"], 40),
    ruins: densityOf(map, ["ruin", "rubble"], 12)
  }
}

export interface Ambience {
  /** Fades the beds for a listener at (x, z), and fires the odd distant gun. */
  update(x: number, z: number, frameSeconds: number): void
  dispose(): void
}

interface Bed {
  readonly gain: GainNode
  readonly level: number
  readonly weight: (x: number, z: number) => number
}

/**
 * The sector's sound: wind over no man's land with the rumble of the guns in it, creaking shattered trees in the woods,
 * crows over Fleury's ruins and birdsong behind the lines, crossfaded by where the listener stands, and now and then a
 * gun firing somewhere far off. Plays through the mixer's ambience bus, which ducks after a near miss; audio starts on
 * the player's first click or key press, as browsers require.
 */
export async function createAmbience(map: BattlefieldMap, audio: AmbienceAudio): Promise<Ambience> {
  const mixer = getMixer()
  const { context } = mixer
  const zones = ambienceZones(map)
  // decodeAudioData detaches what it's given: decode copies.
  const decode = (name: (typeof AMBIENCE_FILES)[number]) => context.decodeAudioData(audio[name].slice(0))
  const [noMansLand, wood, rear, ruins, gun1, gun2] = await Promise.all(AMBIENCE_FILES.map(decode))
  const loop = (buffer: AudioBuffer | undefined): GainNode => {
    const gain = context.createGain()
    gain.gain.value = 0
    gain.connect(mixer.ambience)
    if (buffer) {
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      source.connect(gain)
      source.start()
    }
    return gain
  }
  const beds: Bed[] = [
    { gain: loop(noMansLand), level: BED_LEVELS["no-mans-land"], weight: zones.noMansLand },
    { gain: loop(wood), level: BED_LEVELS.wood, weight: zones.wood },
    { gain: loop(rear), level: BED_LEVELS.rear, weight: (x, z) => 1 - zones.noMansLand(x, z) },
    { gain: loop(ruins), level: BED_LEVELS.ruins, weight: zones.ruins }
  ]
  const guns = [gun1, gun2].filter((gun): gun is AudioBuffer => gun !== undefined)
  let untilGun = GUNS.minGap

  return {
    update(x, z, frameSeconds) {
      const fade = Math.min(1, frameSeconds * FADE_RATE)
      for (const bed of beds) {
        const target = bed.level * bed.weight(x, z)
        bed.gain.gain.value += (target - bed.gain.gain.value) * fade
      }
      untilGun -= frameSeconds
      const gun = guns[Math.floor(Math.random() * guns.length)]
      if (untilGun <= 0 && gun) {
        untilGun = GUNS.minGap + Math.random() * (GUNS.maxGap - GUNS.minGap)
        const source = context.createBufferSource()
        source.buffer = gun
        const pan = context.createStereoPanner()
        pan.pan.value = Math.random() * 1.6 - 0.8
        const gain = context.createGain()
        gain.gain.value = GUNS.minVolume + Math.random() * (GUNS.maxVolume - GUNS.minVolume)
        source.connect(pan).connect(gain).connect(mixer.ambience)
        source.onended = () => source.disconnect()
        source.start()
      }
    },
    dispose() {
      for (const bed of beds) {
        bed.gain.disconnect()
      }
    }
  }
}
