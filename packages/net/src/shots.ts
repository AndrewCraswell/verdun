import type { ShotEvent, SimSync } from "@verdun/sim"
import { type CellGrid, cellOf } from "./soldier-cells.ts"

/**
 * Shots, which are most of a battle's events, go to each player by where they matter (sync-codec.ts): every shot fired
 * from or landing in the cells near the player's men, and of the rest a thinned few, enough for the distant crackle
 * of the battle: one from each gun every `FAR_SHOT_SECONDS`, and no more than `FAR_SHOTS` of a stretch a message.
 * A player's go as one set of columns of numbers a message, positions in the soldiers' position units and heights in
 * centimetres: small enough that compressing them gains less than it costs.
 */

/** Of the shots far from a player's men, each gun is heard at most once in this many seconds. */
export const FAR_SHOT_SECONDS = 1.5
/** And of the shots between two far cells, no more than this many a message. */
export const FAR_SHOTS = 3

/** A shot's target as sent when it had none (-1). */
const NO_TARGET = 65_535

/** A step's shot, as taken out of the sync. */
export interface Shot {
  readonly tick: number
  readonly event: ShotEvent
}

/** The shots between two cells, from one to the other, in a message: all of them, and the few sent far. */
export interface ShotGroup {
  readonly from: number
  readonly to: number
  readonly all: readonly Shot[]
  readonly far: readonly Shot[]
}

/** Shots as columns, one entry a shot, as they go: see `shotColumns`. */
interface ShotColumns {
  /** How many steps before the message's own the shot was fired in. */
  readonly t: Uint8Array
  /** Shooter and target, the target `NO_TARGET` when there was none. */
  readonly s: Uint16Array
  readonly r: Uint16Array
  readonly h: Uint8Array
  /** From and to, x and z in position units, y in centimetres. */
  readonly p: Uint16Array
  readonly y: Int16Array
}

const isShot = (event: SimSync["steps"][number]["events"][number]): event is ShotEvent => event.type === "shot"

/** The sync's steps without their shots, and the shots apart. */
export function takeShots(steps: SimSync["steps"]): { steps: SimSync["steps"]; shots: Shot[] } {
  const shots: Shot[] = []
  const rest = steps.map((step) => ({
    tick: step.tick,
    events: step.events.filter((event) => {
      if (isShot(event)) {
        shots.push({ tick: step.tick, event })
        return false
      }
      return true
    })
  }))
  return { steps: rest, shots }
}

/** Groups the shots by the cells they're fired from and land in, and picks the few each group sends far. */
export function createShotThinning(grid: CellGrid, tickRate: number) {
  // The step each gun was last sent far.
  const lastFar = new Map<number, number>()
  return (shots: readonly Shot[]): ShotGroup[] => {
    const groups = new Map<number, { from: number; to: number; all: Shot[]; far: Shot[] }>()
    const cells = grid.columns * grid.rows
    for (const shot of shots) {
      const from = cellOf(grid, shot.event.from.x, shot.event.from.z)
      const to = cellOf(grid, shot.event.to.x, shot.event.to.z)
      const key = from * cells + to
      let group = groups.get(key)
      if (!group) {
        group = { from, to, all: [], far: [] }
        groups.set(key, group)
      }
      group.all.push(shot)
      const last = lastFar.get(shot.event.shooter)
      if (group.far.length < FAR_SHOTS && (last === undefined || shot.tick - last >= FAR_SHOT_SECONDS * tickRate)) {
        group.far.push(shot)
        lastFar.set(shot.event.shooter, shot.tick)
      }
    }
    return [...groups.values()]
  }
}

/** Shots as columns, for a message at `tick`, positions in `unit` metres. */
export function shotColumns(shots: readonly Shot[], tick: number, unit: number): ShotColumns {
  const position = (metres: number) => Math.min(65_535, Math.max(0, Math.round(metres / unit)))
  const height = (metres: number) => Math.min(32_767, Math.max(-32_768, Math.round(metres * 100)))
  const p = new Uint16Array(shots.length * 4)
  const y = new Int16Array(shots.length * 2)
  shots.forEach(({ event }, at) => {
    p.set([position(event.from.x), position(event.from.z), position(event.to.x), position(event.to.z)], at * 4)
    y.set([height(event.from.y), height(event.to.y)], at * 2)
  })
  return {
    t: Uint8Array.from(shots, (shot) => Math.min(255, tick - shot.tick)),
    s: Uint16Array.from(shots, (shot) => shot.event.shooter),
    r: Uint16Array.from(shots, (shot) => (shot.event.target < 0 ? NO_TARGET : shot.event.target)),
    h: Uint8Array.from(shots, (shot) => (shot.event.hit ? 1 : 0)),
    p,
    y
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

function isColumns(value: unknown): value is ShotColumns {
  if (!isRecord(value)) {
    return false
  }
  const { t, s, r, h, p, y } = value
  return (
    t instanceof Uint8Array &&
    s instanceof Uint16Array &&
    r instanceof Uint16Array &&
    h instanceof Uint8Array &&
    p instanceof Uint16Array &&
    y instanceof Int16Array &&
    s.length === t.length &&
    r.length === t.length &&
    h.length === t.length &&
    p.length === t.length * 4 &&
    y.length === t.length * 2
  )
}

/**
 * Puts the shots of `part`, a message's columns, back into the steps of a message at `tick`, each in its step, after
 * the step's other events. Steps the message didn't bring are added in order.
 */
export function putShots(steps: SimSync["steps"], part: unknown, tick: number, unit: number) {
  const byTick = new Map(steps.map((step) => [step.tick, [...step.events]]))
  if (!isColumns(part)) {
    throw new TypeError("The server sent shots this client can't read")
  }
  for (let at = 0; at < part.t.length; at++) {
    const shotTick = tick - (part.t[at] ?? 0)
    const point = (index: number) => ({
      x: (part.p[at * 4 + index * 2] ?? 0) * unit,
      y: (part.y[at * 2 + index] ?? 0) / 100,
      z: (part.p[at * 4 + index * 2 + 1] ?? 0) * unit
    })
    const shot: ShotEvent = {
      type: "shot",
      shooter: part.s[at] ?? -1,
      target: part.r[at] === NO_TARGET ? -1 : (part.r[at] ?? -1),
      hit: part.h[at] === 1,
      from: point(0),
      to: point(1)
    }
    const events = byTick.get(shotTick)
    if (events) {
      events.push(shot)
    } else {
      byTick.set(shotTick, [shot])
    }
  }
  return [...byTick].sort(([a], [b]) => a - b).map(([stepTick, events]) => ({ tick: stepTick, events }))
}
