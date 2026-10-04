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
  "bullet-impact",
  "field-near",
  "field-far",
  "heavy-near",
  "heavy-far",
  "incoming-heavy",
  "debris",
  "shrapnel-near",
  "shrapnel-far",
  "grenade-near",
  "grenade-far",
  "throw",
  "gas-shell",
  "battery-field",
  "battery-heavy",
  "death",
  "gas-gong",
  "mask-breath",
  "ear-ring"
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
  "bullet-impact": { volume: 0.5, reference: 8 },
  "field-near": { volume: 1, reference: 40 },
  "field-far": { volume: 0.9, reference: 150 },
  "heavy-near": { volume: 1, reference: 60 },
  "heavy-far": { volume: 1, reference: 200 },
  "incoming-heavy": { volume: 0.8, reference: 40 },
  debris: { volume: 0.6, reference: 15 },
  "shrapnel-near": { volume: 0.9, reference: 40 },
  "shrapnel-far": { volume: 0.8, reference: 150 },
  "grenade-near": { volume: 0.8, reference: 20 },
  "grenade-far": { volume: 0.7, reference: 60 },
  throw: { volume: 0.35, reference: 8 },
  "gas-shell": { volume: 0.6, reference: 20 },
  "battery-field": { volume: 1, reference: 400 },
  "battery-heavy": { volume: 1, reference: 500 },
  death: { volume: 0.6, reference: 15 },
  "gas-gong": { volume: 0.5, reference: 30 },
  "mask-breath": { volume: 0.3, reference: 1 },
  "ear-ring": { volume: 0.35, reference: 1 }
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
/** Rounds striking the ground this close to the listener are heard thudding in, at most one this often (seconds). */
const IMPACT_RADIUS = 15
const IMPACT_INTERVAL = 0.08
/**
 * Heavy howitzer shells were slow enough to be heard coming. Their rush starts this many seconds before landing (the
 * length of the incoming-heavy recordings) for shells landing within INCOMING_RANGE. Field shells outran their sound.
 */
export const INCOMING_LEAD = 2
const INCOMING_RANGE = 150
/** Earth rains down after a burst this close, starting this many seconds after it. */
const DEBRIS_RANGE = 35
const DEBRIS_DELAY = 0.4
/** Grenades are heard leaving the thrower's hand within this many metres. */
const THROW_RANGE = 40
/** A burst this close to the controlled soldier leaves his ears ringing and the battle muffled. */
const SHOCK_RANGE = 15
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
  /**
   * How hard a shell bursting close to the controlled soldier has hit his ears since the last call, from 0 (nothing)
   * to 1 (on top of him), for muffling the battle while they ring.
   */
  takeShock(): number
}

export interface BattleSoundOptions {
  /** The soldier the player controls, or null when there's none. */
  readonly soldier: () => EntityId | null
}

/**
 * Turns the simulation's events and changes into sounds: every shot by weapon and side (machine guns round by round up
 * close, in whole bursts from afar), rounds cracking past and striking the ground nearby, grenades thrown, every shell
 * and grenade burst by type with the rush of heavy shells coming in and earth raining down after near ones, the
 * batteries firing far behind the lines, men falling nearby, the ringing of a near miss, and the shell-case gong when
 * men nearby start pulling on gas masks.
 */
export function createBattleSoundModel(sim: Simulation, { soldier }: BattleSoundOptions): BattleSoundModel {
  const heardShells = new WeakSet<ShellInFlight>(sim.artillery.shells)
  const rushing = new WeakSet<ShellInFlight>()
  let fallen = new Set(fallenIds(sim))
  const lastFarBurst = new Map<EntityId, number>()
  let lastCrack = -Infinity
  let lastDeath = -Infinity
  let lastBattery = -Infinity
  let lastGasAlarm = -Infinity
  let masksNear = 0
  let lastImpact = -Infinity
  let shock = 0
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
      const struck = Math.hypot(to.x - listener.x, to.z - listener.z) < IMPACT_RADIUS
      if (!event.hit && struck && now - lastImpact >= IMPACT_INTERVAL) {
        lastImpact = now
        push(calls, placeSound(listener, "bullet-impact", to.x, to.z))
      }
    }
  }

  function burstSounds(listener: Listener, calls: SoundCall[]): void {
    const me = soldier()
    for (const event of sim.events) {
      if (event.type !== "burst") {
        continue
      }
      const { x, z } = event.at
      const [near, far] = BURST_CUES[event.shell]
      const limit = event.shell === Shell.Grenade ? NEAR.grenade : NEAR.shell
      push(calls, placeSound(listener, hearingDistance(listener, x, z) < limit ? near : far, x, z))
      if (event.shell === Shell.FieldGas) {
        continue
      }
      if (event.crater && Math.hypot(x - listener.x, z - listener.z) < DEBRIS_RANGE) {
        push(calls, placeSound(listener, "debris", x, z, DEBRIS_DELAY))
      }
      if (me !== null && !fallen.has(me)) {
        const close = Math.hypot(x - (sim.soldiers.position.x[me] ?? 0), z - (sim.soldiers.position.z[me] ?? 0))
        if (close < SHOCK_RANGE) {
          shock = Math.max(shock, 1 - close / SHOCK_RANGE)
          push(calls, { cue: "ear-ring", volume: LEVELS["ear-ring"].volume * shock, pan: 0, delay: 0 })
        }
      }
    }
  }

  function incomingSounds(listener: Listener, calls: SoundCall[]): void {
    for (const shell of sim.artillery.shells) {
      if (shell.shell !== Shell.HeavyHighExplosive || rushing.has(shell)) {
        continue
      }
      const remaining = seconds(shell.landsAtTick - sim.tick)
      if (remaining <= INCOMING_LEAD && Math.hypot(shell.x - listener.x, shell.z - listener.z) < INCOMING_RANGE) {
        rushing.add(shell)
        // Ends as the burst is heard: both travel to the listener from where the shell lands.
        push(calls, placeSound(listener, "incoming-heavy", shell.x, shell.z, Math.max(0, remaining - INCOMING_LEAD)))
      }
    }
  }

  function throwSounds(listener: Listener, calls: SoundCall[]): void {
    for (const event of sim.events) {
      if (event.type === "throw") {
        const x = sim.soldiers.position.x[event.soldier] ?? 0
        const z = sim.soldiers.position.z[event.soldier] ?? 0
        if (Math.hypot(x - listener.x, z - listener.z) < THROW_RANGE) {
          push(calls, placeSound(listener, "throw", x, z))
        }
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
      throwSounds(listener, calls)
      burstSounds(listener, calls)
      incomingSounds(listener, calls)
      batterySounds(listener, calls)
      deathSounds(listener, calls)
      gasAlarm(listener, calls)
      return calls
    },
    takeShock() {
      const taken = shock
      shock = 0
      return taken
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
