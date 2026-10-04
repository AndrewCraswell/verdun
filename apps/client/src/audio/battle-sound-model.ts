import { heightAt, mapDepth } from "@verdun/map"
import {
  type EntityId,
  eyeAt,
  fallenIds,
  frontLineZ,
  isInTrench,
  isSheltering,
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
  "bolt-fr",
  "bolt-de",
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
  "pain",
  "charge",
  "gas-gong",
  "mask-breath",
  "ear-ring",
  "thunder",
  "rain",
  "wind",
  "front-roar"
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

/**
 * One sound to play: which cue, how loud (0 to 1), where in the stereo field (-1 to 1), after how many seconds, and
 * the low-pass cutoff (hertz) that air and anything in the way leave it.
 */
export interface SoundCall {
  readonly cue: SoundCue
  readonly volume: number
  readonly pan: number
  readonly delay: number
  readonly cutoff: number
}

/** How the listener's surroundings colour what they hear, each from 0 (not there) to 1: see mixer.ts. */
export interface ListenerSpace {
  readonly trench: number
  readonly dugout: number
  readonly ruins: number
}

/** Metres per second: distant bursts and guns are heard after they are seen. */
export const SPEED_OF_SOUND = 343
/** How much of the camera's height counts toward distance; the camera's ears are not really up there. */
const HEIGHT_WEIGHT = 0.5
/** Sounds quieter than this aren't worth a voice. */
const INAUDIBLE = 0.02
/** Pan never goes fully to one side, which sounds like one ear blocked. */
const PAN_WIDTH = 0.8
/** Unfiltered, in hertz. Air takes the highs off with distance: AIR_CUTOFF / (1 + distance / AIR_DISTANCE). */
export const FULL_BAND = 20000
const AIR_CUTOFF = 18000
const AIR_DISTANCE = 150
const LOWEST_CUTOFF = 400
/**
 * Sounds with the ground in the way (behind a rise, beyond the trench wall when the listener is down in the trench)
 * lose their highs and some level. Checked only when the camera is close, within OCCLUSION_RANGE, and for at most
 * OCCLUSION_CHECKS sounds a step: each is a ray through the terrain.
 */
const OCCLUDED_CUTOFF = 1400
const OCCLUDED_GAIN = 0.65
const OCCLUSION_HEIGHT = 140
const OCCLUSION_RANGE = 400
/** Closer than this, sound bends round whatever is in the way. */
const OCCLUSION_MIN = 25
/** Where a burst's sound comes from, metres above the ground: its blast and column of earth rise above the trench. */
const BURST_HEIGHT = 4
/** An incoming shell is heard up in the air. */
const INCOMING_HEIGHT = 15
const OCCLUSION_CHECKS = 16
/** Spaces colour the sound fully with the camera this low, and not at all from SPACE_HEIGHT up. */
const SPACE_FULL = 40
const SPACE_HEIGHT = 140
/** The listener counts as in the controlled soldier's dugout within this many metres of him. */
const DUGOUT_RANGE = 15

/** Loudness at the reference distance, and the distance inside which it doesn't get any louder. */
const LEVELS: Readonly<Record<SoundCue, { readonly volume: number; readonly reference: number }>> = {
  "rifle-fr-near": { volume: 0.7, reference: 20 },
  "rifle-fr-far": { volume: 0.6, reference: 60 },
  "rifle-de-near": { volume: 0.7, reference: 20 },
  "rifle-de-far": { volume: 0.6, reference: 60 },
  "bolt-fr": { volume: 0.4, reference: 6 },
  "bolt-de": { volume: 0.4, reference: 6 },
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
  pain: { volume: 0.45, reference: 12 },
  charge: { volume: 0.9, reference: 40 },
  "gas-gong": { volume: 0.5, reference: 30 },
  "mask-breath": { volume: 0.3, reference: 1 },
  "ear-ring": { volume: 0.35, reference: 1 },
  thunder: { volume: 1, reference: 1200 },
  // Beds play everywhere at a level atmosphere-model.ts sets; they are never placed.
  rain: { volume: 1, reference: 1 },
  wind: { volume: 1, reference: 1 },
  "front-roar": { volume: 1, reference: 1 }
}

/** Beyond these distances a sound switches to its far recording, made from further off. */
const NEAR = { rifle: 60, machineGun: 80, shell: 150, grenade: 60 } as const
/** Far machine guns play a whole recorded burst at most this often, in seconds, while they keep firing. */
const MG_FAR_INTERVAL = 1.5
/** Rounds landing this close to the listener crack past, if fired from further than CRACK_MIN_RANGE. */
const CRACK_RADIUS = 12
const CRACK_MIN_RANGE = 40
/** Riflemen this close are heard working the bolt this many seconds after each shot. */
const BOLT_RANGE = 30
const BOLT_DELAY = 0.7
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
/** Men are heard crying out when hit within this many metres, at most one this often (seconds). */
const PAIN_RANGE = 60
const PAIN_INTERVAL = 0.6
/** Wounds are looked for this often, in steps. */
const WOUND_CHECK_INTERVAL = 4
/**
 * A squad going over the top (its order turning to an advance, a creeping barrage or a raid) is heard cheering
 * within CHARGE_RANGE metres, at most once in CHARGE_REPEAT seconds for each side.
 */
const CHARGE_RANGE = 250
const CHARGE_REPEAT = 5
const ATTACKS: ReadonlySet<string> = new Set(["advance", "creep", "raid"])
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

/** Low-pass cutoff the air leaves a sound heard from `distance` metres. */
export function airCutoff(distance: number): number {
  return Math.max(LOWEST_CUTOFF, Math.min(FULL_BAND, AIR_CUTOFF / (1 + distance / AIR_DISTANCE)))
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
  return {
    cue,
    volume,
    pan: Math.max(-1, Math.min(1, across)) * PAN_WIDTH,
    delay: after + distance / SPEED_OF_SOUND,
    cutoff: airCutoff(distance)
  }
}

/**
 * The listener's surroundings: down in a trench where the camera looks, in the controlled soldier's dugout when he is
 * sheltering close by, among ruins as dense as `ruins` says. All fade out as the camera climbs: from up high the
 * battle is heard as if from the open.
 */
export function listenerSpace(
  sim: Simulation,
  listener: Listener,
  soldier: EntityId | null,
  ruins: (x: number, z: number) => number
): ListenerSpace {
  const close = Math.max(0, Math.min(1, (SPACE_HEIGHT - listener.height) / (SPACE_HEIGHT - SPACE_FULL)))
  if (close === 0) {
    return { trench: 0, dugout: 0, ruins: 0 }
  }
  const x = sim.soldiers.position.x[soldier ?? -1] ?? Infinity
  const z = sim.soldiers.position.z[soldier ?? -1] ?? Infinity
  const sheltering = soldier !== null && isSheltering(sim, soldier)
  if (sheltering && Math.hypot(x - listener.x, z - listener.z) < DUGOUT_RANGE) {
    return { trench: 0, dugout: close, ruins: 0 }
  }
  return {
    trench: isInTrench(sim.map, listener.x, listener.z) ? close : 0,
    dugout: 0,
    ruins: ruins(listener.x, listener.z) * close
  }
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
 * close, in whole bursts from afar, and riflemen nearby working the bolt), rounds cracking past and striking the ground nearby, grenades thrown, every shell
 * and grenade burst by type with the rush of heavy shells coming in and earth raining down after near ones, the
 * batteries firing far behind the lines, men hit or falling nearby, squads going over the top and counter-attacks
 * coming in, the ringing of a near miss, and the shell-case gong when men nearby start pulling on gas masks.
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
  let lastPain = -Infinity
  const health = Float32Array.from(sim.soldiers.health.value)
  const orders = new Map(sim.squads.map((squad) => [squad.id, squad.order.kind]))
  const lastCharge = new Map<Side, number>()
  const seconds = (ticks: number) => ticks / TICK_RATE
  let occlusionChecks = 0

  /**
   * A sound placed for the listener, muffled when the ground lies between them. `above` is how high above the ground
   * the sound comes from; a man's eye height unless given.
   */
  function place(listener: Listener, cue: SoundCue, x: number, z: number, after = 0, above?: number): SoundCall | null {
    const call = placeSound(listener, cue, x, z, after)
    const sight = sim.lineOfSight
    const range = Math.hypot(x - listener.x, z - listener.z)
    if (
      !call ||
      !sight ||
      listener.height > OCCLUSION_HEIGHT ||
      occlusionChecks >= OCCLUSION_CHECKS ||
      range < OCCLUSION_MIN ||
      range > OCCLUSION_RANGE
    ) {
      return call
    }
    occlusionChecks++
    const source = above === undefined ? eyeAt(sim.map, x, z) : { x, y: heightAt(sim.map, x, z) + above, z }
    if (sight.isClear(eyeAt(sim.map, listener.x, listener.z), source)) {
      return call
    }
    return { ...call, volume: call.volume * OCCLUDED_GAIN, cutoff: Math.min(call.cutoff, OCCLUDED_CUTOFF) }
  }

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
          push(calls, place(listener, "mg-near", from.x, from.z))
        } else if (now - (lastFarBurst.get(shooter) ?? -Infinity) >= MG_FAR_INTERVAL) {
          lastFarBurst.set(shooter, now)
          push(calls, place(listener, "mg-far", from.x, from.z))
        }
      } else {
        const side = sim.soldiers.side.value[shooter] === Side.French ? "fr" : "de"
        const range = distance < NEAR.rifle ? "near" : "far"
        push(calls, place(listener, `rifle-${side}-${range}`, from.x, from.z))
        if (distance < BOLT_RANGE) {
          push(calls, place(listener, `bolt-${side}`, from.x, from.z, BOLT_DELAY))
        }
      }
      if (crackPast(listener, from, to) && now - lastCrack >= CRACK_INTERVAL) {
        lastCrack = now
        // The round outruns the report: its crack comes first.
        push(calls, place(listener, "crack", to.x, to.z))
      }
      const struck = Math.hypot(to.x - listener.x, to.z - listener.z) < IMPACT_RADIUS
      if (!event.hit && struck && now - lastImpact >= IMPACT_INTERVAL) {
        lastImpact = now
        push(calls, place(listener, "bullet-impact", to.x, to.z))
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
      push(calls, place(listener, hearingDistance(listener, x, z) < limit ? near : far, x, z, 0, BURST_HEIGHT))
      if (event.shell === Shell.FieldGas) {
        continue
      }
      if (event.crater && Math.hypot(x - listener.x, z - listener.z) < DEBRIS_RANGE) {
        push(calls, place(listener, "debris", x, z, DEBRIS_DELAY))
      }
      if (me !== null && !fallen.has(me)) {
        const close = Math.hypot(x - (sim.soldiers.position.x[me] ?? 0), z - (sim.soldiers.position.z[me] ?? 0))
        if (close < SHOCK_RANGE) {
          shock = Math.max(shock, 1 - close / SHOCK_RANGE)
          push(calls, {
            cue: "ear-ring",
            volume: LEVELS["ear-ring"].volume * shock,
            pan: 0,
            delay: 0,
            cutoff: FULL_BAND
          })
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
        const after = Math.max(0, remaining - INCOMING_LEAD)
        push(calls, place(listener, "incoming-heavy", shell.x, shell.z, after, INCOMING_HEIGHT))
      }
    }
  }

  function throwSounds(listener: Listener, calls: SoundCall[]): void {
    for (const event of sim.events) {
      if (event.type === "throw") {
        const x = sim.soldiers.position.x[event.soldier] ?? 0
        const z = sim.soldiers.position.z[event.soldier] ?? 0
        if (Math.hypot(x - listener.x, z - listener.z) < THROW_RANGE) {
          push(calls, place(listener, "throw", x, z))
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
      push(calls, place(listener, cue, shell.x, z))
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
        push(calls, place(listener, "death", x, z))
      }
    }
    fallen = new Set(current)
  }

  function woundSounds(listener: Listener, calls: SoundCall[]): void {
    if (sim.tick % WOUND_CHECK_INTERVAL !== 0) {
      return
    }
    const now = seconds(sim.tick)
    const current = sim.soldiers.health.value
    for (const id of soldierIds(sim)) {
      const before = health[id] ?? 0
      const after = current[id] ?? 0
      health[id] = after
      const x = sim.soldiers.position.x[id] ?? 0
      const z = sim.soldiers.position.z[id] ?? 0
      if (after < before && after > 0 && now - lastPain >= PAIN_INTERVAL) {
        if (Math.hypot(x - listener.x, z - listener.z) < PAIN_RANGE) {
          lastPain = now
          push(calls, place(listener, "pain", x, z))
        }
      }
    }
  }

  function chargeSounds(listener: Listener, calls: SoundCall[]): void {
    const now = seconds(sim.tick)
    const cheer = (side: Side, x: number, z: number) => {
      if (now - (lastCharge.get(side) ?? -Infinity) >= CHARGE_REPEAT) {
        lastCharge.set(side, now)
        push(calls, place(listener, "charge", x, z))
      }
    }
    for (const squad of sim.squads) {
      const before = orders.get(squad.id)
      const after = squad.order.kind
      orders.set(squad.id, after)
      if (before === after || !ATTACKS.has(after) || squad.leader < 0) {
        continue
      }
      const x = sim.soldiers.position.x[squad.leader] ?? 0
      const z = sim.soldiers.position.z[squad.leader] ?? 0
      if (Math.hypot(x - listener.x, z - listener.z) < CHARGE_RANGE) {
        cheer(squad.side, x, z)
      }
    }
    for (const event of sim.events) {
      if (event.type === "counter-attack") {
        const z = frontLineZ(sim.map.trenches, event.side)
        if (z !== null) {
          cheer(event.side, listener.x, z)
        }
      }
    }
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
        push(calls, place(listener, "gas-gong", listener.x, listener.z, stroke * GONG_SPACING))
      }
    }
    masksNear = masked
  }

  return {
    step(listener) {
      occlusionChecks = 0
      const calls: SoundCall[] = []
      shotSounds(listener, calls)
      throwSounds(listener, calls)
      burstSounds(listener, calls)
      incomingSounds(listener, calls)
      batterySounds(listener, calls)
      deathSounds(listener, calls)
      woundSounds(listener, calls)
      chargeSounds(listener, calls)
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
