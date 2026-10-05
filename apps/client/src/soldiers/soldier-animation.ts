import { Stance, Weapon } from "@verdun/sim"

/**
 * The soldiers' clips are Mixamo's, retargeted onto the Synty rig by scripts/retarget-animations.py from the files
 * scripts/soldier-clips.txt lists, each named after its file in snake case (docs/assets/mixamo-clips.md has them all).
 * `climb_over` is Mixamo's jump over an obstacle with both hands planted, renamed by the script.
 */

/** Walks clockwise from straight ahead, eighth turns apart, as `headingClip` picks them: Mixamo's Pro Rifle Pack. */
export const WALKS = [
  "rifle_walk_forward",
  "rifle_walk_forward_right",
  "rifle_walk_right",
  "rifle_walk_backward_right",
  "rifle_walk_backward",
  "rifle_walk_backward_left",
  "rifle_walk_left",
  "rifle_walk_forward_left"
] as const
/** Runs, in the same order. Mixamo has the run backward left only in its packs: this one is the backward right mirrored. */
const RUNS = [
  "rifle_run_forward",
  "rifle_run_forward_right",
  "rifle_run_right",
  "rifle_run_backward_right",
  "rifle_run_backward",
  "rifle_run_backward_left",
  "rifle_run_left",
  "rifle_run_forward_left"
] as const
/** Walks bent low, in the same order. */
export const CROUCH_WALKS = [
  "rifle_crouched_walk_forward",
  "rifle_crouched_walk_forward_right",
  "rifle_crouched_walk_right",
  "rifle_crouched_walk_backward_right",
  "rifle_crouched_walk_backward",
  "rifle_crouched_walk_backward_left",
  "rifle_crouched_walk_left",
  "rifle_crouched_walk_forward_left"
] as const
/** Walks with the rifle at the shoulder, aimed, in the same order: made in the bake (see `AIM_LAYERS`). */
export const AIM_WALKS = [
  "aim_walk_forward",
  "aim_walk_forward_right",
  "aim_walk_right",
  "aim_walk_backward_right",
  "aim_walk_backward",
  "aim_walk_backward_left",
  "aim_walk_left",
  "aim_walk_forward_left"
] as const
/** Crouched walks aimed, in the same order: made in the bake too. */
export const CROUCH_AIM_WALKS = [
  "crouch_aim_walk_forward",
  "crouch_aim_walk_forward_right",
  "crouch_aim_walk_right",
  "crouch_aim_walk_backward_right",
  "crouch_aim_walk_backward",
  "crouch_aim_walk_backward_left",
  "crouch_aim_walk_left",
  "crouch_aim_walk_forward_left"
] as const
/**
 * Mixamo aims as it walks only ahead, back and to either side, so the bake makes all eight: each walk's legs and hips,
 * with the arms, spine and head of a walk made aiming (`upper`), turned to face the way the walk's hips do.
 */
export const AIM_LAYERS = [
  { walks: WALKS, made: AIM_WALKS, upper: "walking_while_aiming_rifle" },
  { walks: CROUCH_WALKS, made: CROUCH_AIM_WALKS, upper: "crouched_walking_while_aiming_rifle" }
] as const

/** Standing at ease, rifle in both hands. The kit has no soldier without it. */
export const IDLE = "rifle_standing_idle"
/** At ease, by who he is: not every man stands the same way. */
const IDLES = [IDLE, "two_hand_lowered_gun_rifle_idle", "rifle_idle_looking_around"] as const
/** Turning on the spot, standing then crouched: the crowd plays the one that turns nearest what's wanted. */
export const TURNS = {
  standing: [
    "rifle_turn_45_degree_left_turn",
    "rifle_turn_45_degree_right_turn",
    "rifle_turn_90_degree_left_turn",
    "rifle_turn_90_degree_right_turn",
    "rifle_turn_135_degree_right_turn",
    "rifle_turn_180_degree_left_turn",
    "rifle_turn_180_degree_right_turn"
  ],
  crouching: [
    "rifle_crouch_turn_45_degree_left_turn",
    "rifle_crouch_turn_90_degree_left_turn",
    "rifle_crouch_turn_90_degree_right_turn",
    "rifle_crouch_turn_135_degree_left_turn",
    "rifle_crouch_turn_180_degree_left_turn",
    "rifle_crouch_turn_180_degree_right_turn"
  ]
} as const
const DEATHS_STANDING = [
  "rifle_death_from_the_front",
  "rifle_death_from_the_back",
  "rifle_death_from_right_side",
  "rifle_death_from_front_headshot",
  "rifle_death_from_back_headshot",
  "dying_reaction_while_standing_holding_a_rifle",
  "dying_shot_to_the_chest_falling_on_two_knees",
  "death_hit_from_the_back_falling_on_one_knee"
] as const
const DEATHS_CROUCHING = [
  "rifle_death_crouched_from_headshot_front",
  "dying_from_a_crouched_position",
  "rifle_kneeling_getting_hit_to_back"
] as const
const DEATH_PRONE = "dying_from_a_prone_position"
/** The clips a man dies in: he lets his rifle go partway through. */
export const DEATHS: ReadonlySet<ClipName> = new Set([...DEATHS_STANDING, ...DEATHS_CROUCHING, DEATH_PRONE])

/** The clips the crowd plays from the soldier kit, by their names there. */
export const CLIPS = [
  ...IDLES,
  "rifle_standing_aiming_idle",
  "firing_a_rifle_while_standing",
  "hit_reaction_while_holding_a_rifle",
  "left_reaction_to_front_hit_holding_a_rifle",
  "throwing_something_holding_rifle_aimed",
  ...TURNS.standing,
  ...WALKS,
  ...RUNS,
  "walking_while_aiming_rifle",
  "throwing_a_grenade_while_walking",
  "throw_grenade_while_running",
  "hit_reaction_when_walking_while_aiming_rifle",
  "hit_reaction_when_running_with_rifle",
  "rifle_crouched_idle",
  "rifle_crouched_idle_aiming",
  "fire_rifle_while_crouched",
  "hit_reaction_from_rifle_crouched",
  "throwing_a_grenade_while_kneeling_pulling_pin_with_teeth",
  ...TURNS.crouching,
  ...CROUCH_WALKS,
  "crouched_walking_while_aiming_rifle",
  "rifle_kneeling_idle",
  "lying_down_prone_with_rifle",
  "firing_a_rifle_while_prone",
  "moving_forward_while_in_prone_position",
  "moving_backward_in_prone_position_with_rifle",
  "rifle_prone_hit_reaction",
  "throw_grenade_while_in_prone_position",
  "rifle_standing_to_kneeling",
  "rifle_kneeling_to_standing",
  "rifle_kneeling_to_prone",
  "rifle_prone_to_kneeling",
  "being_terrified_while_standing",
  "climbing_up_a_slope",
  "climb_over",
  ...DEATHS_STANDING,
  ...DEATHS_CROUCHING,
  DEATH_PRONE
] as const

/** A clip as the kit has it. */
export type KitClip = (typeof CLIPS)[number]
/** A clip the crowd plays: from the kit, or made in the bake. */
export type ClipName = KitClip | (typeof AIM_WALKS)[number] | (typeof CROUCH_AIM_WALKS)[number]

/**
 * The clips that aim along the rifle, standing, crouched, lying and walking. Their soldiers stand bladed, shoulders
 * turned, so the rifle points some 20 degrees off where their feet face; the crowd turns them by each clip's
 * `BakedClip.turn` to put the rifle on the target.
 */
export const AIMING: ReadonlySet<ClipName> = new Set<ClipName>([
  ...AIM_WALKS,
  ...CROUCH_AIM_WALKS,
  "rifle_standing_aiming_idle",
  "firing_a_rifle_while_standing",
  "rifle_crouched_idle_aiming",
  "fire_rifle_while_crouched",
  "firing_a_rifle_while_prone"
])

/** Below this ground speed, in metres per second, a soldier is standing still. A crawl is 0.35. */
export const MOVING_SPEED = 0.15
/**
 * Above this a soldier is running whatever he was told: a walk is at most 1.4 and a run 3.5. A run through mud
 * or wire can be no faster than a walk, so `SoldierState.running` counts too.
 */
export const RUNNING_SPEED = 2.1
/** The ground speeds the clips were made for: playback scales from these within `RATE_LIMITS`. */
const CLIP_SPEED = { walk: 1.4, run: 3.2, crouch: 1.1, crawl: 0.45 } as const
/**
 * Never slower than this, nor faster: across a crater field a man makes perhaps two-thirds of a clip's pace, and legs
 * slowed to match look like slow motion. A stride a little long for the ground reads as hard going instead.
 */
const RATE_LIMITS = { min: 0.75, max: 1.5 } as const

/** A one-off movement in progress, which plays out before the soldier goes back to what they were doing. */
export type Action = "fire" | "throw" | "hit"

/** How a soldier is getting about: as an action plays, it plays the clip made for it. */
export type Movement = "still" | "walking" | "running"

export interface SoldierState {
  readonly status: "fighting" | "captured" | "fallen"
  /** Standing, crouching or prone: a man down a dugout isn't drawn. */
  readonly stance: Stance
  readonly weapon: Weapon
  /** Ground speed in metres per second. */
  readonly speed: number
  /** Which way the soldier moves, relative to where they face: radians clockwise from ahead. */
  readonly heading: number
  /** Running on a run order or the run key, with the breath and the nerve for it. */
  readonly running: boolean
  /** Scrambling up ground too steep to walk: a trench wall, a crater's lip. */
  readonly climbing: boolean
  /** Climbing over a staked fence: how many seconds getting over it takes him, or null when he isn't on one. */
  readonly overFence: number | null
  /** Has an enemy in their sights, or the player has him aim. */
  readonly aiming: boolean
  /** In a trench with his head over the parapet, up on the fire step: he watches over it, rifle ready. */
  readonly overParapet: boolean
  readonly pinned: boolean
  readonly broken: boolean
  readonly action: Action | null
  /** Turning on the spot or changing stance: a clip the crowd started, played through once while he keeps still. */
  readonly shift: ClipName | null
  /** The entity id, for variety: not every man falls the same way. */
  readonly id: number
}

/**
 * How a clip plays: looping, once through then held on its last frame (an action, or a death), or held on its first
 * frame.
 */
export type PlayMode = "loop" | "once" | "still"

export interface Pose {
  readonly clip: ClipName
  readonly mode: PlayMode
  /** Playback speed, 1 as made. */
  readonly rate: number
  /** How long the clip takes played once, whatever its own length, in seconds: in place of `rate`, when set. */
  readonly seconds?: number
}

const loop = (clip: ClipName, rate = 1): Pose => ({ clip, mode: "loop", rate })
const once = (clip: ClipName): Pose => ({ clip, mode: "once", rate: 1 })

/** The one of eight clips (clockwise from ahead) closest to a heading in radians clockwise from ahead. */
export function headingClip(clips: readonly ClipName[], heading: number): ClipName {
  const eighth = Math.round(heading / (Math.PI / 4))
  return clips[((eighth % 8) + 8) % 8] ?? clips[0] ?? IDLE
}

/** Whether a soldier is standing still, walking or running. */
export function movementOf(state: Pick<SoldierState, "speed" | "running">): Movement {
  if (state.speed < MOVING_SPEED) {
    return "still"
  }
  return state.running || state.speed > RUNNING_SPEED ? "running" : "walking"
}

const STANDING_ACTIONS: Readonly<Record<Action, ClipName>> = {
  fire: "firing_a_rifle_while_standing",
  throw: "throwing_something_holding_rifle_aimed",
  hit: "hit_reaction_while_holding_a_rifle"
}
const CROUCHING_ACTIONS: Readonly<Record<Action, ClipName>> = {
  fire: "fire_rifle_while_crouched",
  throw: "throwing_a_grenade_while_kneeling_pulling_pin_with_teeth",
  hit: "hit_reaction_from_rifle_crouched"
}
const PRONE_ACTIONS: Readonly<Record<Action, ClipName>> = {
  fire: "firing_a_rifle_while_prone",
  throw: "throw_grenade_while_in_prone_position",
  hit: "rifle_prone_hit_reaction"
}
/** On the move there's no firing clip: the walk goes on (see `actionClip`). */
const WALKING_ACTIONS: Readonly<Record<Exclude<Action, "fire">, ClipName>> = {
  throw: "throwing_a_grenade_while_walking",
  hit: "hit_reaction_when_walking_while_aiming_rifle"
}
const RUNNING_ACTIONS: Readonly<Record<Exclude<Action, "fire">, ClipName>> = {
  throw: "throw_grenade_while_running",
  hit: "hit_reaction_when_running_with_rifle"
}

/**
 * The clip an action plays, by how the man is placed: firing, a throw and a flinch for standing, crouching and lying,
 * and a throw and a flinch on the move. A machine gunner kneels to his gun. Firing on the move has no clip of its own:
 * null, and the walk goes on.
 */
export function actionClip(
  action: Action,
  stance: Stance,
  weapon: Weapon,
  movement: Movement,
  id: number
): ClipName | null {
  if (stance === Stance.Prone) {
    return PRONE_ACTIONS[action]
  }
  if (movement !== "still") {
    return action === "fire" ? null : (movement === "running" ? RUNNING_ACTIONS : WALKING_ACTIONS)[action]
  }
  if (stance === Stance.Crouching || weapon === Weapon.MachineGun) {
    return CROUCHING_ACTIONS[action]
  }
  if (action === "hit" && id % 2 === 1) {
    // Not every man flinches the same way.
    return "left_reaction_to_front_hit_holding_a_rifle"
  }
  return STANDING_ACTIONS[action]
}

/** The clip carrying a man from one stance to another, or null for none: standing, crouching and lying by a kneel. */
export function stanceClip(from: Stance, to: Stance): ClipName | null {
  if (from === to) {
    return null
  }
  if (to === Stance.Prone) {
    return "rifle_kneeling_to_prone"
  }
  if (from === Stance.Prone) {
    return "rifle_prone_to_kneeling"
  }
  return to === Stance.Crouching ? "rifle_standing_to_kneeling" : "rifle_kneeling_to_standing"
}

function moving(state: SoldierState, movement: Movement): Pose {
  if (movement === "running" && !state.aiming) {
    return loop(headingClip(RUNS, state.heading), rateFor(state.speed, CLIP_SPEED.run))
  }
  // A broken man can't run: he gets away bent double.
  if (state.stance === Stance.Crouching || state.broken) {
    const walks = state.aiming && !state.broken ? CROUCH_AIM_WALKS : CROUCH_WALKS
    return loop(headingClip(walks, state.heading), rateFor(state.speed, CLIP_SPEED.crouch))
  }
  return loop(headingClip(state.aiming ? AIM_WALKS : WALKS, state.heading), rateFor(state.speed, CLIP_SPEED.walk))
}

function rateFor(speed: number, clipSpeed: number): number {
  return Math.min(RATE_LIMITS.max, Math.max(RATE_LIMITS.min, speed / clipSpeed))
}

/** The clip a man falls with: forward onto his face from prone, from a crouch when crouching, else by who he is. */
export function deathClip(stance: Stance, id: number): ClipName {
  if (stance === Stance.Prone) {
    return DEATH_PRONE
  }
  const deaths = stance === Stance.Crouching ? DEATHS_CROUCHING : DEATHS_STANDING
  return deaths[id % deaths.length] ?? DEATH_PRONE
}

/** Lying down: crawling ahead or back, aiming along the ground, or still. */
function prone(state: SoldierState, movement: Movement): Pose {
  const clip = state.action ? actionClip(state.action, Stance.Prone, state.weapon, movement, state.id) : null
  if (clip) {
    return once(clip)
  }
  if (state.shift) {
    return once(state.shift)
  }
  if (movement !== "still") {
    const back = Math.abs(state.heading) > Math.PI / 2
    const crawl = back ? "moving_backward_in_prone_position_with_rifle" : "moving_forward_while_in_prone_position"
    return loop(crawl, rateFor(state.speed, CLIP_SPEED.crawl))
  }
  // The prone fire's first frame is his aim, held.
  return state.aiming
    ? { clip: "firing_a_rifle_while_prone", mode: "still", rate: 1 }
    : loop("lying_down_prone_with_rifle")
}

/** What a soldier's body is doing, from their state. */
export function choosePose(state: SoldierState): Pose {
  const movement = movementOf(state)
  if (state.status === "fallen") {
    return once(deathClip(state.stance, state.id))
  }
  if (state.status === "captured") {
    return movement === "still" ? loop(IDLE) : loop("rifle_walk_forward", rateFor(state.speed, CLIP_SPEED.walk))
  }
  if (state.stance === Stance.Prone) {
    return prone(state, movement)
  }
  // Over a fence the whole time he's on it, from a hand on the top wire to his feet on the ground beyond.
  if (state.overFence !== null) {
    return { clip: "climb_over", mode: "once", rate: 1, seconds: state.overFence }
  }
  // A scramble is slow across the ground, but it's no standing still.
  if (state.climbing) {
    return loop("climbing_up_a_slope")
  }
  const action = state.action ? actionClip(state.action, state.stance, state.weapon, movement, state.id) : null
  if (movement !== "still") {
    return action ? once(action) : moving(state, movement)
  }
  if (action) {
    return once(action)
  }
  if (state.shift) {
    return once(state.shift)
  }
  if (state.broken) {
    return loop("being_terrified_while_standing")
  }
  if (state.weapon === Weapon.MachineGun) {
    return loop("rifle_kneeling_idle")
  }
  // Pinned men keep as low as crouching men, rifle ready.
  if (state.pinned || state.stance === Stance.Crouching) {
    return loop(state.aiming || state.pinned ? "rifle_crouched_idle_aiming" : "rifle_crouched_idle")
  }
  if (state.aiming || state.overParapet) {
    return loop("rifle_standing_aiming_idle")
  }
  return loop(IDLES[state.id % IDLES.length] ?? IDLE)
}

/** A clip's place in the baked animation texture: its first row, how many frames it has, and at what rate. */
export interface BakedClip {
  readonly start: number
  readonly frames: number
  readonly fps: number
  /**
   * How far to turn a soldier playing this clip, in radians clockwise seen from above, so his rifle points where he
   * faces: nonzero for `AIMING` clips only.
   */
  readonly turn: number
  /** How far the clip turns him round from its first frame to its last, in radians clockwise seen from above. */
  readonly spin: number
}

/** How fast a pose plays its clip: at its rate, or as fast as fits the clip into its seconds. */
function playbackRate(clip: BakedClip, pose: Pose): number {
  return pose.seconds === undefined ? pose.rate : clip.frames / clip.fps / pose.seconds
}

/**
 * The texture row to show for a pose `elapsed` seconds after it began. Loops start `phase` (0 to 1) of the way through
 * so a crowd doesn't move in step; a pose played once holds its last frame.
 */
export function poseFrame(clip: BakedClip, pose: Pose, elapsed: number, phase: number): number {
  if (pose.mode === "still") {
    return clip.start
  }
  const advanced = Math.floor(Math.max(0, elapsed) * clip.fps * playbackRate(clip, pose))
  if (pose.mode === "once") {
    return clip.start + Math.min(advanced, clip.frames - 1)
  }
  return clip.start + ((Math.floor(phase * clip.frames) + advanced) % clip.frames)
}

/** How long a pose played once takes, in seconds. */
export function poseSeconds(clip: BakedClip, pose: Pose): number {
  return clip.frames / clip.fps / playbackRate(clip, pose)
}
