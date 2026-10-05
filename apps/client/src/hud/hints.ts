import {
  concentrationAt,
  type EntityId,
  GAS_DETECTED,
  isAlive,
  isDark,
  MaskState,
  PINNED,
  type Simulation,
  type Squad,
  Stance,
  canRun,
  woundedIds
} from "@verdun/sim"
import type { KeyAction } from "../ui/keymap.ts"
import { keyOf } from "./keys.ts"

/**
 * Teaching by doing (H18 in docs/design/interface.md): short prompts, one at a time, each cleared when the player does
 * what it says, and a few that come up once the first time something happens. No tutorial level. Keys are written in
 * brackets, "[Tab]", for the view to draw as key caps.
 */

export interface Hint {
  readonly id: string
  readonly text: string
  /** For the prompts taught in order: which this is, counting from 1, and how many there are. Null for the others. */
  readonly step: { readonly index: number; readonly of: number } | null
}

/** Where the prompts already done are kept between visits. */
export interface HintStore {
  load(): readonly string[]
  save(done: readonly string[]): void
}

/** The browser's local storage, where it's allowed; elsewhere the prompts start afresh each visit. */
export function browserHintStore(key = "verdun.hints"): HintStore {
  return {
    load() {
      try {
        const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "[]")
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []
      } catch {
        return []
      }
    },
    save(done) {
      try {
        localStorage.setItem(key, JSON.stringify(done))
      } catch {
        // Storage blocked: the prompts come back next visit, which is harmless.
      }
    }
  }
}

/** The running prompts, to start over when the player asks for them again. */
const restarts = new Set<() => void>()

/**
 * Shows every prompt again from the first, as if the player were new: clears those done from the store and from every
 * running HUD. For the menu's "show the prompts again".
 */
export function resetHints(store: HintStore = browserHintStore()): void {
  store.save([])
  for (const restart of restarts) {
    restart()
  }
}

/** What the battle looked like when a prompt went up, to tell when the player has done what it asked. */
interface Start {
  readonly tick: number
  readonly leader: EntityId
  readonly x: number
  readonly z: number
  readonly grenades: number
  readonly order: string
  readonly missions: number
}

interface Lesson {
  readonly id: string
  readonly text: () => string
  /** When the player has done what it teaches; without one, the prompt is read and goes after a few seconds. */
  readonly done?: (sim: Simulation, squad: Squad, start: Start, view: HintView) => boolean
}

/** What the prompts know of how the player is looking at the battle. */
export interface HintView {
  /** The overview is up. */
  readonly overview: boolean
}

const orderKey = (squad: Squad) => JSON.stringify(squad.order)

/** A key as the prompts write it, "[F]", wherever the player has bound it. */
const key = (action: KeyAction) => `[${keyOf(action)}]`
const keys = (...actions: KeyAction[]) => actions.map(key).join(" ")

/** The prompts taught in order. */
const LESSONS: readonly Lesson[] = [
  {
    id: "move",
    text: () => `${keys("forward", "left", "back", "right")} move your man; the camera follows him. The pointer aims.`,
    done: (sim, squad, start) =>
      squad.leader === start.leader &&
      Math.hypot(sim.soldiers.position.x[start.leader] - start.x, sim.soldiers.position.z[start.leader] - start.z) > 4
  },
  {
    id: "fire",
    text: () => "[Left-click] fires. A red ring marks the man you would hit.",
    done: (sim, squad, start) => squad.leader >= 0 && sim.soldiers.weapon.firedAt[squad.leader] > start.tick
  },
  {
    id: "aim",
    text: () => "Hold the [Right button] to aim: the view leans toward the pointer."
  },
  {
    id: "prone",
    text: () => `${key("prone")} lies him down. Men in the open live longer on their bellies.`,
    done: (sim, squad) => squad.leader >= 0 && sim.soldiers.stance.value[squad.leader] === Stance.Prone
  },
  {
    id: "switch",
    text: () => `${key("next-soldier")} or [1]–[8] takes another man of the squad. Take the one with the best view.`,
    done: (sim, squad, start) => squad.leader >= 0 && squad.leader !== start.leader && isAlive(sim, start.leader)
  },
  {
    id: "orders",
    text: () =>
      `${key("follow")} the squad follows you, ${key("hold")} it holds, ` +
      `${key("advance")} sends it to the ground under the pointer.`,
    done: (_sim, squad, start) => orderKey(squad) !== start.order
  },
  {
    id: "overview",
    text: () =>
      `Hold ${key("overview")} for the sector: objectives, the hour and weather, strength and the guns. Tap it to keep it up.`,
    done: (_sim, _squad, _start, view) => view.overview
  },
  {
    id: "grenade",
    text: () =>
      `Hold ${key("throw")} to see where a grenade would go: its arc, its blast, how far you can throw. ` +
      "Let go to throw. Too low in a trench, it won't clear the parapet.",
    done: (sim, squad, start) =>
      squad.leader === start.leader && sim.soldiers.grenades.count[start.leader] < start.grenades
  },
  {
    id: "guns",
    text: () =>
      `Hold ${key("fire-mission")} to see where the guns would fall, and let go to call them; ${key("bombard")} bombards the enemy line.`,
    done: (sim, _squad, start) => sim.artillery.missions.length > start.missions
  },
  {
    id: "whistle",
    text: () => `${key("whistle")} blows the whistle: every squad goes over the top behind a creeping barrage.`,
    done: (_sim, squad) => squad.order.kind === "creep"
  }
]

/** The prompts that come up once, the first time something happens, and why. */
const MOMENTS: readonly {
  readonly id: string
  readonly text: () => string
  readonly when: (sim: Simulation, squad: Squad) => boolean
}[] = [
  {
    id: "gas",
    text: () => "Gas! Your men mask up on their own. A mask spoils the aim and slows a man down.",
    when: (sim, squad) =>
      squad.members.some((member) => isAlive(sim, member) && sim.soldiers.mask.state[member] !== MaskState.Off) ||
      (squad.leader >= 0 &&
        concentrationAt(sim.gas, sim.soldiers.position.x[squad.leader], sim.soldiers.position.z[squad.leader]) >=
          GAS_DETECTED)
  },
  {
    id: "pinned",
    text: () => `Pinned. Crawl out of it with ${key("prone")}, or keep your head down till the fire lifts.`,
    when: (sim, squad) => squad.leader >= 0 && sim.soldiers.suppression.value[squad.leader] >= PINNED
  },
  {
    id: "winded",
    text: () => "Out of breath. Walk, or stand still, to get it back before the rush.",
    when: (sim, squad) => squad.leader >= 0 && isAlive(sim, squad.leader) && !canRun(sim, squad.leader)
  },
  {
    id: "down",
    text: () => "A man down waits for the stretcher-bearers. Out in no man's land, they only go at night.",
    when: (sim, squad) => woundedIds(sim).some((soldier) => squad.members.includes(soldier))
  },
  {
    id: "creep",
    text: () => "Walk behind the barrage, about 70 m back. Run for the trench when it lifts.",
    when: (_sim, squad) => squad.order.kind === "creep"
  },
  {
    id: "night",
    text: () => "Night: you see little. Flares light no man's land, and muzzle flashes give men away.",
    when: (sim) => isDark(sim)
  }
]

/** Seconds before the first prompt, between prompts, and how long a one-off prompt stays up. */
const FIRST_DELAY = 3
const BETWEEN = 1.5
const MOMENT_SECONDS = 9

export interface Hints {
  /** The prompt up at a real moment, in seconds, if any, given how the player is looking. Call a few times a second. */
  read(now: number, view?: HintView): Hint | null
  /** Turns the prompts off, or back on. */
  enabled: boolean
}

export function createHints(sim: Simulation, squad: Squad, store: HintStore, started: number): Hints {
  const done = new Set(store.load())
  let showing: {
    readonly hint: Hint
    readonly lesson: Lesson | null
    readonly start: Start
    readonly since: number
  } | null = null
  let quietUntil = started + FIRST_DELAY
  let enabled = true
  restarts.add(() => {
    done.clear()
    showing = null
    quietUntil = -Infinity
  })

  function finish(id: string, now: number): void {
    done.add(id)
    store.save([...done])
    showing = null
    quietUntil = now + BETWEEN
  }

  function startOf(): Start {
    const leader = squad.leader
    return {
      tick: sim.tick,
      leader,
      x: leader >= 0 ? sim.soldiers.position.x[leader] : 0,
      z: leader >= 0 ? sim.soldiers.position.z[leader] : 0,
      grenades: leader >= 0 ? sim.soldiers.grenades.count[leader] : 0,
      order: orderKey(squad),
      missions: sim.artillery.missions.length
    }
  }

  return {
    get enabled() {
      return enabled
    },
    set enabled(on: boolean) {
      enabled = on
      if (!on) {
        showing = null
      }
    },
    read(now, view = { overview: false }) {
      if (!enabled) {
        return null
      }
      const moment = () => MOMENTS.find((candidate) => !done.has(candidate.id) && candidate.when(sim, squad))
      // Something happening now comes before the lesson up: the lesson goes up again afterwards.
      const urgent = showing?.lesson ? moment() : undefined
      if (urgent) {
        showing = {
          hint: { id: urgent.id, text: urgent.text(), step: null },
          lesson: null,
          start: startOf(),
          since: now
        }
      }
      if (showing) {
        const { lesson, hint, start, since } = showing
        const over = lesson?.done ? lesson.done(sim, squad, start, view) : now - since >= MOMENT_SECONDS
        if (over) {
          finish(hint.id, now)
        } else {
          return hint
        }
      }
      if (now < quietUntil) {
        return null
      }
      const happening = moment()
      if (happening) {
        showing = {
          hint: { id: happening.id, text: happening.text(), step: null },
          lesson: null,
          start: startOf(),
          since: now
        }
        return showing.hint
      }
      // The lessons need a man to teach with.
      const index = LESSONS.findIndex((lesson) => !done.has(lesson.id))
      const lesson = LESSONS[index]
      if (!lesson || squad.leader < 0 || !isAlive(sim, squad.leader)) {
        return null
      }
      showing = {
        hint: { id: lesson.id, text: lesson.text(), step: { index: index + 1, of: LESSONS.length } },
        lesson,
        start: startOf(),
        since: now
      }
      return showing.hint
    }
  }
}
