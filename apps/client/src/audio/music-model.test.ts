import { describe, expect, it } from "vitest"
import {
  createMusicModel,
  isAttacking,
  MOOD_TRACKS,
  moodOf,
  type MusicCue,
  type MusicModel,
  type Situation
} from "./music-model.ts"

const ALL = Object.values(MOOD_TRACKS).flat()
const QUIET: Situation = { attacking: false, fighting: 0, daylight: 1 }
const ATTACK: Situation = { ...QUIET, attacking: true }

/** Steps the model a second at a time until it cues a track, or gives up after `limit` seconds. */
function next(model: MusicModel, situation: Situation, limit = 200): MusicCue | null {
  for (let second = 0; second < limit; second++) {
    const cue = model.update(1, situation, second === 0)
    if (cue) {
      return cue
    }
  }
  return null
}

describe("isAttacking", () => {
  const inTrench = (_x: number, z: number) => z < 100

  it("is over the top behind the barrage or on a raid", () => {
    expect(isAttacking({ kind: "creep", mission: 0, x: 0, standoff: 70, objectiveZ: 300 }, inTrench)).toBe(true)
    expect(isAttacking({ kind: "raid", x: 0, z: 300, homeX: 0, homeZ: 50, phase: "out" }, inTrench)).toBe(true)
  })

  it("is over the top advancing into the open, not moving along a trench", () => {
    expect(isAttacking({ kind: "advance", x: 0, z: 200 }, inTrench)).toBe(true)
    expect(isAttacking({ kind: "advance", x: 40, z: 50 }, inTrench)).toBe(false)
  })

  it("isn't while holding, following or in reserve", () => {
    for (const kind of ["hold", "follow", "reserve"] as const) {
      expect(isAttacking({ kind }, inTrench)).toBe(false)
    }
  })
})

describe("moodOf", () => {
  it("is the attack while the men are over the top, whatever else is going on", () => {
    expect(moodOf({ attacking: true, fighting: 1, daylight: 0 })).toBe("attack")
  })

  it("waits through quiet daylight, and dreads heavy fighting or the dark", () => {
    expect(moodOf(QUIET)).toBe("waiting")
    expect(moodOf({ ...QUIET, fighting: 0.5 })).toBe("dread")
    expect(moodOf({ ...QUIET, daylight: 0.1 })).toBe("dread")
  })
})

describe("createMusicModel", () => {
  it("opens on the theme after a moment's quiet", () => {
    const model = createMusicModel(ALL)
    expect(model.update(1, QUIET, false)).toBeNull()
    expect(model.update(1.5, QUIET, false)).toEqual({ track: "la-verdun", mood: "theme", fade: 3 })
    expect(model.playing).toBe("theme")
  })

  it("lets a track play out, then leaves a silence before the next", () => {
    const model = createMusicModel(ALL, () => 0)
    next(model, QUIET)
    expect(model.update(1, QUIET, false)).toBeNull()
    expect(model.update(1, QUIET, true)).toBeNull()
    expect(model.playing).toBeNull()
    // The shortest silence is 25 s, counted from the step the track ended.
    for (let second = 2; second < 25; second++) {
      expect(model.update(1, QUIET, false)).toBeNull()
    }
    expect(model.update(1, QUIET, false)?.mood).toBe("waiting")
  })

  it("cuts to an attack track at zero hour, and goes straight on to another while the attack lasts", () => {
    const model = createMusicModel(ALL)
    next(model, QUIET)
    const charge = model.update(0.1, ATTACK, false)
    expect(charge).toMatchObject({ mood: "attack", fade: 2.5 })
    expect(MOOD_TRACKS.attack).toContain(charge?.track)
    expect(model.update(0.1, ATTACK, false)).toBeNull()
    const second = model.update(0.1, ATTACK, true)
    expect(second?.mood).toBe("attack")
    expect(second?.track).not.toBe(charge?.track)
  })

  it("lets the attack's track finish after the men are back in a trench", () => {
    const model = createMusicModel(ALL)
    next(model, ATTACK)
    expect(model.update(1, QUIET, false)).toBeNull()
    expect(model.playing).toBe("attack")
  })

  it("opens on a track for the mood, after a silence, when the menu has played the theme", () => {
    const model = createMusicModel(ALL, () => 0, { theme: false })
    for (let second = 0; second < 24; second++) {
      expect(model.update(1, QUIET, false)).toBeNull()
    }
    expect(model.update(1, QUIET, false)?.mood).toBe("waiting")
  })

  it("skips the theme when the battle opens with an attack", () => {
    expect(next(createMusicModel(ALL), ATTACK)?.mood).toBe("attack")
  })

  it("chooses for the mood when a silence ends", () => {
    const model = createMusicModel(ALL)
    next(model, QUIET)
    const dread = next(model, { ...QUIET, fighting: 0.8 })
    expect(dread?.mood).toBe("dread")
    expect(MOOD_TRACKS.dread).toContain(dread?.track)
  })

  it("plays every track of a mood before repeating one, never the same twice running", () => {
    const model = createMusicModel(ALL)
    next(model, QUIET)
    const played = Array.from({ length: 9 }, () => next(model, { ...QUIET, fighting: 1 })?.track)
    expect(new Set(played.slice(0, 4))).toEqual(new Set(MOOD_TRACKS.dread))
    expect(new Set(played.slice(4, 8))).toEqual(new Set(MOOD_TRACKS.dread))
    for (let index = 1; index < played.length; index++) {
      expect(played[index]).not.toBe(played[index - 1])
    }
  })

  it("borrows from the tracks there are when a mood has none built", () => {
    const model = createMusicModel(["trench-dread"])
    expect(next(model, ATTACK)).toEqual({ track: "trench-dread", mood: "attack", fade: 3 })
  })

  it("stays silent without any tracks", () => {
    expect(next(createMusicModel([]), QUIET)).toBeNull()
  })
})
