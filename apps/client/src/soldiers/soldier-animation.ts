import { Stance, Weapon } from "@verdun/sim"

/** Walks and runs clockwise from straight ahead, eighth turns apart, as `headingClip` picks them. */
export const WALKS = [
  "walk_forward",
  "walk_forward_right",
  "walk_right",
  "walk_back_right",
  "walk_back",
  "walk_back_left",
  "walk_left",
  "walk_forward_left"
] as const
const RUNS = [
  "run_forward",
  "run_forward_right",
  "run_right",
  "run_back_right",
  "run_back",
  "run_back_left",
  "run_left",
  "run_forward_left"
] as const
/**
 * The walks with the knees bent and the body low, in the same order. The kit has no crouched walk: the bake makes these
 * by layering the hunched aim's crouch onto each walk, every bone turned on from the stand by as much as the crouch
 * turns it (see `CROUCH_LAYER`).
 */
export const CROUCH_WALKS = [
  "crouch_walk_forward",
  "crouch_walk_forward_right",
  "crouch_walk_right",
  "crouch_walk_back_right",
  "crouch_walk_back",
  "crouch_walk_back_left",
  "crouch_walk_left",
  "crouch_walk_forward_left"
] as const
/** The clips whose difference is the crouch layered onto the walks: from standing at ease to the hunched aim. */
export const CROUCH_LAYER = { from: "idle", to: "idle_5" } as const

/**
 * The clips the crowd plays from the soldier kit, by their names there (scripts/retarget-animations.py names them).
 * The polyperfect set has no rifle clips of its own, no crouch, crawl, climb or throw and no hands up, so some stand in:
 *
 * - `idle_6` is a standing aim; `idle_4`, squatting over the rifle, is the crouch, still or aiming, and pinned down.
 * - `idle_3` kneels low over a rifle, which puts a machine gunner's hands near his gun's grips.
 * - `idle_1` and `idle_2` are lying aims: prone, still and crawling alike.
 * - `brengun_fire` is the rifle's recoil, `stengun_reload` a grenade being primed and thrown.
 * - `run_forward`, played slowly, is a man scrambling up a trench wall.
 * - The first frame of `death_crouch_back`, crouched with an arm over the head, is a broken man cowering.
 */
export const CLIPS = [
  "idle",
  "idle_1",
  "idle_2",
  "idle_3",
  "idle_4",
  "idle_6",
  ...WALKS,
  ...RUNS,
  "brengun_fire",
  "stengun_reload",
  "hit_ribs",
  "death_standing_back",
  "death_standing_left",
  "death_crouch_back",
  "death_crouch_right",
  "death_prone"
] as const

/** A clip as the kit has it. */
export type KitClip = (typeof CLIPS)[number]
/** A clip the crowd plays: from the kit, or made in the bake. */
export type ClipName = KitClip | (typeof CROUCH_WALKS)[number]

/**
 * The clips that aim along the rifle. Their soldiers stand bladed, shoulders turned, so the rifle points well left of
 * where their feet face; the crowd turns them by each clip's `BakedClip.turn` to put the rifle on the target.
 */
export const AIMING: ReadonlySet<ClipName> = new Set(["idle_1", "idle_2", "idle_3", "idle_4", "idle_6", "brengun_fire"])

const DEATHS_STANDING = [
  "death_standing_back",
  "death_standing_left",
  "death_crouch_back",
  "death_crouch_right"
] as const
const DEATHS_CROUCHING = ["death_crouch_back", "death_crouch_right"] as const

/** Below this ground speed, in metres per second, a soldier is standing still. A crawl is 0.35. */
export const MOVING_SPEED = 0.15
/**
 * Above this a soldier is running whatever he was told: a walk is at most 1.4 and a run twice that. A run through mud
 * or wire can be no faster than a walk, so `SoldierState.running` counts too.
 */
export const RUNNING_SPEED = 2.1
/**
 * The ground speeds the clips were made for, the simulation's paces: playback scales from these within `RATE_LIMITS`.
 * A crouched walk keeps the walk's stride, so at the crouch's 0.84 it plays at 0.6.
 */
const CLIP_SPEED = { walk: 1.4, run: 2.8, crouch: 1.4 } as const
const RATE_LIMITS = { min: 0.6, max: 1.5 } as const
/** A scramble up a wall plays the run this slowly: laboured steps, about two seconds to the fire step. */
const CLIMB_RATE = 0.8

/** A one-off movement in progress, which plays out before the soldier goes back to what they were doing. */
export type Action = "fire" | "throw" | "hit"

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
  /** Has an enemy in their sights. */
  readonly aiming: boolean
  /** In a trench with his head over the parapet, up on the fire step: he watches over it, rifle ready. */
  readonly overParapet: boolean
  readonly pinned: boolean
  readonly broken: boolean
  readonly action: Action | null
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
}

const loop = (clip: ClipName, rate = 1): Pose => ({ clip, mode: "loop", rate })
const once = (clip: ClipName): Pose => ({ clip, mode: "once", rate: 1 })

/** The one of eight clips (clockwise from ahead) closest to a heading in radians clockwise from ahead. */
export function headingClip(clips: readonly ClipName[], heading: number): ClipName {
  const eighth = Math.round(heading / (Math.PI / 4))
  return clips[((eighth % 8) + 8) % 8] ?? clips[0] ?? "idle"
}

function moving(state: SoldierState): Pose {
  if (state.running || state.speed > RUNNING_SPEED) {
    return loop(headingClip(RUNS, state.heading), rateFor(state.speed, CLIP_SPEED.run))
  }
  // A broken man can't run: he gets away bent double.
  if (state.stance === Stance.Crouching || state.broken) {
    return loop(headingClip(CROUCH_WALKS, state.heading), rateFor(state.speed, CLIP_SPEED.crouch))
  }
  return loop(headingClip(WALKS, state.heading), rateFor(state.speed, CLIP_SPEED.walk))
}

function rateFor(speed: number, clipSpeed: number): number {
  return Math.min(RATE_LIMITS.max, Math.max(RATE_LIMITS.min, speed / clipSpeed))
}

/**
 * The clip a man falls with: forward onto his face from prone, from a crouch from crouching, otherwise one of four
 * ways, by who he is.
 */
export function deathClip(stance: Stance, id: number): ClipName {
  if (stance === Stance.Prone) {
    return "death_prone"
  }
  const deaths = stance === Stance.Crouching ? DEATHS_CROUCHING : DEATHS_STANDING
  return deaths[id % deaths.length] ?? "death_prone"
}

/** What a soldier's body is doing, from their state. */
export function choosePose(state: SoldierState): Pose {
  const isMoving = state.speed >= MOVING_SPEED
  if (state.status === "fallen") {
    return once(deathClip(state.stance, state.id))
  }
  if (state.status === "captured") {
    return isMoving ? loop("walk_forward", rateFor(state.speed, CLIP_SPEED.walk)) : loop("idle")
  }
  if (state.stance === Stance.Prone) {
    // No crawl among the clips: a lying aim, carried along the ground.
    return loop(state.aiming || state.action === "fire" ? "idle_2" : "idle_1")
  }
  // A scramble is slow across the ground, but it's no standing still.
  if (state.climbing) {
    return loop("run_forward", CLIMB_RATE)
  }
  if (isMoving) {
    return moving(state)
  }
  if (state.action === "hit") {
    return once("hit_ribs")
  }
  if (state.action === "throw") {
    return once("stengun_reload")
  }
  if (state.broken) {
    return { clip: "death_crouch_back", mode: "still", rate: 1 }
  }
  if (state.weapon === Weapon.MachineGun) {
    return loop("idle_3")
  }
  // Pinned men keep as low as crouching men; neither has a crouched recoil, so they fire from the crouch.
  if (state.pinned || state.stance === Stance.Crouching) {
    return loop("idle_4")
  }
  if (state.action === "fire") {
    return once("brengun_fire")
  }
  return loop(state.aiming || state.overParapet ? "idle_6" : "idle")
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
}

/**
 * The texture row to show for a pose `elapsed` seconds after it began. Loops start `phase` (0 to 1) of the way through
 * so a crowd doesn't move in step; a pose played once holds its last frame.
 */
export function poseFrame(clip: BakedClip, pose: Pose, elapsed: number, phase: number): number {
  if (pose.mode === "still") {
    return clip.start
  }
  const advanced = Math.floor(Math.max(0, elapsed) * clip.fps * pose.rate)
  if (pose.mode === "once") {
    return clip.start + Math.min(advanced, clip.frames - 1)
  }
  return clip.start + ((Math.floor(phase * clip.frames) + advanced) % clip.frames)
}

/** How long a pose played once takes, in seconds. */
export function poseSeconds(clip: BakedClip, pose: Pose): number {
  return clip.frames / clip.fps / pose.rate
}
