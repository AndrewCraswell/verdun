import { Stance, Weapon } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import {
  actionClip,
  AIM_WALKS,
  choosePose,
  climbClip,
  CROUCH_AIM_WALKS,
  CROUCH_WALKS,
  deathClip,
  headingClip,
  IDLE,
  movementOf,
  poseFrame,
  poseSeconds,
  type SoldierState,
  stanceClip,
  WALKS
} from "./soldier-animation.ts"

const standing: SoldierState = {
  status: "fighting",
  stance: Stance.Standing,
  weapon: Weapon.Rifle,
  speed: 0,
  heading: 0,
  running: false,
  climbing: false,
  overFence: null,
  aiming: false,
  overParapet: false,
  pinned: false,
  broken: false,
  action: null,
  shift: null,
  reloading: null,
  id: 0
}

const pose = (changes: Partial<SoldierState>) => choosePose({ ...standing, ...changes })

describe("headingClip", () => {
  it("picks the nearest of eight directions, clockwise from ahead", () => {
    expect(headingClip(WALKS, 0)).toBe("rifle_walk_forward")
    expect(headingClip(WALKS, Math.PI / 2)).toBe("rifle_walk_right")
    expect(headingClip(WALKS, -Math.PI / 2)).toBe("rifle_walk_left")
    expect(headingClip(WALKS, Math.PI)).toBe("rifle_walk_backward")
    expect(headingClip(WALKS, -Math.PI)).toBe("rifle_walk_backward")
    expect(headingClip(WALKS, 0.3)).toBe("rifle_walk_forward")
    expect(headingClip(WALKS, 0.5)).toBe("rifle_walk_forward_right")
    expect(headingClip(WALKS, -2.4)).toBe("rifle_walk_backward_left")
    expect(headingClip(CROUCH_WALKS, -2.4)).toBe("rifle_crouched_walk_backward_left")
    expect(headingClip(AIM_WALKS, 2.4)).toBe("aim_walk_backward_right")
  })
})

describe("choosePose", () => {
  it("stands at ease, each man his own way, or aims with an enemy in sight or the player aiming", () => {
    expect(pose({})).toEqual({ clip: IDLE, mode: "loop", rate: 1 })
    expect(new Set([0, 1, 2].map((id) => pose({ id }).clip)).size).toBe(3)
    expect(pose({ id: 3 }).clip).toBe(IDLE)
    expect(pose({ aiming: true }).clip).toBe("rifle_standing_aiming_idle")
  })

  it("keeps watch with the rifle ready when his head is over the parapet", () => {
    expect(pose({ overParapet: true }).clip).toBe("rifle_standing_aiming_idle")
  })

  it("walks or runs the way they move, at the pace the clip was made for", () => {
    const walk = pose({ speed: 1.4, heading: Math.PI / 2 })
    expect(walk.clip).toBe("rifle_walk_right")
    expect(walk.rate).toBeCloseTo(1)
    // A spent man walks at three quarters of the pace; slower still, the steps stop slowing, short of slow motion.
    expect(pose({ speed: 1.12 }).rate).toBeCloseTo(0.8)
    expect(pose({ speed: 0.7 }).rate).toBeCloseTo(0.75)
    expect(pose({ speed: 3.2, heading: Math.PI }).clip).toBe("rifle_run_backward")
    expect(pose({ speed: 3.2 }).rate).toBeCloseTo(1)
    // Running through mud is no faster than a walk, but it's still a run.
    expect(pose({ speed: 1.2, running: true })).toEqual({ clip: "rifle_run_forward", mode: "loop", rate: 0.75 })
    // Firing on the move has no clip: he walks on.
    expect(pose({ speed: 1.4, action: "fire" }).clip).toBe("rifle_walk_forward")
  })

  it("aims as he walks, in any direction, and walks rather than runs to aim", () => {
    expect(pose({ speed: 1.4, aiming: true, heading: Math.PI / 4 }).clip).toBe("aim_walk_forward_right")
    expect(pose({ speed: 2.8, running: true, aiming: true }).clip).toBe("aim_walk_forward")
    expect(pose({ stance: Stance.Crouching, speed: 1.1, aiming: true, heading: -Math.PI / 2 }).clip).toBe(
      CROUCH_AIM_WALKS[6]
    )
  })

  it("crouches: at ease or aiming when still, firing from the crouch, and walking bent", () => {
    expect(pose({ stance: Stance.Crouching }).clip).toBe("rifle_crouched_idle")
    expect(pose({ stance: Stance.Crouching, aiming: true }).clip).toBe("rifle_crouched_idle_aiming")
    expect(pose({ stance: Stance.Crouching, aiming: true, action: "fire" }).clip).toBe("fire_bolt_crouched")
    const crouched = pose({ stance: Stance.Crouching, speed: 0.84, heading: Math.PI / 2 })
    expect(crouched.clip).toBe("rifle_crouched_walk_right")
    expect(crouched.rate).toBeCloseTo(0.84 / 1.1)
  })

  it("scrambles up a bank, however slowly he crosses the ground", () => {
    expect(pose({ climbing: true, speed: 0.1 })).toEqual({ clip: "climbing_up_a_slope", mode: "loop", rate: 1 })
    expect(pose({ climbing: true, stance: Stance.Prone }).clip).toBe("lying_down_prone_with_rifle")
  })

  it("climbs over a fence the whole time he's on it, the climb spread over however long that takes", () => {
    const fence = { seconds: 3, top: 1.35 }
    expect(pose({ overFence: fence, speed: 0.4 })).toEqual({ clip: "climb_over", mode: "once", rate: 1, seconds: 3 })
    // Not a walk, a run nor a scramble, whatever his pace or his orders.
    const slantwise = { ...fence, seconds: 4.5 }
    expect(pose({ overFence: slantwise, speed: 2.8, running: true, climbing: true, aiming: true }).clip).toBe(
      "climb_over"
    )
    expect(pose({ overFence: fence, stance: Stance.Prone }).clip).toBe("lying_down_prone_with_rifle")
    expect(pose({ overFence: fence, status: "fallen" }).mode).toBe("once")
    expect(pose({ overFence: fence, status: "fallen" }).clip).not.toBe("climb_over")
  })

  it("climbs over each height of fence and wall with the climb made for it", () => {
    expect(climbClip(1.35)).toBe("climb_over")
    expect(climbClip(1)).toBe("climb_over_wall")
    expect(climbClip(0.6)).toBe("climb_over_low_wall")
    expect(pose({ overFence: { seconds: 1.25, top: 1 } }).clip).toBe("climb_over_wall")
  })

  it("gets away bent double when broken, and cowers when broken and still", () => {
    expect(pose({ broken: true, speed: 1.4, heading: Math.PI }).clip).toBe("rifle_crouched_walk_backward")
    expect(pose({ broken: true, speed: 1.4, aiming: true }).clip).toBe("rifle_crouched_walk_forward")
    expect(pose({ broken: true })).toEqual({ clip: "being_terrified_while_standing", mode: "once", rate: 1 })
  })

  it("lies still, aims along the ground, and crawls ahead or back", () => {
    expect(pose({ stance: Stance.Prone }).clip).toBe("lying_down_prone_with_rifle")
    expect(pose({ stance: Stance.Prone, aiming: true })).toEqual({
      clip: "firing_a_rifle_while_prone",
      mode: "still",
      rate: 1
    })
    expect(pose({ stance: Stance.Prone, action: "fire" })).toEqual({
      clip: "fire_bolt_prone",
      mode: "once",
      rate: 1
    })
    expect(pose({ stance: Stance.Prone, speed: 0.35 }).clip).toBe("moving_forward_while_in_prone_position")
    expect(pose({ stance: Stance.Prone, speed: 0.35, heading: 2.5 }).clip).toBe(
      "moving_backward_in_prone_position_with_rifle"
    )
    expect(pose({ stance: Stance.Prone, speed: 0.35, action: "throw" }).clip).toBe(
      "throw_grenade_while_in_prone_position"
    )
  })

  it("plays actions through once: recoil, a throw, a flinch, on the move too", () => {
    expect(pose({ action: "fire", aiming: true })).toEqual({
      clip: "fire_bolt_standing",
      mode: "once",
      rate: 1
    })
    expect(pose({ action: "throw" }).clip).toBe("throwing_something_holding_rifle_aimed")
    expect(pose({ action: "hit", pinned: true }).clip).toBe("hit_reaction_while_holding_a_rifle")
    expect(pose({ action: "throw", speed: 1.4 }).clip).toBe("throwing_a_grenade_while_walking")
    expect(pose({ action: "hit", speed: 3, running: true }).clip).toBe("hit_reaction_when_running_with_rifle")
  })

  it("turns on the spot or changes stance with the clip the crowd started, still and at ease", () => {
    expect(pose({ shift: "rifle_turn_90_degree_left_turn" })).toEqual({
      clip: "rifle_turn_90_degree_left_turn",
      mode: "once",
      rate: 1
    })
    expect(pose({ stance: Stance.Prone, shift: "rifle_kneeling_to_prone" }).clip).toBe("rifle_kneeling_to_prone")
    // An action or moving off comes first.
    expect(pose({ shift: "rifle_turn_90_degree_left_turn", action: "hit" }).clip).toBe(
      "hit_reaction_while_holding_a_rifle"
    )
    expect(pose({ shift: "rifle_turn_90_degree_left_turn", speed: 1.4 }).clip).toBe("rifle_walk_forward")
  })

  it("reloads standing, crouched or lying, spread over the reload, but not on the move nor at a machine gun", () => {
    expect(pose({ reloading: 4 })).toEqual({
      clip: "reloading_rifle_while_standing",
      mode: "once",
      rate: 1,
      seconds: 4
    })
    expect(pose({ reloading: 4, pinned: true }).clip).toBe("reload_rifle_while_in_crouch_position")
    expect(pose({ reloading: 4, stance: Stance.Crouching }).clip).toBe("reload_rifle_while_in_crouch_position")
    expect(pose({ reloading: 4, stance: Stance.Prone }).clip).toBe("reloading_rifle_in_prone")
    expect(pose({ reloading: 4, speed: 1.4 }).clip).toBe("rifle_walk_forward")
    expect(pose({ reloading: 8, weapon: Weapon.MachineGun }).clip).toBe("rifle_kneeling_idle")
    // A flinch cuts it off.
    expect(pose({ reloading: 4, action: "hit" }).clip).toBe("hit_reaction_while_holding_a_rifle")
  })

  it("keeps low when pinned, and kneels behind a machine gun", () => {
    expect(pose({ pinned: true }).clip).toBe("rifle_crouched_idle_aiming")
    expect(pose({ weapon: Weapon.MachineGun, aiming: true }).clip).toBe("rifle_kneeling_idle")
  })

  it("walks prisoners to the rear, hands up", () => {
    expect(pose({ status: "captured", speed: 1.2 }).clip).toBe("hands_up_walk")
    expect(pose({ status: "captured", aiming: true }).clip).toBe("hands_up")
  })

  it("plays a death through once and holds it", () => {
    expect(pose({ status: "fallen", speed: 2 })).toEqual({ clip: deathClip(Stance.Standing, 0), mode: "once", rate: 1 })
  })
})

describe("actionClip", () => {
  it("has a clip for each action as a man is placed, but none for firing on the move", () => {
    expect(actionClip("fire", Stance.Standing, Weapon.Rifle, "walking", 0)).toBeNull()
    expect(actionClip("fire", Stance.Prone, Weapon.Rifle, "walking", 0)).toBe("fire_bolt_prone")
    expect(actionClip("throw", Stance.Crouching, Weapon.Rifle, "still", 0)).toBe(
      "throwing_a_grenade_while_kneeling_pulling_pin_with_teeth"
    )
    expect(actionClip("hit", Stance.Standing, Weapon.MachineGun, "still", 0)).toBe("hit_reaction_from_rifle_crouched")
    expect(actionClip("hit", Stance.Standing, Weapon.Rifle, "still", 1)).toBe(
      "left_reaction_to_front_hit_holding_a_rifle"
    )
    expect(actionClip("throw", Stance.Standing, Weapon.Rifle, "running", 0)).toBe("throw_grenade_while_running")
  })
})

describe("movementOf", () => {
  it("tells standing still from walking and running", () => {
    expect(movementOf({ speed: 0.1, running: true })).toBe("still")
    expect(movementOf({ speed: 1.2, running: false })).toBe("walking")
    expect(movementOf({ speed: 1.2, running: true })).toBe("running")
    expect(movementOf({ speed: 2.5, running: false })).toBe("running")
  })
})

describe("stanceClip", () => {
  it("goes down and up by a kneel", () => {
    expect(stanceClip(Stance.Standing, Stance.Standing)).toBeNull()
    expect(stanceClip(Stance.Standing, Stance.Crouching)).toBe("rifle_standing_to_kneeling")
    expect(stanceClip(Stance.Crouching, Stance.Standing)).toBe("rifle_kneeling_to_standing")
    expect(stanceClip(Stance.Standing, Stance.Prone)).toBe("rifle_kneeling_to_prone")
    expect(stanceClip(Stance.Prone, Stance.Standing)).toBe("rifle_prone_to_kneeling")
  })
})

describe("deathClip", () => {
  it("falls forward from prone, from a crouch when crouching, and eight ways from standing by id", () => {
    expect(deathClip(Stance.Prone, 3)).toBe("dying_from_a_prone_position")
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((id) => deathClip(Stance.Standing, id))).size).toBe(8)
    expect(deathClip(Stance.Standing, 9)).toBe(deathClip(Stance.Standing, 1))
    expect(new Set([0, 1, 2].map((id) => deathClip(Stance.Crouching, id))).size).toBe(3)
  })
})

describe("poseFrame", () => {
  const clip = { start: 100, frames: 24, fps: 24, turn: 0, spin: 0 }

  it("loops from a phase, at the pose's rate", () => {
    const walk = { clip: "rifle_walk_forward", mode: "loop", rate: 1 } as const
    expect(poseFrame(clip, walk, 0, 0)).toBe(100)
    expect(poseFrame(clip, walk, 0.5, 0)).toBe(112)
    expect(poseFrame(clip, walk, 1.25, 0)).toBe(106)
    expect(poseFrame(clip, walk, 0, 0.5)).toBe(112)
    expect(poseFrame(clip, { ...walk, rate: 2 }, 0.25, 0)).toBe(112)
  })

  it("plays once and holds the last frame, or holds the first", () => {
    const death = { clip: "dying_from_a_prone_position", mode: "once", rate: 1 } as const
    expect(poseFrame(clip, death, -1, 0.7)).toBe(100)
    expect(poseFrame(clip, death, 0.5, 0.7)).toBe(112)
    expect(poseFrame(clip, death, 60, 0.7)).toBe(123)
    expect(poseFrame(clip, { ...death, mode: "still" }, 0.5, 0.7)).toBe(100)
  })

  it("times a pose played once", () => {
    expect(poseSeconds(clip, { clip: "rifle_prone_hit_reaction", mode: "once", rate: 2 })).toBeCloseTo(0.5)
  })

  it("spreads a clip over the seconds its pose takes, whatever its rate", () => {
    const climb = { clip: "climb_over", mode: "once", rate: 1, seconds: 3 } as const
    expect(poseSeconds(clip, climb)).toBeCloseTo(3)
    // A second-long clip over three seconds: a third of the way through after one.
    expect(poseFrame(clip, climb, 1, 0)).toBe(108)
    expect(poseFrame(clip, climb, 2.9, 0)).toBe(123)
    expect(poseFrame(clip, { ...climb, rate: 4, seconds: 1.5 }, 0.75, 0)).toBe(112)
  })
})
