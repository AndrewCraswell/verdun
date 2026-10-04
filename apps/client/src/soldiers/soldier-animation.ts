import { Stance, Weapon } from "@verdun/sim"

/**
 * The clips the crowd plays, by their names in the soldier kit (scripts/retarget-animations.py names them). The
 * polyperfect set has no rifle clips of its own, no crawl, no throw and no hands up, so some stand in:
 *
 * - `idle_6` is a standing aim and `idle_5` a hunched one: aiming, and pinned down.
 * - `idle_3` kneels low over a rifle, which puts a machine gunner's hands near his gun's grips.
 * - `idle_1` and `idle_2` are lying aims: prone, still and crawling alike.
 * - `brengun_fire` is the rifle's recoil, `stengun_reload` a grenade being primed and thrown.
 * - The first frame of `death_crouch_back`, crouched with an arm over the head, is a broken man cowering.
 */
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

export const CLIPS = [
  "idle",
  "idle_1",
  "idle_2",
  "idle_3",
  "idle_5",
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

export type ClipName = (typeof CLIPS)[number]

const DEATHS_STANDING = [
  "death_standing_back",
  "death_standing_left",
  "death_crouch_back",
  "death_crouch_right"
] as const

/** Below this ground speed, in metres per second, a soldier is standing still. A crawl is 0.35. */
export const MOVING_SPEED = 0.15
/** Above this a soldier is running: a walk is at most 1.4 and a run twice that. */
export const RUNNING_SPEED = 2.1
/** The ground speeds the walk and run clips were made for: playback scales from these, within `RATE_LIMITS`. */
const WALK_CLIP_SPEED = 1.4
const RUN_CLIP_SPEED = 3.2
const RATE_LIMITS = { min: 0.6, max: 1.5 } as const

/** A one-off movement in progress, which plays out before the soldier goes back to what they were doing. */
export type Action = "fire" | "throw" | "hit"

export interface SoldierState {
  readonly status: "fighting" | "captured" | "fallen"
  readonly stance: Stance
  readonly weapon: Weapon
  /** Ground speed in metres per second. */
  readonly speed: number
  /** Which way the soldier moves, relative to where they face: radians clockwise from ahead. */
  readonly heading: number
  /** Has an enemy in their sights. */
  readonly aiming: boolean
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
  if (state.broken) {
    return loop("run_forward", rateFor(state.speed, RUN_CLIP_SPEED))
  }
  if (state.speed > RUNNING_SPEED) {
    return loop(headingClip(RUNS, state.heading), rateFor(state.speed, RUN_CLIP_SPEED))
  }
  return loop(headingClip(WALKS, state.heading), rateFor(state.speed, WALK_CLIP_SPEED))
}

function rateFor(speed: number, clipSpeed: number): number {
  return Math.min(RATE_LIMITS.max, Math.max(RATE_LIMITS.min, speed / clipSpeed))
}

/** The clip a man falls with: forward onto his face from prone, otherwise one of four ways by who he is. */
export function deathClip(stance: Stance, id: number): ClipName {
  return stance === Stance.Prone ? "death_prone" : (DEATHS_STANDING[id % DEATHS_STANDING.length] ?? "death_prone")
}

/** What a soldier's body is doing, from their state. */
export function choosePose(state: SoldierState): Pose {
  const isMoving = state.speed >= MOVING_SPEED
  if (state.status === "fallen") {
    return once(deathClip(state.stance, state.id))
  }
  if (state.status === "captured") {
    return isMoving ? loop("walk_forward", rateFor(state.speed, WALK_CLIP_SPEED)) : loop("idle")
  }
  if (state.stance === Stance.Prone) {
    // No crawl among the clips: a lying aim, carried along the ground.
    return loop(state.aiming || state.action === "fire" ? "idle_2" : "idle_1")
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
  if (state.pinned) {
    return loop("idle_5")
  }
  if (state.weapon === Weapon.MachineGun) {
    return loop("idle_3")
  }
  if (state.action === "fire") {
    return once("brengun_fire")
  }
  return loop(state.aiming ? "idle_6" : "idle")
}

/** A clip's place in the baked animation texture: its first row, how many frames it has, and at what rate. */
export interface BakedClip {
  readonly start: number
  readonly frames: number
  readonly fps: number
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
