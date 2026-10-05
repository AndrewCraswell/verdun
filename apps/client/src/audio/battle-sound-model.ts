import { heightAt, mapDepth } from "@verdun/map"
import {
  BROKEN_MORALE,
  type EntityId,
  eyeAt,
  fallenIds,
  frontLineZ,
  isInTrench,
  isSheltering,
  MaskState,
  PINNED,
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
  "bullet-mud",
  "bullet-ricochet",
  "bullet-whizz",
  "bullet-stone",
  "bullet-wire",
  "bullet-parapet",
  "bullet-snow",
  "bullet-water",
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
  "cheer",
  "gas-gong",
  "mask-breath",
  "ear-ring",
  "thunder",
  "rain",
  "wind",
  "front-roar",
  "fire",
  "rain-trench",
  "wire-wind",
  "pinned-breath",
  "gear",
  "night-warm",
  "night-cold",
  "crow",
  "flare",
  "step-earth",
  "step-snow",
  "step-stone",
  "voice-charge-fr",
  "voice-charge-de",
  "voice-cover-fr",
  "voice-cover-de",
  "voice-gas-fr",
  "voice-gas-de",
  "voice-grenade-fr",
  "voice-grenade-de",
  "voice-hit-fr",
  "voice-hit-de",
  "voice-pinned-fr",
  "voice-pinned-de",
  "voice-follow-fr",
  "voice-follow-de",
  "voice-hold-fr",
  "voice-hold-de",
  "voice-taken-fr",
  "voice-taken-de",
  "voice-surrender-fr",
  "voice-surrender-de",
  "voice-broken-fr",
  "voice-broken-de",
  "whistle"
] as const
export type SoundCue = (typeof SOUND_CUES)[number]
/** What a soldier shouts: each a cue per side's language, from scripts/voice-lines.json. */
type Shout =
  | "charge"
  | "cover"
  | "gas"
  | "grenade"
  | "hit"
  | "pinned"
  | "follow"
  | "hold"
  | "taken"
  | "surrender"
  | "broken"

/** A shout as each side gives it: in French or German. */
function shoutCue(shout: Shout, side: Side): SoundCue {
  return `voice-${shout}-${side === Side.French ? "fr" : "de"}`
}

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
  /** The soldier shouting, for a shout (voice-*): the captions name him. */
  readonly speaker?: EntityId
  /** For a shout as played, the line it says: its id in scripts/voice-lines.json, for the captions. */
  readonly line?: string
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
  "bullet-mud": { volume: 0.5, reference: 8 },
  "bullet-ricochet": { volume: 0.5, reference: 12 },
  "bullet-whizz": { volume: 0.5, reference: 4 },
  "bullet-stone": { volume: 0.5, reference: 8 },
  "bullet-wire": { volume: 0.45, reference: 10 },
  "bullet-parapet": { volume: 0.5, reference: 8 },
  "bullet-snow": { volume: 0.45, reference: 8 },
  "bullet-water": { volume: 0.5, reference: 8 },
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
  cheer: { volume: 0.8, reference: 40 },
  "gas-gong": { volume: 0.5, reference: 30 },
  "mask-breath": { volume: 0.3, reference: 1 },
  "ear-ring": { volume: 0.35, reference: 1 },
  thunder: { volume: 1, reference: 1200 },
  // Beds play everywhere at a level atmosphere-model.ts sets; they are never placed.
  rain: { volume: 1, reference: 1 },
  wind: { volume: 1, reference: 1 },
  "front-roar": { volume: 1, reference: 1 },
  fire: { volume: 1, reference: 1 },
  "rain-trench": { volume: 1, reference: 1 },
  "wire-wind": { volume: 1, reference: 1 },
  "pinned-breath": { volume: 1, reference: 1 },
  gear: { volume: 0.22, reference: 4 },
  "night-warm": { volume: 1, reference: 1 },
  "night-cold": { volume: 1, reference: 1 },
  crow: { volume: 0.18, reference: 15 },
  flare: { volume: 0.5, reference: 30 },
  "step-earth": { volume: 0.3, reference: 4 },
  "step-snow": { volume: 0.3, reference: 4 },
  "step-stone": { volume: 0.3, reference: 4 },
  // Shouts sit under the guns and shells nearby but over a wounded man's groan: heard, without drowning the battle.
  "voice-charge-fr": { volume: 0.45, reference: 15 },
  "voice-charge-de": { volume: 0.45, reference: 15 },
  "voice-cover-fr": { volume: 0.45, reference: 15 },
  "voice-cover-de": { volume: 0.45, reference: 15 },
  "voice-gas-fr": { volume: 0.45, reference: 15 },
  "voice-gas-de": { volume: 0.45, reference: 15 },
  "voice-grenade-fr": { volume: 0.45, reference: 15 },
  "voice-grenade-de": { volume: 0.45, reference: 15 },
  "voice-hit-fr": { volume: 0.45, reference: 15 },
  "voice-hit-de": { volume: 0.45, reference: 15 },
  "voice-pinned-fr": { volume: 0.45, reference: 15 },
  "voice-pinned-de": { volume: 0.45, reference: 15 },
  "voice-follow-fr": { volume: 0.45, reference: 15 },
  "voice-follow-de": { volume: 0.45, reference: 15 },
  "voice-hold-fr": { volume: 0.45, reference: 15 },
  "voice-hold-de": { volume: 0.45, reference: 15 },
  "voice-taken-fr": { volume: 0.45, reference: 15 },
  "voice-taken-de": { volume: 0.45, reference: 15 },
  "voice-surrender-fr": { volume: 0.4, reference: 12 },
  "voice-surrender-de": { volume: 0.4, reference: 12 },
  "voice-broken-fr": { volume: 0.3, reference: 10 },
  "voice-broken-de": { volume: 0.3, reference: 10 },
  // An officer's whistle carries over the guns.
  whistle: { volume: 0.6, reference: 30 }
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
/**
 * Rounds striking the ground this close to the listener are heard thudding in, at most one this often (seconds), as
 * the dirt they kick up is seen: on the gunfire effect's strike, not the shot, since the round takes its time to fly.
 */
const IMPACT_RADIUS = 15
const IMPACT_INTERVAL = 0.08
/** What a round struck, as the gunfire effect reports it (effects/tracers.ts). */
export type StrikeSurface = "ground" | "wire" | "parapet"
/** One round in RICOCHET_EVERY striking open ground glances off it and whines away. */
const RICOCHET_EVERY = 4
/** Ground this wet (weather wetness, 0 to 1) and not frozen takes a round with a muddy thump; a trench floor floods. */
const MUDDY = 0.5
const FROZEN = -2
/** Snow lying this deep, in millimetres of water, takes a round with a soft crump. */
const SNOWY = 3
/** Ruins this dense where a round lands (0 to 1) have it strike stone and brick. */
const STONY = 0.4
/** A rifle or machine-gun round's speed, in m/s, as the gunfire effect flies it: cracks and whizzes wait for it. */
const BULLET_SPEED = 750
/**
 * Rounds passing within WHIZZ_RADIUS of the listener, from further off than CRACK_MIN_RANGE, zip by, at most one this
 * often (seconds). The gunfire effect
 * flies misses on past their mark; this many metres beyond it are listened along.
 */
const WHIZZ_RADIUS = 4
const WHIZZ_INTERVAL = 0.12
const WHIZZ_BEYOND = 60
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
// Not raids: raiders crawled out to the enemy's wire in silence.
const ATTACKS: ReadonlySet<string> = new Set(["advance", "creep"])
/** The gas alarm sounds when men within this range of the listener start masking, at most once in this many seconds. */
const GAS_ALARM_RANGE = 150
const GAS_ALARM_REPEAT = 30
/** The alarm: strokes on a shell case, this many, this far apart in seconds. */
const GONG_STROKES = 6
const GONG_SPACING = 0.45
/** Masks near the listener are counted this often, in steps. */
const MASK_CHECK_INTERVAL = 10
/**
 * Men shout within VOICE_RANGE of the listener: one at a time, at most one shout every VOICE_INTERVAL seconds, and
 * each line at most once in VOICE_REPEAT seconds, so a battle's shouts come through one by one rather than in a babble.
 */
const VOICE_RANGE = 90
const VOICE_INTERVAL = 1.5
const VOICE_REPEAT = 6
/** A squad's leader cries out to go, and the men's cheer follows this many seconds later. */
const CHARGE_CRY = 0.8
/** Men this close to where a shell lands shout to take cover: as a heavy shell is heard coming, after a field shell. */
const COVER_RANGE = 40
const COVER_DELAY = 0.4
/** Every HIT_EVERY-th man heard crying out when hit then calls out that he's hit, HIT_DELAY seconds after. */
const HIT_EVERY = 2
const HIT_DELAY = 0.9
/** A squad's leader shouts these orders to his men as he gives them: to follow him, or to hold where they are. */
const ORDER_SHOUTS: Readonly<Partial<Record<string, Shout>>> = { follow: "follow", hold: "hold" }
/**
 * At zero hour, as squads are sent after a creeping barrage, their officers blow their whistles: up to WHISTLES of
 * them, WHISTLE_SPACING seconds apart, and the cry to go and the cheer follow WHISTLE_LEAD seconds later.
 */
const WHISTLES = 3
const WHISTLE_SPACING = 0.35
const WHISTLE_LEAD = 1.2
/** The men taking an objective cheer it within CHARGE_RANGE, this many seconds after one of them shouts it. */
const CHEER_DELAY = 1
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
  /**
   * The sound of a round striking `on` at (x, z), heard from `listener`, or null when it lands too far off or too soon
   * after the last: a thud into earth, mud, snow or water, a crack off the ruins' stone, a ping off the wire, a thump
   * into a parapet, and now and then a ricochet. `time` is in seconds on the clock the strikes are reported on.
   */
  strike(listener: Listener, x: number, z: number, time: number, on?: StrikeSurface): SoundCall | null
  /** Whether the soldier the player controls has his mask on, so his breathing is heard through it. */
  breathingInMask(): boolean
  /** Whether the soldier the player controls is pinned down, breathing short and hard (and not in his mask). */
  breathingPinned(): boolean
  /**
   * How hard a shell bursting close to the controlled soldier has hit his ears since the last call, from 0 (nothing)
   * to 1 (on top of him), for muffling the battle while they ring.
   */
  takeShock(): number
}

export interface BattleSoundOptions {
  /** The soldier the player controls, or null when there's none. */
  readonly soldier: () => EntityId | null
  /** How dense the ruins are at a point, from 0 to 1, where rounds strike stone; open ground everywhere unless given. */
  readonly ruins?: (x: number, z: number) => number
}

/**
 * Turns the simulation's events and changes into sounds: every shot by weapon and side (machine guns round by round up
 * close, in whole bursts from afar, and riflemen nearby working the bolt), rounds cracking past, grenades thrown, every shell
 * and grenade burst by type with the rush of heavy shells coming in and earth raining down after near ones, the
 * batteries firing far behind the lines, men hit or falling nearby, squads going over the top and counter-attacks
 * coming in, the ringing of a near miss, and the shell-case gong when men nearby start pulling on gas masks. Men
 * nearby shout in their own language: the charge, the gas alarm, to take cover from shells, a grenade thrown, that
 * they're hit, as they're pinned down, and as they break; leaders shout their orders and blow their whistles at
 * zero hour; men give themselves up, and a side cheers as it takes ground, one man shouting it and the rest roaring
 * after him.
 */
export function createBattleSoundModel(sim: Simulation, { soldier, ruins }: BattleSoundOptions): BattleSoundModel {
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
  let lastWhizz = -Infinity
  let strikes = 0
  const pools = sim.map.scenery.filter(({ kind }) => kind === "pool")
  let shock = 0
  let lastPain = -Infinity
  const health = Float32Array.from(sim.soldiers.health.value)
  const orders = new Map(sim.squads.map((squad) => [squad.id, squad.order.kind]))
  const lastCharge = new Map<Side, number>()
  const suppression = Float32Array.from(sim.soldiers.suppression.value)
  const morale = Float32Array.from(sim.soldiers.morale.value)
  let lastShout = -Infinity
  const lastLine = new Map<SoundCue, number>()
  let cries = 0
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

  /**
   * Soldier `id` shouting, if he's near enough to hear and no one has just shouted the same, or anything at all.
   * Whether he did.
   */
  function shout(listener: Listener, calls: SoundCall[], kind: Shout, id: EntityId, after = 0): boolean {
    const now = seconds(sim.tick)
    const x = sim.soldiers.position.x[id] ?? 0
    const z = sim.soldiers.position.z[id] ?? 0
    const cue = shoutCue(kind, sim.soldiers.side.value[id] === Side.French ? Side.French : Side.German)
    if (
      now - lastShout < VOICE_INTERVAL ||
      now - (lastLine.get(cue) ?? -Infinity) < VOICE_REPEAT ||
      fallen.has(id) ||
      Math.hypot(x - listener.x, z - listener.z) >= VOICE_RANGE
    ) {
      return false
    }
    const call = place(listener, cue, x, z, after)
    if (!call) {
      return false
    }
    lastShout = now
    lastLine.set(cue, now)
    calls.push({ ...call, speaker: id })
    return true
  }

  /** The man standing nearest (x, z) within `range` metres, of `side` if given, or null when none is. */
  function nearest(x: number, z: number, range: number, side?: Side): EntityId | null {
    let found: EntityId | null = null
    let best = range
    for (const id of soldierIds(sim)) {
      const distance = Math.hypot((sim.soldiers.position.x[id] ?? 0) - x, (sim.soldiers.position.z[id] ?? 0) - z)
      if (distance < best && !fallen.has(id) && (side === undefined || sim.soldiers.side.value[id] === side)) {
        best = distance
        found = id
      }
    }
    return found
  }

  /** Whether a shout from about (x, z) could be heard now: checked before looking for who would give it. */
  function shoutable(listener: Listener, x: number, z: number, reach: number): boolean {
    return (
      seconds(sim.tick) - lastShout >= VOICE_INTERVAL &&
      Math.hypot(x - listener.x, z - listener.z) < VOICE_RANGE + reach
    )
  }

  /** The man nearest a shell landing shouts to take cover. */
  function takeCover(listener: Listener, calls: SoundCall[], x: number, z: number, after: number): void {
    const id = shoutable(listener, x, z, COVER_RANGE) ? nearest(x, z, COVER_RANGE) : null
    if (id !== null) {
      shout(listener, calls, "cover", id, after)
    }
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
      // The round outruns the report: its crack comes first, as it arrives.
      const flight = Math.hypot(to.x - from.x, to.z - from.z) / BULLET_SPEED
      if (crackPast(listener, from, to) && now - lastCrack >= CRACK_INTERVAL) {
        lastCrack = now
        push(calls, place(listener, "crack", to.x, to.z, flight))
      }
      const pass = event.hit ? null : closestPass(listener, from, to)
      if (pass && pass.miss < WHIZZ_RADIUS && pass.along > CRACK_MIN_RANGE && now - lastWhizz >= WHIZZ_INTERVAL) {
        lastWhizz = now
        push(calls, place(listener, "bullet-whizz", pass.x, pass.z, pass.along / BULLET_SPEED))
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
      if (event.shell !== Shell.Grenade) {
        takeCover(listener, calls, x, z, COVER_DELAY)
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
        takeCover(listener, calls, shell.x, shell.z, after)
      }
    }
  }

  function flareSounds(listener: Listener, calls: SoundCall[]): void {
    for (const event of sim.events) {
      if (event.type === "flare") {
        push(calls, place(listener, "flare", event.x, event.z))
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
          shout(listener, calls, "grenade", event.soldier)
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
          cries++
          if (cries % HIT_EVERY === 0) {
            shout(listener, calls, "hit", id, HIT_DELAY)
          }
        }
      }
      const wasPinned = (suppression[id] ?? 0) >= PINNED
      const pressed = sim.soldiers.suppression.value[id] ?? 0
      suppression[id] = pressed
      if (!wasPinned && pressed >= PINNED && after > 0) {
        shout(listener, calls, "pinned", id)
      }
      const wasBroken = (morale[id] ?? 1) < BROKEN_MORALE
      const spirit = sim.soldiers.morale.value[id] ?? 1
      morale[id] = spirit
      if (!wasBroken && spirit < BROKEN_MORALE && after > 0) {
        shout(listener, calls, "broken", id)
      }
    }
  }

  function chargeSounds(listener: Listener, calls: SoundCall[]): void {
    const now = seconds(sim.tick)
    /**
     * The cheer of men going over the top, after the cry to go from `leader`, or else the man nearest; both `lead`
     * seconds late, after the whistles.
     */
    const cheer = (side: Side, x: number, z: number, leader: EntityId | null, lead = 0) => {
      if (now - (lastCharge.get(side) ?? -Infinity) >= CHARGE_REPEAT) {
        lastCharge.set(side, now)
        const crier = leader ?? (shoutable(listener, x, z, COVER_RANGE) ? nearest(x, z, COVER_RANGE, side) : null)
        const cried = crier !== null && shout(listener, calls, "charge", crier, lead)
        push(calls, place(listener, "charge", x, z, lead + (cried ? CHARGE_CRY : 0)))
      }
    }
    let whistles = 0
    for (const squad of sim.squads) {
      const before = orders.get(squad.id)
      const after = squad.order.kind
      orders.set(squad.id, after)
      if (before === after || squad.leader < 0) {
        continue
      }
      const order = ORDER_SHOUTS[after]
      if (order) {
        shout(listener, calls, order, squad.leader)
        continue
      }
      const x = sim.soldiers.position.x[squad.leader] ?? 0
      const z = sim.soldiers.position.z[squad.leader] ?? 0
      if (!ATTACKS.has(after) || Math.hypot(x - listener.x, z - listener.z) >= CHARGE_RANGE) {
        continue
      }
      let lead = 0
      if (after === "creep" && whistles < WHISTLES) {
        push(calls, place(listener, "whistle", x, z, whistles * WHISTLE_SPACING))
        whistles++
        lead = WHISTLE_LEAD
      }
      cheer(squad.side, x, z, squad.leader, lead)
    }
    for (const event of sim.events) {
      if (event.type === "counter-attack") {
        const z = frontLineZ(sim.map.trenches, event.side)
        if (z !== null) {
          cheer(event.side, listener.x, z, null)
        }
      }
    }
  }

  /** Men giving themselves up, and a man of the side taking an objective cheering it. */
  function captureSounds(listener: Listener, calls: SoundCall[]): void {
    for (const event of sim.events) {
      if (event.type === "capture") {
        shout(listener, calls, "surrender", event.soldier)
      } else if (event.type === "objective-taken") {
        const objective = sim.objectives.find(({ name }) => name === event.name)
        if (!objective) {
          continue
        }
        const id = shoutable(listener, objective.x, objective.z, objective.radius)
          ? nearest(objective.x, objective.z, objective.radius, event.side)
          : null
        const shouted = id !== null && shout(listener, calls, "taken", id)
        if (Math.hypot(objective.x - listener.x, objective.z - listener.z) < CHARGE_RANGE) {
          push(calls, place(listener, "cheer", objective.x, objective.z, shouted ? CHEER_DELAY : 0))
        }
      }
    }
  }

  function gasAlarm(listener: Listener, calls: SoundCall[]): void {
    if (sim.tick % MASK_CHECK_INTERVAL !== 0) {
      return
    }
    let masked = 0
    let crier: EntityId | null = null
    let crierRange = Infinity
    for (const id of soldierIds(sim)) {
      const near = Math.hypot(
        (sim.soldiers.position.x[id] ?? 0) - listener.x,
        (sim.soldiers.position.z[id] ?? 0) - listener.z
      )
      if (near < GAS_ALARM_RANGE && sim.soldiers.mask.state[id] !== MaskState.Off) {
        masked++
        if (near < crierRange) {
          crier = id
          crierRange = near
        }
      }
    }
    const now = seconds(sim.tick)
    if (masked > 0 && masksNear === 0 && now - lastGasAlarm >= GAS_ALARM_REPEAT) {
      lastGasAlarm = now
      // The nearest man pulling on his mask cries the alarm as the gong is struck.
      if (crier !== null) {
        shout(listener, calls, "gas", crier)
      }
      for (let stroke = 0; stroke < GONG_STROKES; stroke++) {
        push(calls, place(listener, "gas-gong", listener.x, listener.z, stroke * GONG_SPACING))
      }
    }
    masksNear = masked
  }

  /** What a round sounds like striking `on` at (x, z): the wire, a parapet, or the ground as it lies there now. */
  function strikeCue(x: number, z: number, on: StrikeSurface): SoundCue {
    if (on === "wire") {
      return "bullet-wire"
    }
    if (on === "parapet") {
      return "bullet-parapet"
    }
    const { wetness, temperature, snowCover } = sim.environment.weather
    const sodden = wetness >= MUDDY && temperature >= FROZEN
    if (
      pools.some((pool) => Math.hypot(pool.x - x, pool.z - z) < pool.scale) ||
      (sodden && isInTrench(sim.map, x, z))
    ) {
      return "bullet-water"
    }
    if (snowCover >= SNOWY) {
      return "bullet-snow"
    }
    if ((ruins?.(x, z) ?? 0) >= STONY) {
      return "bullet-stone"
    }
    strikes++
    if (strikes % RICOCHET_EVERY === 0) {
      return "bullet-ricochet"
    }
    return sodden ? "bullet-mud" : "bullet-impact"
  }

  return {
    step(listener) {
      occlusionChecks = 0
      const calls: SoundCall[] = []
      shotSounds(listener, calls)
      throwSounds(listener, calls)
      flareSounds(listener, calls)
      burstSounds(listener, calls)
      incomingSounds(listener, calls)
      batterySounds(listener, calls)
      deathSounds(listener, calls)
      woundSounds(listener, calls)
      chargeSounds(listener, calls)
      captureSounds(listener, calls)
      gasAlarm(listener, calls)
      return calls
    },
    strike(listener, x, z, time, on = "ground") {
      if (Math.hypot(x - listener.x, z - listener.z) >= IMPACT_RADIUS || time - lastImpact < IMPACT_INTERVAL) {
        return null
      }
      lastImpact = time
      return place(listener, strikeCue(x, z, on), x, z, 0, 0)
    },
    takeShock() {
      const taken = shock
      shock = 0
      return taken
    },
    breathingPinned() {
      const id = soldier()
      return (
        id !== null &&
        !fallen.has(id) &&
        (sim.soldiers.suppression.value[id] ?? 0) >= PINNED &&
        sim.soldiers.mask.state[id] === MaskState.Off
      )
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

/**
 * Where a round's flight from `from`, through `to` and on beyond it, passes nearest the listener: that point, how far
 * it flew to get there, and how far it missed by. Null when it passes nearest before it was fired.
 */
function closestPass(
  listener: Listener,
  from: WorldPoint,
  to: WorldPoint
): { x: number; z: number; along: number; miss: number } | null {
  const dx = to.x - from.x
  const dz = to.z - from.z
  const length = Math.hypot(dx, dz)
  if (length === 0) {
    return null
  }
  const along = Math.min(length + WHIZZ_BEYOND, ((listener.x - from.x) * dx + (listener.z - from.z) * dz) / length)
  if (along <= 0) {
    return null
  }
  const x = from.x + (dx / length) * along
  const z = from.z + (dz / length) * along
  return { x, z, along, miss: Math.hypot(listener.x - x, listener.z - z) }
}

function push(calls: SoundCall[], call: SoundCall | null): void {
  if (call) {
    calls.push(call)
  }
}
