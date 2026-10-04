import { Stance, Weapon } from "@verdun/sim"
import { describe, expect, it } from "vitest"
import {
  choosePose,
  deathClip,
  headingClip,
  poseFrame,
  poseSeconds,
  type SoldierState,
  WALKS
} from "./soldier-animation.ts"

const standing: SoldierState = {
  status: "fighting",
  stance: Stance.Standing,
  weapon: Weapon.Rifle,
  speed: 0,
  heading: 0,
  aiming: false,
  pinned: false,
  broken: false,
  action: null,
  id: 0
}

const pose = (changes: Partial<SoldierState>) => choosePose({ ...standing, ...changes })

describe("headingClip", () => {
  it("picks the nearest of eight directions, clockwise from ahead", () => {
    expect(headingClip(WALKS, 0)).toBe("walk_forward")
    expect(headingClip(WALKS, Math.PI / 2)).toBe("walk_right")
    expect(headingClip(WALKS, -Math.PI / 2)).toBe("walk_left")
    expect(headingClip(WALKS, Math.PI)).toBe("walk_back")
    expect(headingClip(WALKS, -Math.PI)).toBe("walk_back")
    expect(headingClip(WALKS, 0.3)).toBe("walk_forward")
    expect(headingClip(WALKS, 0.5)).toBe("walk_forward_right")
    expect(headingClip(WALKS, -2.4)).toBe("walk_back_left")
  })
})

describe("choosePose", () => {
  it("stands idle, or aims with an enemy in sight", () => {
    expect(pose({})).toEqual({ clip: "idle", mode: "loop", rate: 1 })
    expect(pose({ aiming: true }).clip).toBe("idle_6")
  })

  it("walks or runs the way they move, faster clips for faster men", () => {
    const walk = pose({ speed: 1.4, heading: Math.PI / 2 })
    expect(walk.clip).toBe("walk_right")
    expect(walk.rate).toBeCloseTo(1)
    expect(pose({ speed: 0.7 }).rate).toBeCloseTo(0.6)
    expect(pose({ speed: 2.8, heading: Math.PI }).clip).toBe("run_back")
    // Moving outweighs firing on the move.
    expect(pose({ speed: 1.4, action: "fire" }).clip).toBe("walk_forward")
  })

  it("runs straight for it when broken, and cowers when broken and still", () => {
    expect(pose({ broken: true, speed: 1.4, heading: Math.PI }).clip).toBe("run_forward")
    expect(pose({ broken: true })).toEqual({ clip: "death_crouch_back", mode: "still", rate: 1 })
  })

  it("lies aiming when prone, crawling too, since there is no crawl clip", () => {
    expect(pose({ stance: Stance.Prone }).clip).toBe("idle_1")
    expect(pose({ stance: Stance.Prone, speed: 0.35 }).clip).toBe("idle_1")
    expect(pose({ stance: Stance.Prone, aiming: true }).clip).toBe("idle_2")
    expect(pose({ stance: Stance.Prone, action: "fire" }).clip).toBe("idle_2")
  })

  it("plays actions through once: recoil, a throw, a flinch", () => {
    expect(pose({ action: "fire", aiming: true })).toEqual({ clip: "brengun_fire", mode: "once", rate: 1 })
    expect(pose({ action: "throw" }).clip).toBe("stengun_reload")
    expect(pose({ action: "hit", pinned: true }).clip).toBe("hit_ribs")
  })

  it("keeps low when pinned, and crouches behind a machine gun", () => {
    expect(pose({ pinned: true, aiming: true }).clip).toBe("idle_5")
    expect(pose({ weapon: Weapon.MachineGun, aiming: true, action: "fire" }).clip).toBe("idle_3")
  })

  it("walks prisoners to the rear", () => {
    expect(pose({ status: "captured", speed: 1.2 }).clip).toBe("walk_forward")
    expect(pose({ status: "captured" }).clip).toBe("idle")
  })

  it("plays a death through once and holds it", () => {
    expect(pose({ status: "fallen", speed: 2 })).toEqual({ clip: deathClip(Stance.Standing, 0), mode: "once", rate: 1 })
  })
})

describe("deathClip", () => {
  it("falls forward from prone, and four ways from standing by id", () => {
    expect(deathClip(Stance.Prone, 3)).toBe("death_prone")
    expect(new Set([0, 1, 2, 3].map((id) => deathClip(Stance.Standing, id))).size).toBe(4)
    expect(deathClip(Stance.Standing, 5)).toBe(deathClip(Stance.Standing, 1))
  })
})

describe("poseFrame", () => {
  const clip = { start: 100, frames: 24, fps: 24 }

  it("loops from a phase, at the pose's rate", () => {
    const walk = { clip: "walk_forward", mode: "loop", rate: 1 } as const
    expect(poseFrame(clip, walk, 0, 0)).toBe(100)
    expect(poseFrame(clip, walk, 0.5, 0)).toBe(112)
    expect(poseFrame(clip, walk, 1.25, 0)).toBe(106)
    expect(poseFrame(clip, walk, 0, 0.5)).toBe(112)
    expect(poseFrame(clip, { ...walk, rate: 2 }, 0.25, 0)).toBe(112)
  })

  it("plays once and holds the last frame, or holds the first", () => {
    const death = { clip: "death_prone", mode: "once", rate: 1 } as const
    expect(poseFrame(clip, death, -1, 0.7)).toBe(100)
    expect(poseFrame(clip, death, 0.5, 0.7)).toBe(112)
    expect(poseFrame(clip, death, 60, 0.7)).toBe(123)
    expect(poseFrame(clip, { ...death, mode: "still" }, 0.5, 0.7)).toBe(100)
  })

  it("times a pose played once", () => {
    expect(poseSeconds(clip, { clip: "hit_ribs", mode: "once", rate: 2 })).toBeCloseTo(0.5)
  })
})
