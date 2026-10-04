import { mapDepth } from "@verdun/map"
import {
  type EntityId,
  fallenIds,
  MaskState,
  Shell,
  type ShellInFlight,
  Side,
  type Simulation,
  soldierIds,
  TICK_RATE,
  Weapon,
  type WorldPoint
} from "@verdun/sim"

/** Every cue scripts/build-sound-effects.py builds, each a set of variations under sfx/<cue>-<n>.ogg. */
export const SOUND_CUES = [
  "rifle-fr-near",
  "rifle-fr-far",
  "rifle-de-near",
  "rifle-de-far",
  "mg-near",
  "mg-far",
  "crack",
  "field-near",
  "field-far",
  "heavy-near",
  "heavy-far",
  "shrapnel-near",
  "shrapnel-far",
  "grenade-near",
  "grenade-far",
  "gas-shell",
  "battery-field",
  "battery-heavy",
  "death",
  "gas-gong",
  "mask-breath"
] as const
export type SoundCue = (typeof SOUND_CUES)[number]

/** Where the player hears from: the ground point the camera looks at, how high the camera is, and the screen's right. */
export interface Listener {
  readonly x: number
  readonly z: number
  /** The camera's height above that point, in metres: zoomed out, the battle sounds further off. */
  readonly height: number
  /** The screen's right as a unit vector across the ground, for panning. */
  readonly rightX: number
  readonly rightZ: number
}

/** One sound to play: which cue, how loud (0 to 1), where in the stereo field (-1 to 1), and after how many seconds. */
export interface SoundCall {
  readonly cue: SoundCue
  readonly volume: number
  readonly pan: number
  readonly delay: number
}

/** Metres per second: distant bursts and guns are heard after they are seen. */
export const SPEED_OF_SOUND = 343
/** How much of the camera's height counts toward distance; the camera's ears are not really up there. */
const HEIGHT_WEIGHT = 0.5
/** Sounds quieter than this aren't worth a voice. */
const INAUDIBLE = 0.02
/** Pan never goes fully to one side, which sounds like one ear blocked. */
const PAN_WIDTH = 0.8

/** Loudness at the reference distance, and the distance inside which it doesn't get any louder. */
const LEVELS: Readonly<Record<SoundCue, { readonly volume: number; readonly reference: number }>> = {
  "rifle-fr-near": { volume: 0.7, reference: 20 },
  "rifle-fr-far": { volume: 0.6, reference: 60 },
  "rifle-de-near": { volume: 0.7, reference: 20 },
  "rifle-de-far": { volume: 0.6, reference: 60 },
  "mg-near": { volume: 0.55, reference: 25 },
  "mg-far": { volume: 0.6, reference: 80 },
  crack: { volume: 0.45, reference: 10 },
  "field-near": { volume: 1, reference: 40 },
  "field-far": { volume: 0.9, reference: 150 },
  "heavy-near": { volume: 1, reference: 60 },
  "heavy-far": { volume: 1, reference: 200 },
  "shrapnel-near": { volume: 0.9, reference: 40 },
  "shrapnel-far": { volume: 0.8, reference: 150 },
  "grenade-near": { volume: 0.8, reference: 20 },
  "grenade-far": { volume: 0.7, reference: 60 },
  "gas-shell": { volume: 0.6, reference: 20 },
  "battery-field": { volume: 1, reference: 400 },
  "battery-heavy": { volume: 1, reference: 500 },
  death: { volume: 0.6, reference: 15 },
  "gas-gong": { volume: 0.5, reference: 30 },
  "mask-breath": { volume: 0.3, reference: 1 }
}

/** Beyond these distances a sound switches to its far recording, made from further off. */
const NEAR = { rifle: 60, machineGun: 80, shell: 150, grenade: 60 } as const
/** Far machine guns play a whole recorded burst at most this often, in seconds, while they keep firing. */
const MG_FAR_INTERVAL = 1.5
/** Rounds landing this close to the listener crack past, if fired from further than CRACK_MIN_RANGE. */
const CRACK_RADIUS = 12
const CRACK_MIN_RANGE = 40
/** At most one crack this often, in seconds: a burst of cracks blurs into noise. */
const CRACK_INTERVAL = 0.1
/** Men are heard falling within this many metres, at most one this often (seconds). */
const DEATH_RANGE = 120
const DEATH_INTERVAL = 0.5
/** The batteries' reports: at most one this often, in seconds, however fast they fire. */
const BATTERY_INTERVAL = 0.4
/** The gas alarm sounds when men within this range of the listener start masking, at most once in this many seconds. */
const GAS_ALARM_RANGE = 150
const GAS_ALARM_REPEAT = 30
/** The alarm: strokes on a shell case, this many, this far apart in seconds. */
const GONG_STROKES = 6
const GONG_SPACING = 0.45
/** Masks near the listener are counted this often, in steps. */
const MASK_CHECK_INTERVAL = 10
/** Batteries stand this far behind their end of the map (the simulation's BATTERY_DISTANCE). */
const BATTERY_DISTANCE = 4000

const BURST_CUES: Readonly<Record<Shell, readonly [SoundCue, SoundCue]>> = {
  [Shell.FieldHighExplosive]: ["field-near", "field-far"],
  [Shell.FieldShrapnel]: ["shrapnel-near", "shrapnel-far"],
  [Shell.HeavyHighExplosive]: ["heavy-near", "heavy-far"],
  [Shell.FieldGas]: ["gas-shell", "gas-shell"],
  [Shell.Grenade]: ["grenade-near", "grenade-far"]
}

/** Ground distance from the listener, counting part of the camera's height. */
export function hearingDistance(listener: Listener, x: number, z: number): number {
  return Math.hypot(x - listener.x, z - listener.z, listener.height * HEIGHT_WEIGHT)
}

/**
 * A cue as heard from the listener: louder close by (inverse distance, flat inside the cue's reference distance),
 * panned toward its side of the screen, and delayed by the time sound takes to arrive. Null when it would be inaudible.
 */
export function placeSound(listener: Listener, cue: SoundCue, x: number, z: number, after = 0): SoundCall | null {
  const distance = hearingDistance(listener, x, z)
  const level = LEVELS[cue]
  const volume = level.volume * Math.min(1, level.reference / distance)
  if (volume < INAUDIBLE) {
    return null
  }
  const across = ((x - listener.x) * listener.rightX + (z - listener.z) * listener.rightZ) / distance
  return { cue, volume, pan: Math.max(-1, Math.min(1, across)) * PAN_WIDTH, delay: after + distance / SPEED_OF_SOUND }
}

/** What the battle sounds like, one simulation step at a time. */
export interface BattleSoundModel {
  /** The sounds of the step the simulation just took, heard from `listener`. Call after every step. */
  step(listener: Listener): SoundCall[]
  /** Whether the soldier the player controls has his mask on, so his breathing is heard through it. */
  breathingInMask(): boolean
}

export interface BattleSoundOptions {
  /** The soldier the player controls, or null when there's none. */
  readonly soldier: () => EntityId | null
}

/**
 * Turns the simulation's events and changes into sounds: every shot by weapon and side (machine guns round by round up
 * close, in whole bursts from afar), rounds cracking past, every shell and grenade burst by type, the batteries firing
 * far behind the lines, men falling nearby, and the shell-case gong when men nearby start pulling on gas masks.
 */
export function createBattleSoundModel(sim: Simulation, { soldier }: BattleSoundOptions): BattleSoundModel {
  const heardShells = new WeakSet<ShellInFlight>(sim.artillery.shells)
  let fallen = new Set(fallenIds(sim))
  const lastFarBurst = new Map<EntityId, number>()
  let lastCrack = -Infinity
  let lastDeath = -Infinity
  let lastBattery = -Infinity
  let lastGasAlarm = -Infinity
  let masksNear = 0
  const seconds = (ticks: number) => ticks / TICK_RATE

  function shotSounds(listener: Listener, calls: SoundCall[]): void {
    const now = seconds(sim.tick)
    for (const event of sim.events) {
      if (event.type !== "shot") {
        continue
      }
      const { shooter, from, to } = event
      const distance = hearingDistance(listener, from.x, from.z)
      if (sim.soldiers.weapon.kind[shooter] === Weapon.MachineGun) {
        if (distance < NEAR.machineGun) {
          push(calls, placeSound(listener, "mg-near", from.x, from.z))
        } else if (now - (lastFarBurst.get(shooter) ?? -Infinity) >= MG_FAR_INTERVAL) {
          lastFarBurst.set(shooter, now)
          push(calls, placeSound(listener, "mg-far", from.x, from.z))
        }
      } else {
        const side = sim.soldiers.side.value[shooter] === Side.French ? "fr" : "de"
        const range = distance < NEAR.rifle ? "near" : "far"
        push(calls, placeSound(listener, `rifle-${side}-${range}`, from.x, from.z))
      }
      if (crackPast(listener, from, to) && now - lastCrack >= CRACK_INTERVAL) {
        lastCrack = now
        // The round outruns the report: its crack comes first.
        push(calls, placeSound(listener, "crack", to.x, to.z))
      }
    }
  }

  function burstSounds(listener: Listener, calls: SoundCall[]): void {
    for (const event of sim.events) {
      if (event.type === "burst") {
        const [near, far] = BURST_CUES[event.shell]
        const limit = event.shell === Shell.Grenade ? NEAR.grenade : NEAR.shell
        const cue = hearingDistance(listener, event.at.x, event.at.z) < limit ? near : far
        push(calls, placeSound(listener, cue, event.at.x, event.at.z))
      }
    }
  }

  function batterySounds(listener: Listener, calls: SoundCall[]): void {
    const now = seconds(sim.tick)
    for (const shell of sim.artillery.shells) {
      if (heardShells.has(shell)) {
        continue
      }
      heardShells.add(shell)
      if (shell.shell === Shell.Grenade || now - lastBattery < BATTERY_INTERVAL) {
        continue
      }
      lastBattery = now
      const z = shell.side === Side.French ? -BATTERY_DISTANCE : mapDepth(sim.map) + BATTERY_DISTANCE
      const cue = shell.shell === Shell.HeavyHighExplosive ? "battery-heavy" : "battery-field"
      push(calls, placeSound(listener, cue, shell.x, z))
    }
  }

  function deathSounds(listener: Listener, calls: SoundCall[]): void {
    const now = seconds(sim.tick)
    const current = fallenIds(sim)
    if (current.length === fallen.size) {
      return
    }
    for (const id of current) {
      const x = sim.soldiers.position.x[id] ?? 0
      const z = sim.soldiers.position.z[id] ?? 0
      if (
        !fallen.has(id) &&
        Math.hypot(x - listener.x, z - listener.z) < DEATH_RANGE &&
        now - lastDeath >= DEATH_INTERVAL
      ) {
        lastDeath = now
        push(calls, placeSound(listener, "death", x, z))
      }
    }
    fallen = new Set(current)
  }

  function gasAlarm(listener: Listener, calls: SoundCall[]): void {
    if (sim.tick % MASK_CHECK_INTERVAL !== 0) {
      return
    }
    let masked = 0
    for (const id of soldierIds(sim)) {
      const near = Math.hypot(
        (sim.soldiers.position.x[id] ?? 0) - listener.x,
        (sim.soldiers.position.z[id] ?? 0) - listener.z
      )
      if (near < GAS_ALARM_RANGE && sim.soldiers.mask.state[id] !== MaskState.Off) {
        masked++
      }
    }
    const now = seconds(sim.tick)
    if (masked > 0 && masksNear === 0 && now - lastGasAlarm >= GAS_ALARM_REPEAT) {
      lastGasAlarm = now
      for (let stroke = 0; stroke < GONG_STROKES; stroke++) {
        push(calls, placeSound(listener, "gas-gong", listener.x, listener.z, stroke * GONG_SPACING))
      }
    }
    masksNear = masked
  }

  return {
    step(listener) {
      const calls: SoundCall[] = []
      shotSounds(listener, calls)
      burstSounds(listener, calls)
      batterySounds(listener, calls)
      deathSounds(listener, calls)
      gasAlarm(listener, calls)
      return calls
    },
    breathingInMask() {
      const id = soldier()
      return id !== null && sim.soldiers.mask.state[id] === MaskState.On && !fallen.has(id)
    }
  }
}

/** Whether a round passes close enough to the listener to be heard cracking by, from far enough to have gone supersonic. */
function crackPast(listener: Listener, from: WorldPoint, to: WorldPoint): boolean {
  return (
    Math.hypot(to.x - listener.x, to.z - listener.z) < CRACK_RADIUS &&
    Math.hypot(from.x - listener.x, from.z - listener.z) > CRACK_MIN_RANGE
  )
}

function push(calls: SoundCall[], call: SoundCall | null): void {
  if (call) {
    calls.push(call)
  }
}
